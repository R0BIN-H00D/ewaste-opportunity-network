'use strict';
// Marketplace orders (FR-MKT-009/010). Payment is cash on delivery or offline: the platform records it but never handles
// money (BR-10). Stock is taken when the seller confirms an order, so two buyers cannot both receive the last item.
const { isValidObjectId } = require('mongoose');
const Order = require('../models/Order');
const MarketplaceProduct = require('../models/MarketplaceProduct');
const RefurbisherProfile = require('../models/RefurbisherProfile');
const Transaction = require('../models/Transaction');
const impact = require('./impactService');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { notify } = require('./notificationService');
const { serializeOrder } = require('../serializers/order');
const workflow = require('./workflow/order');

const { ACTORS } = workflow;
const idOf = (v) => String(v && v._id ? v._id : v);
const linkTo = (id) => `/dashboard/orders/${id}`;
const stale = () => ApiError.conflict('This order was just changed. Reload the page and try again.', 'STALE_STATE');
const entry = (status, by, note) => ({ status, at: new Date(), by, ...(note ? { note } : {}) });

const POPULATE = [
  { path: 'product', select: 'title condition photos price stock status category seller' },
  { path: 'buyer', select: 'name' },
  { path: 'seller', select: 'name' },
];

async function loadOrder(id) {
  if (!isValidObjectId(id)) throw ApiError.notFound('Order not found');
  const order = await Order.findById(id).populate(POPULATE);
  if (!order) throw ApiError.notFound('Order not found');
  return order;
}

function roleOf(order, user) {
  if (user.role === 'admin') return ACTORS.ADMIN;
  if (idOf(order.buyer) === user.id) return ACTORS.BUYER;
  if (idOf(order.seller) === user.id) return ACTORS.SELLER;
  return null;
}

/** Strangers get 404 so order ids cannot be probed. */
async function loadParticipant(id, user) {
  const order = await loadOrder(id);
  const role = roleOf(order, user);
  if (!role) throw ApiError.notFound('Order not found');
  return { order, role };
}

async function viewOf(order, user) {
  const profile = await RefurbisherProfile.findOne({ user: idOf(order.seller) }).select('businessName city').lean();
  return serializeOrder(order, { role: roleOf(order, user), profile });
}
const fetchView = async (id, user) => viewOf(await loadOrder(id), user);

/* ---------- placing and reading ---------- */

async function placeOrder(user, input) {
  if (!isValidObjectId(input.productId)) throw ApiError.notFound('Product not found');
  const product = await MarketplaceProduct.findById(input.productId).lean();
  if (!product || product.status === 'removed') throw ApiError.notFound('Product not found');
  if (String(product.seller) === user.id) throw ApiError.conflict('You cannot order your own product', 'OWN_PRODUCT');
  const seller = await RefurbisherProfile.findOne({ user: product.seller }).select('verification.status').lean();
  if (product.status !== 'active' || product.stock < 1 || seller?.verification?.status !== 'approved') {
    throw ApiError.conflict('This product is no longer available', 'PRODUCT_UNAVAILABLE');
  }
  if (input.quantity > product.stock) throw ApiError.conflict(`Only ${product.stock} left in stock`, 'OUT_OF_STOCK');
  const open = await Order.exists({ product: product._id, buyer: user.id, status: { $in: workflow.OPEN } });
  if (open) throw ApiError.conflict('You already have an open order for this product', 'ALREADY_ORDERED');

  const order = await Order.create({
    product: product._id,
    buyer: user.id,
    seller: product.seller,
    quantity: input.quantity,
    priceAtOrder: product.price,
    paymentMethod: input.paymentMethod,
    deliveryArea: input.deliveryArea,
    notes: input.notes,
    statusHistory: [entry('placed', user.id)],
  });
  await notify(product.seller, { type: 'order.placed', title: 'New order', body: product.title, data: { id: order._id, deepLink: linkTo(order._id) } });
  return fetchView(order._id, user);
}

async function listOrders(user, query) {
  const pg = parsePagination(query, { defaultLimit: 10 });
  const as = query.as || (user.role === 'refurbisher' ? 'seller' : 'buyer');
  const filter = { [as]: user.id, ...(query.status ? { status: query.status } : {}) };
  const [rows, total] = await Promise.all([
    Order.find(filter).populate(POPULATE).sort({ updatedAt: -1 }).skip(pg.skip).limit(pg.limit),
    Order.countDocuments(filter),
  ]);
  const role = as === 'seller' ? ACTORS.SELLER : ACTORS.BUYER;
  return { items: rows.map((o) => serializeOrder(o, { role, detail: false })), meta: buildMeta(pg, total) };
}

async function getOrder(id, user) {
  const { order } = await loadParticipant(id, user);
  return viewOf(order, user);
}

/* ---------- moving an order forward ---------- */

