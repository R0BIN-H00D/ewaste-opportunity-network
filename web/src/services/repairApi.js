import { api } from './api';

const data = (promise) => promise.then((res) => res.data.data);
const page = (promise) => promise.then((r) => ({ items: r.data.data, meta: r.data.meta }));
const clean = (params) => Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v !== '' && v !== undefined && v !== null));
const UPLOAD = { timeout: 120000 };

// Technician directory and recommendations (FR-MATCH-*)
export const technicianApi = {
  list: (params, signal) => page(api.get('/technicians', { params: clean(params), signal })),
  get: (id, signal) => data(api.get(`/technicians/${id}`, { signal })),
  setAvailability: (status) => data(api.put('/technicians/availability', { status })),
  recommendations: (listingId, signal) => api.get('/matching/recommendations', { params: { listingId }, signal }).then((r) => r.data.data),
};

// Repair requests (FR-SVC-*)
export const requestApi = {
  create: (body) => data(api.post('/service-requests', body)),
  list: (params, signal) => page(api.get('/service-requests', { params: clean(params), signal })),
  get: (id, signal) => data(api.get(`/service-requests/${id}`, { signal })),
  // Simple status moves. `photos` (File[]) is only used when completing the repair.
  setStatus: (id, status, { note, photos = [] } = {}) => data(api.put(`/service-requests/${id}/status`, toForm({ status, note }, photos), UPLOAD)),
  quote: (id, body) => data(api.post(`/service-requests/${id}/quotation`, body)),
  quotations: (id, signal) => data(api.get(`/service-requests/${id}/quotations`, { signal })),
  decide: (id, quotationId, body) => data(api.put(`/service-requests/${id}/quotation/${quotationId}/decision`, body)),
  progress: (id, { note, photos = [] }) => data(api.post(`/service-requests/${id}/progress`, toForm({ note }, photos), UPLOAD)),
  pickup: (id, body) => data(api.post(`/service-requests/${id}/pickup`, body)),
  handover: (id, body = {}) => data(api.post(`/service-requests/${id}/handover`, body)),
  confirmCompletion: (id) => data(api.post(`/service-requests/${id}/confirm-completion`)),
  cancel: (id, reason) => data(api.post(`/service-requests/${id}/cancel`, reason ? { reason } : {})),
};

// Reviews and transaction history (FR-REV-*, FR-TXN-*)
export const reviewApi = {
  list: (params, signal) => api.get('/reviews', { params: clean(params), signal }).then((r) => ({ items: r.data.data, meta: r.data.meta })),
  create: (body) => data(api.post('/reviews', body)),
};

export const transactionApi = {
  list: (params, signal) => page(api.get('/transactions', { params: clean(params), signal })),
  summary: (signal) => data(api.get('/transactions/summary', { signal })),
  confirm: (id, body = {}) => data(api.put(`/transactions/${id}/confirm`, body)),
};

function toForm(values, photos) {
  const form = new FormData();
  for (const [key, value] of Object.entries(values || {})) {
    if (value === undefined || value === null || value === '') continue;
    form.append(key, value);
  }
  photos.forEach((file) => form.append('photos', file));
  return form;
}
