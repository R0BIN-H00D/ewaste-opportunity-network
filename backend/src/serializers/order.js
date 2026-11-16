'use strict';
// Shapes an Order for one viewer. Delivery is described by area only; the seller sees the buyer's name and note,
// and exact contact details are shared through chat once it opens (BR-08).
const { availableActions } = require('../services/workflow/order');

const idOf = (v) => String(v && v._id ? v._id : v);

function serializeOrder(o, { role, profile, detail = true } = {}) {
  const product = o.product && o.product._id
    ? {
        _id: o.product._id,
        title: o.product.title,
        condition: o.product.condition,
        photo: o.product.photos?.[0] || null,
        isRefurbished: true,
        label: 'Refurbished',
      }
    : { _id: idOf(o.product) };
  const out = {
    _id: o._id,
    status: o.status,
    product,
    quantity: o.quantity,
    priceAtOrder: o.priceAtOrder,
    total: o.priceAtOrder * o.quantity,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    buyer: o.buyer && o.buyer._id ? { _id: o.buyer._id, name: o.buyer.name } : { _id: idOf(o.buyer) },
    seller: {
      ...(o.seller && o.seller._id ? { _id: o.seller._id, name: o.seller.name } : { _id: idOf(o.seller) }),
      ...(profile ? { businessName: profile.businessName, city: profile.city } : {}),
    },
    viewerRole: role,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
  if (!detail) return out;
  out.deliveryArea = o.deliveryArea;
  out.notes = o.notes;
  out.cancelReason = o.cancelReason;
  out.reviewed = Boolean(o.reviewed);
  out.history = (o.statusHistory || []).map((h) => ({ status: h.status, at: h.at, note: h.note }));
  out.actions = availableActions(o, role);
  out.canReview = role === 'buyer' && o.status === 'completed' && !o.reviewed;
  return out;
}

module.exports = { serializeOrder };