async function transition(order, to, user, role, extra = {}) {
  workflow.assertTransition(order.status, to, role);
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, status: order.status },
    { $set: { status: to, ...extra.set }, $push: { statusHistory: entry(to, user.id, extra.note) } },
    { new: true },
  );
  if (!updated) throw stale();
  return updated;
}

/** Seller confirms: the stock is taken here. A sold-out product leaves the marketplace and its other waiting orders are cancelled. */
async function confirmOrder(order, user, role) {
  workflow.assertTransition(order.status, 'confirmed', role);
  const taken = await MarketplaceProduct.findOneAndUpdate(
    { _id: idOf(order.product), status: 'active', stock: { $gte: order.quantity } },
    { $inc: { stock: -order.quantity } },
    { new: true },
  );
  if (!taken) throw ApiError.conflict('This product is not on sale or has too little stock to confirm this order', 'OUT_OF_STOCK');
  try {
    await transition(order, 'confirmed', user, role);
  } catch (err) {
    await MarketplaceProduct.updateOne({ _id: taken._id }, { $inc: { stock: order.quantity } });
    throw err;
  }
  if (taken.stock === 0) await soldOut(taken, order._id);
}

async function soldOut(product, exceptOrderId) {
  await MarketplaceProduct.updateOne({ _id: product._id, stock: 0 }, { $set: { status: 'sold' } });
  const waiting = await Order.find({ product: product._id, status: 'placed', _id: { $ne: exceptOrderId } }).select('buyer').lean();
  if (!waiting.length) return;
  const reason = 'The last item was sold to another buyer.';
  await Order.updateMany(
    { _id: { $in: waiting.map((w) => w._id) }, status: 'placed' },
    { $set: { status: 'cancelled', cancelReason: reason }, $push: { statusHistory: { status: 'cancelled', at: new Date(), note: reason } } },
  );
  await Promise.all(waiting.map((w) => notify(w.buyer, { type: 'order.cancelled', title: 'Order cancelled', body: `${product.title}: ${reason}`, data: { id: w._id, deepLink: linkTo(w._id) } })));
}

/** The buyer confirms receipt: the order is complete, the offline payment is recorded and the reuse counted (BR-05, BR-10). */
async function completeOrder(order, user, role) {
  const done = await transition(order, 'completed', user, role, { set: { paymentStatus: 'paid_offline' } });
  try {
    const total = done.priceAtOrder * done.quantity;
    const product = await MarketplaceProduct.findById(done.product).select('category').lean();
    await Promise.all([
      Transaction.create({ type: 'order', refType: 'Order', refId: done._id, payer: done.buyer, payee: done.seller, amount: total, method: done.paymentMethod, status: 'recorded' }),
      // Verified impact: written only now that the buyer confirmed they received the device (BR-05).
      impact.record({ user: done.seller, type: 'refurbishment', refType: 'Order', refId: done._id, category: product?.category, devices: done.quantity, verifiedBy: done.buyer }),
    ]);
  } catch (err) {
    logger.error({ err: err.message, orderId: String(done._id) }, 'order completion side effects failed');
  }
  return done;
}

const MESSAGES = {
  confirmed: ['order.confirmed', 'Your order was confirmed', 'buyer'],
  ready: ['order.ready', 'Your order is ready', 'buyer'],
  delivered: ['order.delivered', 'Your order was handed over: please confirm that you received it', 'buyer'],
  completed: ['order.completed', 'The buyer confirmed receipt', 'seller'],
};

async function changeStatus(id, user, { status }) {
  const { order, role } = await loadParticipant(id, user);
  if (status === 'confirmed') await confirmOrder(order, user, role);
  else if (status === 'completed') await completeOrder(order, user, role);
  else await transition(order, status, user, role);

  const [type, title, to] = MESSAGES[status];
  await notify(idOf(to === 'buyer' ? order.buyer : order.seller), { type, title, body: order.product?.title, data: { id: order._id, deepLink: linkTo(order._id) } });
  return fetchView(order._id, user);
}

/** Either side can cancel while allowed. A confirmed order gives its stock back, and a sold-out product goes back on sale. */
async function cancelOrder(id, user, { reason } = {}) {
  const { order, role } = await loadParticipant(id, user);
  const hadStock = workflow.STOCK_TAKEN.includes(order.status);
  await transition(order, 'cancelled', user, role, { note: reason, set: reason ? { cancelReason: reason } : {} });
  if (hadStock) {
    await MarketplaceProduct.updateOne({ _id: idOf(order.product) }, { $inc: { stock: order.quantity } });
    await MarketplaceProduct.updateOne({ _id: idOf(order.product), status: 'sold', stock: { $gt: 0 } }, { $set: { status: 'active' } });
  }
  const other = idOf(role === ACTORS.BUYER ? order.seller : order.buyer);
  await notify(other, { type: 'order.cancelled', title: 'Order cancelled', body: order.product?.title, data: { id: order._id, deepLink: linkTo(order._id) } });
  return fetchView(order._id, user);
}

module.exports = { placeOrder, listOrders, getOrder, changeStatus, cancelOrder };
