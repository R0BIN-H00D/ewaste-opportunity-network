// Words for complaints, shared by the person's pages and the administrators' pages.
export const COMPLAINT_STATUS = {
  open: ['Waiting', 'amber'],
  assigned: ['Picked up', 'blue'],
  in_review: ['Being reviewed', 'blue'],
  resolved: ['Resolved', 'green'],
  rejected: ['Rejected', 'neutral'],
};
export const complaintLabel = (s) => COMPLAINT_STATUS[s]?.[0] || String(s || '');
export const complaintTone = (s) => COMPLAINT_STATUS[s]?.[1] || 'neutral';

export const COMPLAINT_ABOUT = {
  service: 'A repair or other service',
  order: 'An order',
  listing: 'A listing',
  recycling: 'A recycling request',
  donation: 'A donation',
  user: 'A person',
  other: 'Something else',
};

export const isClosed = (status) => status === 'resolved' || status === 'rejected';
