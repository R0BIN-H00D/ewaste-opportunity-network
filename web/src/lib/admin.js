// Words and colours the administrator screens share.
export const ROLE_LABEL = {
  user: 'Member',
  technician: 'Technician',
  refurbisher: 'Refurbisher',
  recycler: 'Recycling centre',
  admin: 'Administrator',
};
export const ROLES = Object.entries(ROLE_LABEL);
export const PROVIDER_ROLES = ROLES.filter(([r]) => ['technician', 'refurbisher', 'recycler'].includes(r));

export const ACCOUNT_STATUS = {
  active: ['Active', 'green'],
  pending_verification: ['Waiting for verification', 'amber'],
  suspended: ['Suspended', 'red'],
  deleted: ['Deleted', 'neutral'],
};
export const accountLabel = (s) => ACCOUNT_STATUS[s]?.[0] || String(s || '').replace(/_/g, ' ');
export const accountTone = (s) => ACCOUNT_STATUS[s]?.[1] || 'neutral';

export const VERIFICATION = {
  not_submitted: ['Nothing submitted', 'neutral'],
  pending: ['Waiting for review', 'amber'],
  approved: ['Approved', 'green'],
  rejected: ['Not approved', 'red'],
  resubmission_required: ['Needs new documents', 'amber'],
};
export const verificationLabel = (s) => VERIFICATION[s]?.[0] || String(s || '').replace(/_/g, ' ');
export const verificationTone = (s) => VERIFICATION[s]?.[1] || 'neutral';

export const DOC_LABEL = {
  id_proof: 'ID proof',
  qualification: 'Qualification',
  business: 'Business registration',
  authorization: 'Authorisation',
  other: 'Other document',
};
export const docLabel = (t) => DOC_LABEL[t] || String(t || '').replace(/_/g, ' ');

export const ORG_TYPE = { school: 'School', college: 'College', ngo: 'NGO', trust: 'Trust', company: 'Company', other: 'Other' };

export function fileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const LISTING_STATUS = {
  draft: ['Draft', 'neutral'],
  listed: ['Live', 'green'],
  in_service: ['In service', 'blue'],
  completed: ['Completed', 'neutral'],
  withdrawn: ['Withdrawn', 'amber'],
  removed_by_admin: ['Removed', 'red'],
};
export const listingStatusLabel = (s) => LISTING_STATUS[s]?.[0] || monitorStatusLabel(s);
export const listingStatusTone = (s) => LISTING_STATUS[s]?.[1] || 'neutral';

export const REVIEW_STATUS = { visible: ['Visible', 'green'], hidden: ['Hidden', 'amber'], removed: ['Removed', 'red'] };
export const reviewStatusLabel = (s) => REVIEW_STATUS[s]?.[0] || monitorStatusLabel(s);
export const reviewStatusTone = (s) => REVIEW_STATUS[s]?.[1] || 'neutral';

export const REPORT_REASON = { spam: 'Spam', inappropriate: 'Inappropriate', fraud: 'Suspected fraud', unsafe: 'Unsafe', wrong_category: 'Wrong category', other: 'Other' };
export const REPORT_TARGET = { listing: 'Listing', review: 'Review', product: 'Product', user: 'Person' };
export const REPORT_STATUS = { open: ['Waiting', 'amber'], actioned: ['Handled', 'green'], dismissed: ['Dismissed', 'neutral'] };

/** The read-only lists under Monitors, in the order they are offered. */
export const MONITORS = [
  ['repairs', 'Repairs'],
  ['donations', 'Donations'],
  ['refurbishment', 'Refurbishment'],
  ['recycling', 'Recycling'],
  ['transactions', 'Payments'],
];
const DONE = ['service_completed', 'completed', 'listed', 'confirmed'];
const STOPPED = ['rejected', 'cancelled', 'disputed'];
export const monitorStatusLabel = (s) => {
  const text = String(s || '').replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
};
export const monitorStatusTone = (s) => (DONE.includes(s) ? 'green' : STOPPED.includes(s) ? 'red' : 'blue');

/** Audit actions in plain words. */
const ACTION_LABEL = {
  'user.suspended': 'Suspended the account',
  'user.reactivated': 'Reactivated the account',
  'verification.approved': 'Approved the submission',
  'verification.rejected': 'Refused the submission',
  'verification.resubmission_required': 'Asked for new documents',
  'verification.document_viewed': 'Opened a document',
  'listing.removed': 'Removed the listing',
  'listing.restored': 'Restored the listing',
  'product.removed': 'Removed the product',
  'review.hidden': 'Hid the review',
  'review.removed': 'Removed the review',
  'review.restored': 'Restored the review',
  'report.actioned': 'Handled the report',
  'report.dismissed': 'Dismissed the report',
  'category.created': 'Added the category',
  'category.updated': 'Edited the category',
  'category.activated': 'Switched the category on',
  'category.deactivated': 'Switched the category off',
  'category.reordered': 'Reordered the categories',
  'category.deleted': 'Deleted the category',
  'complaint.assigned': 'Took the complaint',
  'complaint.review_started': 'Started reviewing the complaint',
  'complaint.resolved': 'Resolved the complaint',
  'complaint.rejected': 'Rejected the complaint',
  'announcement.created': 'Published an announcement',
  'announcement.updated': 'Edited an announcement',
  'announcement.deleted': 'Deleted an announcement',
  'export.downloaded': 'Downloaded a data file',
};
export const actionLabel = (a) => ACTION_LABEL[a] || String(a || '').replace(/[._]/g, ' ');

/** What the audit log's "target" kinds are called, and where an administrator can open one. */
const TARGET_LABEL = { User: 'Account', user: 'Account', verification: 'Verification', VerificationDocument: 'Document', DeviceListing: 'Listing', MarketplaceProduct: 'Product', Review: 'Review', Report: 'Report', Category: 'Category', Complaint: 'Complaint', Announcement: 'Announcement', Export: 'Data file', Certificate: 'Certificate' };
export const auditTargetLabel = (t) => TARGET_LABEL[t] || String(t || '');
export const auditTargetLink = (type, id) => {
  if (!id) return '';
  return ({
    User: `/dashboard/admin/users/${id}`,
    user: `/dashboard/admin/users/${id}`,
    verification: `/dashboard/admin/verifications/${id}`,
    DeviceListing: `/devices/${id}`,
    MarketplaceProduct: `/marketplace/${id}`,
    Complaint: `/dashboard/admin/complaints/${id}`,
    Report: '/dashboard/admin/reports?status=all',
    Review: '/dashboard/admin/reviews',
    Category: '/dashboard/admin/categories',
    Announcement: '/dashboard/admin/announcements',
  })[type] || '';
};
