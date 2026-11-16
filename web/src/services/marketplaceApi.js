import { api } from './api';

const data = (promise) => promise.then((res) => res.data.data);
const page = (promise) => promise.then((r) => ({ items: r.data.data, meta: r.data.meta }));
const clean = (params) => Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v !== '' && v !== undefined && v !== null));

// Refurbished marketplace (FR-MKT-004..008). `form` is a FormData with the product fields and photos.
export const marketApi = {
  list: (params, signal) => page(api.get('/marketplace', { params: clean(params), signal })),
  mine: (params, signal) => page(api.get('/marketplace/mine', { params: clean(params), signal })),
  get: (id, signal) => data(api.get(`/marketplace/${id}`, { signal })),
  create: (form) => data(api.post('/marketplace', form)),
  update: (id, form) => data(api.put(`/marketplace/${id}`, form)),
  remove: (id) => data(api.delete(`/marketplace/${id}`)),
  enquire: (id, message) => data(api.post(`/marketplace/${id}/enquiries`, { message })),
};

// Orders (FR-MKT-009). Payment is cash on delivery or offline; the platform never handles money.
export const orderApi = {
  place: (body) => data(api.post('/orders', body)),
  list: (params, signal) => page(api.get('/orders', { params: clean(params), signal })),
  get: (id, signal) => data(api.get(`/orders/${id}`, { signal })),
  setStatus: (id, status) => data(api.put(`/orders/${id}/status`, { status })),
  cancel: (id, reason) => data(api.post(`/orders/${id}/cancel`, reason ? { reason } : {})),
};
