'use strict';
// Shapes a MarketplaceProduct for the public marketplace or for its seller. Every product carries the "Refurbished"
// label and its disclosed condition (BR-11). Sellers show their business name and city only, never an address (BR-08).
const idOf = (v) => String(v && v._id ? v._id : v);

function serializeSeller(user, profile) {
  return {
    _id: idOf(user),
    name: user && user.name ? user.name : undefined,
    businessName: profile?.businessName,
    city: profile?.city,
    ratingAvg: profile?.ratingAvg ?? 0,
    ratingCount: profile?.ratingCount ?? 0,
  };
}

/**
 * @param p        product (seller populated with name, category populated)
 * @param opts     { profile, viewerId, role, detail }
 */
function serializeProduct(p, { profile, viewerId, role, detail = false } = {}) {
  const isMine = Boolean(viewerId) && idOf(p.seller) === String(viewerId);
  const out = {
    _id: p._id,
    title: p.title,
    brand: p.brand,
    model: p.model,
    condition: p.condition,
    price: p.price,
    stock: p.stock,
    photos: p.photos || [],
    category: p.category && p.category._id ? { _id: p.category._id, name: p.category.name, slug: p.category.slug, icon: p.category.icon } : p.category,
    status: p.status,
    isRefurbished: true,
    label: 'Refurbished',
    seller: serializeSeller(p.seller, profile),
    createdAt: p.createdAt,
  };
  if (isMine || role === 'admin') out.isMine = isMine;
  if (!detail) return out;
  out.specs = p.specs || {};
  out.refurbishmentInfo = p.refurbishmentInfo;
  out.conditionDetails = p.conditionDetails && typeof p.conditionDetails.toObject === 'function' ? p.conditionDetails.toObject() : p.conditionDetails || {};
  out.conditionNote = p.conditionNote;
  out.updatedAt = p.updatedAt;
  if (isMine || role === 'admin') out.refurbishmentJob = p.refurbishmentJob ? idOf(p.refurbishmentJob) : null;
  return out;
}

module.exports = { serializeProduct, serializeSeller };
