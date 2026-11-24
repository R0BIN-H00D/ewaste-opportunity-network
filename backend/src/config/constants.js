'use strict';
// Shared enums. Keep in sync with docs/requirements.md and mirror in web/mobile constants.
const ROLES = Object.freeze({
  USER: 'user',
  TECHNICIAN: 'technician',
  REFURBISHER: 'refurbisher',
  RECYCLER: 'recycler',
  ADMIN: 'admin',
});
const SELF_REGISTER_ROLES = [ROLES.USER, ROLES.TECHNICIAN, ROLES.REFURBISHER, ROLES.RECYCLER];
const PROVIDER_ROLES = [ROLES.TECHNICIAN, ROLES.REFURBISHER, ROLES.RECYCLER];

const ACCOUNT_STATUS = Object.freeze({
  ACTIVE: 'active',
  PENDING: 'pending_verification',
  SUSPENDED: 'suspended',
  DELETED: 'deleted',
});

const VERIFICATION_STATUS = ['not_submitted', 'pending', 'approved', 'rejected', 'resubmission_required'];
const DOC_TYPES = ['id_proof', 'qualification', 'business', 'authorization', 'other'];

const CONDITIONS = ['fully_working', 'minor_damage', 'major_damage', 'not_working', 'for_spare_parts'];
const SERVICES = ['repair', 'reuse', 'donation', 'refurbishment', 'recycling'];

// How each part of a device is doing, chosen from short lists (all optional). The apps show only the parts that fit the category.
const CONDITION_PARTS = {
  power: ['works_normally', 'unstable', 'does_not_turn_on'],
  screen: ['no_damage', 'scratched', 'cracked', 'faulty'],
  battery: ['holds_well', 'drains_fast', 'needs_replacing', 'swollen', 'missing'],
  body: ['like_new', 'scratched_or_dented', 'cracked_or_bent', 'parts_missing'],
  charging: ['normal', 'slow', 'not_charging', 'port_damaged'],
  ports: ['all_work', 'some_faulty'],
  sound: ['works', 'faulty'],
  camera: ['works', 'faulty'],
  water: ['none', 'suspected', 'damaged'],
};

// Which parts make sense for which category (a category not listed gets the basics), and which of them must be answered
// before a device goes live. A part that does not fit the category is never required.
const ALL_PARTS = Object.keys(CONDITION_PARTS);
const CONDITION_PARTS_BY_CATEGORY = {
  laptop: ALL_PARTS, smartphone: ALL_PARTS, tablet: ALL_PARTS,
  'desktop-computer': ['power', 'body', 'ports', 'sound', 'water'],
  monitor: ['power', 'screen', 'body', 'ports', 'sound', 'water'],
  television: ['power', 'screen', 'body', 'ports', 'sound', 'water'],
  keyboard: ['body', 'ports', 'water'], mouse: ['body', 'ports', 'water'],
  printer: ['power', 'body', 'ports', 'water'], charger: ['power', 'body', 'ports'], battery: ['battery', 'body'],
};
const DEFAULT_CONDITION_PARTS = ['power', 'body', 'water'];
const REQUIRED_CONDITION_PARTS = ['battery', 'screen', 'ports', 'water'];
const partsForCategory = (slug) => CONDITION_PARTS_BY_CATEGORY[slug] || DEFAULT_CONDITION_PARTS;
const requiredPartsForCategory = (slug) => partsForCategory(slug).filter((p) => REQUIRED_CONDITION_PARTS.includes(p));
const LISTING_STATUS = ['draft', 'listed', 'in_service', 'completed', 'withdrawn', 'removed_by_admin'];
const MAX_DEVICE_PHOTOS = 6;

// name, slug, icon (Lucide), hazardous (design default)
const CATEGORY_SEED = [
  ['Laptop', 'laptop', 'laptop', false],
  ['Desktop computer', 'desktop-computer', 'monitor-smartphone', false],
  ['Smartphone', 'smartphone', 'smartphone', false],
  ['Tablet', 'tablet', 'tablet', false],
  ['Monitor', 'monitor', 'monitor', true],
  ['Television', 'television', 'tv', true],
  ['Keyboard', 'keyboard', 'keyboard', false],
  ['Mouse', 'mouse', 'mouse', false],
  ['Printer', 'printer', 'printer', false],
  ['Charger', 'charger', 'plug', false],
  ['Battery', 'battery', 'battery', true],
  ['Electronic accessories', 'electronic-accessories', 'cable', false],
  ['Circuit boards', 'circuit-boards', 'cpu', true],
  ['Computer components', 'computer-components', 'hard-drive', false],
  ['Other electronic devices', 'other-electronic-devices', 'box', false],
];

const SERVICE_REQUEST_STATUS = [
  'request_submitted', 'technician_assigned', 'device_collection_pending', 'device_collected',
  'diagnosis_in_progress', 'quotation_submitted', 'customer_approval_pending', 'repair_in_progress',
  'repair_completed', 'device_delivery_pending', 'device_delivered', 'service_completed',
  'rejected', 'cancelled',
];
const QUOTATION_STATUS = ['submitted', 'accepted', 'rejected', 'expired', 'superseded'];
const PICKUP_STATUS = ['requested', 'confirmed', 'rescheduled', 'collected', 'cancelled'];
const DONATION_STATUS = ['open', 'requested', 'accepted', 'handover_scheduled', 'completed', 'cancelled'];
const DONATION_REQUEST_STATUS = ['pending', 'accepted', 'rejected', 'withdrawn'];
const REFURB_JOB_STATUS = ['offered', 'accepted', 'collected', 'assessment', 'in_progress', 'testing', 'ready_to_list', 'listed', 'cancelled'];
const PRODUCT_STATUS = ['active', 'sold', 'hidden', 'removed'];
const PRODUCT_CONDITIONS = ['like_new', 'excellent', 'good', 'fair']; // disclosed grade of a refurbished product (BR-11)
const ORDER_STATUS = ['placed', 'confirmed', 'ready', 'delivered', 'completed', 'cancelled'];
const RECYCLING_STATUS = ['requested', 'accepted', 'pickup_scheduled', 'collected', 'received_at_center', 'processed', 'completed', 'rejected', 'cancelled'];
const MATERIAL_TYPES = ['copper', 'aluminium', 'iron', 'plastics', 'glass', 'other'];
const COMPLAINT_STATUS = ['open', 'assigned', 'in_review', 'resolved', 'rejected'];
const IMPACT_TYPES = ['repair', 'reuse', 'donation', 'refurbishment', 'recycling'];

module.exports = {
  ROLES, SELF_REGISTER_ROLES, PROVIDER_ROLES, ACCOUNT_STATUS, VERIFICATION_STATUS, DOC_TYPES,
  CONDITIONS, CONDITION_PARTS, partsForCategory, requiredPartsForCategory, SERVICES, LISTING_STATUS, MAX_DEVICE_PHOTOS, CATEGORY_SEED,
  SERVICE_REQUEST_STATUS, QUOTATION_STATUS, PICKUP_STATUS, DONATION_STATUS, DONATION_REQUEST_STATUS,
  REFURB_JOB_STATUS, PRODUCT_STATUS, PRODUCT_CONDITIONS, ORDER_STATUS, RECYCLING_STATUS, MATERIAL_TYPES,
  COMPLAINT_STATUS, IMPACT_TYPES,
};
