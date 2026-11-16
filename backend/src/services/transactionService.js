'use strict';
// Transaction history (FR-TXN-*). Records only: the platform never processes money (BR-10). A transaction is written when a
// service is confirmed complete; the person who was paid can later mark the offline payment as received.
const mongoose = require('mongoose');
const { isValidObjectId } = mongoose;
const Transaction = require('../models/Transaction');
const ServiceRequest = require('../models/ServiceRequest');
const Donation = require('../models/Donation');
const RefurbishmentJob = require('../models/RefurbishmentJob');
const Order = require('../models/Order');
const ApiError = require('../utils/ApiError');
const { parsePagination, buildMeta } = require('../utils/pagination');

const idOf = (v) => String(v && v._id ? v._id : v);

/** What a transaction was for, so the history page can link back to it. */
async function subjectsFor(rows) {
  const serviceIds = rows.filter((t) => t.refType === 'ServiceRequest').map((t) => t.refId);
  const requests = serviceIds.length ? await ServiceRequest.find({ _id: { $in: serviceIds } }).select('listing').populate('listing', 'title').lean() : [];
  const byId = new Map(requests.map((r) => [String(r._id), r]));
  const donationIds = rows.filter((t) => t.refType === 'Donation').map((t) => t.refId);
  const donations = donationIds.length ? await Donation.find({ _id: { $in: donationIds } }).select('listing').populate('listing', 'title').lean() : [];
  const donationById = new Map(donations.map((d) => [String(d._id), d]));
  const jobIds = rows.filter((t) => t.refType === 'RefurbishmentJob').map((t) => t.refId);
  const jobs = jobIds.length ? await RefurbishmentJob.find({ _id: { $in: jobIds } }).select('listing').populate('listing', 'title').lean() : [];
  const jobById = new Map(jobs.map((j) => [String(j._id), j]));
  const orderIds = rows.filter((t) => t.refType === 'Order').map((t) => t.refId);
  const orders = orderIds.length ? await Order.find({ _id: { $in: orderIds } }).select('product').populate('product', 'title').lean() : [];
  const orderById = new Map(orders.map((o) => [String(o._id), o]));
  return (t) => {
    if (t.refType === 'ServiceRequest') {
      const r = byId.get(String(t.refId));
      return { kind: 'repair', id: String(t.refId), title: r?.listing?.title || 'Repair service', link: `/dashboard/requests/${t.refId}` };
    }
    if (t.refType === 'Donation') {
      const d = donationById.get(String(t.refId));
      return { kind: 'donation', id: String(t.refId), title: d?.listing?.title || 'Donation', link: `/dashboard/donations/${t.refId}` };
    }
    if (t.refType === 'RefurbishmentJob') {
      const j = jobById.get(String(t.refId));
      return { kind: 'refurbishment', id: String(t.refId), title: j?.listing?.title || 'Refurbishment', link: `/dashboard/refurbishment/${t.refId}` };
    }
    if (t.refType === 'Order') {
      const o = orderById.get(String(t.refId));
      return { kind: 'order', id: String(t.refId), title: o?.product?.title || 'Marketplace order', link: `/dashboard/orders/${t.refId}` };
    }
    return { kind: String(t.type), id: String(t.refId), title: String(t.type).replace(/_/g, ' ') };
  };
}

function serialize(t, userId, subjectOf) {
  const payee = idOf(t.payee) === userId;
  const other = payee ? t.payer : t.payee;
  return {
    _id: t._id,
    type: t.type,
    amount: t.amount,
    method: t.method,
    status: t.status,
    reference: t.reference,
    direction: payee ? 'received' : 'paid',
    counterparty: other && other._id ? { _id: other._id, name: other.name } : null,
    subject: subjectOf(t),
    canConfirm: payee && t.status === 'recorded',
    createdAt: t.createdAt,
  };
}

async function listTransactions(user, query) {
  const pg = parsePagination(query, { defaultLimit: 10 });
  const mine = { $or: [{ payer: user.id }, { payee: user.id }] };
  const filter = { ...(query.direction === 'paid' ? { payer: user.id } : query.direction === 'received' ? { payee: user.id } : mine), ...(query.type ? { type: query.type } : {}), ...(query.status ? { status: query.status } : {}) };
  const [rows, total] = await Promise.all([
    Transaction.find(filter).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit).populate('payer', 'name').populate('payee', 'name').lean(),
    Transaction.countDocuments(filter),
  ]);
  const subjectOf = await subjectsFor(rows);
  return { items: rows.map((t) => serialize(t, user.id, subjectOf)), meta: buildMeta(pg, total) };
}

/** Totals for the signed-in person. Disputed records are left out of the sums. */
async function summary(user) {
  const uid = new mongoose.Types.ObjectId(user.id);
  const total = async (field) => {
    const [row] = await Transaction.aggregate([
      { $match: { [field]: uid, type: { $ne: 'donation' }, status: { $in: ['recorded', 'confirmed'] } } }, // a free donation is not a payment
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);
    return { count: row?.count || 0, total: row?.total || 0 };
  };
  const [received, paid, awaiting] = await Promise.all([total('payee'), total('payer'), Transaction.countDocuments({ payee: uid, status: 'recorded' })]);
  return { received, paid, awaitingConfirmation: awaiting };
}

/** The person who was paid confirms the offline payment arrived, optionally with a reference (FR-TXN-001). */
async function confirmPayment(user, id, { reference } = {}) {
  if (!isValidObjectId(id)) throw ApiError.notFound('Transaction not found');
  const updated = await Transaction.findOneAndUpdate(
    { _id: id, payee: user.id, status: 'recorded' },
    { $set: { status: 'confirmed', confirmedBy: user.id, ...(reference ? { reference } : {}) } },
    { new: true },
  ).populate('payer', 'name').populate('payee', 'name').lean();
  if (updated && updated.refType === 'Order') await Order.updateOne({ _id: updated.refId }, { $set: { paymentStatus: 'confirmed' } });
  if (!updated) {
    const existing = await Transaction.findById(id).select('payer payee status').lean();
    if (!existing || ![idOf(existing.payer), idOf(existing.payee)].includes(user.id)) throw ApiError.notFound('Transaction not found');
    if (idOf(existing.payee) !== user.id) throw ApiError.forbidden('Only the person who was paid can confirm this payment');
    throw ApiError.conflict('This payment is already confirmed', 'INVALID_TRANSITION');
  }
  return serialize(updated, user.id, await subjectsFor([updated]));
}

module.exports = { listTransactions, summary, confirmPayment };
