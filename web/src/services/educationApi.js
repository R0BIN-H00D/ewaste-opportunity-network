import { api } from './api';

const page = (promise) => promise.then((r) => ({ items: r.data.data, meta: r.data.meta }));

// The learning centre: public, published articles only.
export const educationApi = {
  list: (params, signal) => page(api.get('/education', { params, signal })),
  get: (slug, signal) => api.get(`/education/${encodeURIComponent(slug)}`, { signal }).then((r) => r.data.data),
};