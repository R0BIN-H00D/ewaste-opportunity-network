import { api } from './api';

const data = (promise) => promise.then((res) => res.data.data);
const page = (promise) => promise.then((r) => ({ items: r.data.data, meta: r.data.meta }));
const clean = (params) => Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v !== '' && v !== undefined && v !== null));

// Refurbishment (FR-MKT-001..003)
export const refurbApi = {
  opportunities: (params, signal) => page(api.get('/refurbishment/opportunities', { params: clean(params), signal })),
  offer: (body) => data(api.post('/refurbishment/offers', body)),
  jobs: (params, signal) => page(api.get('/refurbishment/jobs', { params: clean(params), signal })),
  job: (id, signal) => data(api.get(`/refurbishment/jobs/${id}`, { signal })),
  decide: (id, decision) => data(api.put(`/refurbishment/jobs/${id}/offer-decision`, { decision })),
  withdraw: (id) => data(api.delete(`/refurbishment/jobs/${id}/offer`)),
  handover: (id, body) => data(api.post(`/refurbishment/jobs/${id}/handover`, body)),
  confirmHandover: (id, body = {}) => data(api.post(`/refurbishment/jobs/${id}/confirm-handover`, body)),
  advance: (id, status, note) => data(api.put(`/refurbishment/jobs/${id}/status`, { status, ...(note ? { note } : {}) })),
  addPhotos: (id, stage, files, note) => {
    const form = new FormData();
    form.append('stage', stage);
    if (note) form.append('note', note);
    files.forEach((file) => form.append('photos', file));
    return data(api.post(`/refurbishment/jobs/${id}/photos`, form));
  },
  cancel: (id, reason) => data(api.post(`/refurbishment/jobs/${id}/cancel`, reason ? { reason } : {})),
};
