import { api } from './api';

const data = (promise) => promise.then((res) => res.data.data);
const page = (promise) => promise.then((r) => ({ items: r.data.data, meta: r.data.meta }));
const clean = (params) => Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v !== '' && v !== undefined && v !== null));

// Donations (FR-DON-*)
export const donationApi = {
  list: (params, signal) => page(api.get('/donations', { params: clean(params), signal })),
  get: (id, signal) => data(api.get(`/donations/${id}`, { signal })),
  create: (body) => data(api.post('/donations', body)),
  request: (id, body) => data(api.post(`/donations/${id}/request`, body)),
  withdraw: (id) => data(api.delete(`/donations/${id}/request`)),
  decide: (id, requestId, decision) => data(api.put(`/donations/${id}/requests/${requestId}/decision`, { decision })),
  handover: (id, body) => data(api.post(`/donations/${id}/handover`, body)),
  confirmHandover: (id, body = {}) => data(api.post(`/donations/${id}/confirm-handover`, body)),
  cancel: (id, reason) => data(api.post(`/donations/${id}/cancel`, reason ? { reason } : {})),
  confirmation: (id, signal) => data(api.get(`/donations/${id}/confirmation`, { signal })),
};

// Recipient organisations (A-02)
export const recipientApi = {
  status: (signal) => data(api.get('/donations/recipient', { signal })),
  apply: (body) => data(api.put('/donations/recipient', body)),
};
