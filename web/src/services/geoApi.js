import { api } from './api';

// Address search through the server, which keeps to the free service's usage policy (one request a second, answers kept).
export const geoApi = {
  /** Up to five places in India for a typed address: { label, lat, lng, area, city, state, postcode }. */
  /** The place at a spot: { label, lat, lng, area, city, state, postcode }. Fails with 404 when nothing is known, 503 when the address service is down. */
  reverse: (lat, lng, signal) => api.get('/geo/reverse', { params: { lat, lng }, signal }).then((r) => r.data.data),
  search: (q, signal) => api.get('/geo/search', { params: { q }, signal }).then((r) => r.data.data),
};