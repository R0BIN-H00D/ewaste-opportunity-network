import { api } from './api';

const data = (promise) => promise.then((res) => res.data.data);
const page = (promise) => promise.then((r) => ({ items: r.data.data, meta: r.data.meta }));
const clean = (params) => Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v !== '' && v !== undefined && v !== null));

// Recycling centres (public directory, FR-REC-001) and recycling requests (FR-REC-002..006). `form` is a FormData.
export const centerApi = {
  list: (params, signal) => page(api.get('/recycling-centers', { params: clean(params), signal })),
  get: (id, signal) => data(api.get(`/recycling-centers/${id}`, { signal })),
  compare: (params, signal) => data(api.get("/recycling-centers/compare", { params: clean(params), signal })),
};

export const recyclingApi = {
  create: (form) => data(api.post('/recycling-requests', form)),
  list: (params, signal) => page(api.get('/recycling-requests', { params: clean(params), signal })),
  get: (id, signal) => data(api.get(`/recycling-requests/${id}`, { signal })),
  setStatus: (id, status, reason) => data(api.put(`/recycling-requests/${id}/status`, { status, ...(reason ? { reason } : {}) })),
  pickup: (id, body) => data(api.post(`/recycling-requests/${id}/pickup`, body)),
  confirmHandover: (id, body = {}) => data(api.post(`/recycling-requests/${id}/confirm-handover`, body)),
  materials: (id, body) => data(api.put(`/recycling-requests/${id}/materials`, body)),
  cancel: (id, reason) => data(api.post(`/recycling-requests/${id}/cancel`, reason ? { reason } : {})),
  report: (params, signal) => data(api.get('/recycling-requests/report', { params: clean(params), signal })),
  /** The CSV needs the signed-in cookie/token, so it is fetched here and saved from a blob. */
  reportCsv: (params) => api.get('/recycling-requests/report', { params: { ...clean(params), format: 'csv' }, responseType: 'blob' }).then((r) => r.data),
};
