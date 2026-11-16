import { api } from './api';

const data = (promise) => promise.then((res) => res.data.data);
const page = (promise) => promise.then((r) => ({ items: r.data.data, meta: r.data.meta }));
const clean = (params) => Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v !== '' && v !== undefined && v !== null));

// Supervised student learning (FR-STU-001..006). Technicians post tasks and supervise; students apply.
export const opportunityApi = {
  list: (params, signal) => page(api.get('/students/opportunities', { params: clean(params), signal })),
  mine: (params, signal) => page(api.get('/students/opportunities/mine', { params: clean(params), signal })),
  get: (id, signal) => data(api.get(`/students/opportunities/${id}`, { signal })),
  create: (body) => data(api.post('/students/opportunities', body)),
  update: (id, body) => data(api.put(`/students/opportunities/${id}`, body)),
  setStatus: (id, status) => data(api.put(`/students/opportunities/${id}/status`, { status })),
  applicants: (id, params, signal) => page(api.get(`/students/opportunities/${id}/applications`, { params: clean(params), signal })),
};

export const applicationApi = {
  apply: (opportunityId, message) => data(api.post('/students/applications', { opportunityId, ...(message ? { message } : {}) })),
  list: (params, signal) => page(api.get('/students/applications', { params: clean(params), signal })),
  get: (id, signal) => data(api.get(`/students/applications/${id}`, { signal })),
  decide: (id, decision, feedback) => data(api.put(`/students/applications/${id}/decision`, { decision, ...(feedback ? { feedback } : {}) })),
  start: (id) => data(api.post(`/students/applications/${id}/start`)),
  complete: (id, body) => data(api.put(`/students/applications/${id}/complete`, body)),
  withdraw: (id, reason) => data(api.post(`/students/applications/${id}/withdraw`, reason ? { reason } : {})),
};

export const experienceApi = {
  get: (signal) => data(api.get('/students/experience', { signal })),
};
