import { api } from './api';

const data = (promise) => promise.then((res) => res.data.data);
const clean = (params) => Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v !== '' && v !== undefined && v !== null));

// Environmental impact (P9). The platform figures are public; a person's own are not.
export const impactApi = {
  /** Public: what the platform has achieved, from recorded, verified activity only. */
  platform: (signal) => data(api.get('/analytics/platform-impact', { signal })),
  /** Month by month, oldest first, every month present. `scope: 'me'` limits it to the signed-in person. */
  monthly: (params, signal) => data(api.get('/analytics/monthly', { params: clean(params), signal })),
  /** Year by year, oldest first, every year present. scope: 'me' limits it to the signed-in person. */
  yearly: (params, signal) => data(api.get('/analytics/yearly', { params: clean(params), signal })),
  /** Which kinds of device the impact came from, most devices first. scope: 'me' limits it to the signed-in person. */
  byCategory: (params, signal) => data(api.get('/analytics/by-category', { params: clean(params), signal })),
  /** The signed-in person's own impact. */
  mine: (signal) => data(api.get('/analytics/user-impact', { signal })),
};
