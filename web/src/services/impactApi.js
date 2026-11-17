import { api } from './api';

const data = (promise) => promise.then((res) => res.data.data);
const clean = (params) => Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v !== '' && v !== undefined && v !== null));

// Environmental impact and the Green Score (P9). The platform figures and the rules are public; a person's own are not.
export const impactApi = {
  /** Public: what the platform has achieved, from recorded, verified activity only. */
  platform: (signal) => data(api.get('/analytics/platform-impact', { signal })),
  /** Public: how points are earned, as the server runs them. */
  rules: (signal) => data(api.get('/analytics/rules', { signal })),
  /** Month by month, oldest first, every month present. `scope: 'me'` limits it to the signed-in person. */
  monthly: (params, signal) => data(api.get('/analytics/monthly', { params: clean(params), signal })),
  /** The signed-in person's own impact. */
  mine: (signal) => data(api.get('/analytics/user-impact', { signal })),
  /** Score, level, badges and one page of the history. */
  score: (params, signal) => api.get('/analytics/green-score', { params: clean(params), signal }).then((r) => ({ ...r.data.data, meta: r.data.meta })),
};
