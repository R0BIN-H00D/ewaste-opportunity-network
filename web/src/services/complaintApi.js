import { api } from './api';

const clean = (params) => Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v !== '' && v !== undefined && v !== null));

// A person's own complaints. The server only ever returns the ones this person filed.
export const complaintApi = {
  create: (body) => api.post('/complaints', body).then((r) => r.data.data),
  list: (params, signal) => api.get('/complaints', { params: clean(params), signal }).then((r) => ({ items: r.data.data, meta: r.data.meta })),
  get: (id, signal) => api.get(`/complaints/${id}`, { signal }).then((r) => r.data.data),
};
