import { api } from './api';

// Address search through the server, which keeps to the free service's usage policy (one request a second, answers kept).
export const geoApi = {
  /** Up to five places in India for a typed address: { label, lat, lng, area, city, state, postcode }. */
  search: (q, signal) => api.get('/geo/search', { params: { q }, signal }).then((r) => r.data.data),
};