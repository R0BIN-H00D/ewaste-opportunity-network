import { api } from './api';

const data = (promise) => promise.then((res) => res.data.data);
const clean = (params) => Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v !== '' && v !== undefined && v !== null));

export const categoryApi = { list: () => data(api.get('/categories')) };

export const deviceApi = {
  list: (params, signal) => api.get('/devices', { params: clean(params), signal }).then((r) => ({ items: r.data.data, meta: r.data.meta })),
  get: (id, signal) => data(api.get(`/devices/${id}`, { signal })),
  // `values` are plain fields; `photos` are File objects. The server reads multipart for both create and update.
  // `onProgress(0..100)` reports upload progress while photos are sent.
  create: (values, photos = [], onProgress) => data(api.post('/devices', toForm(values, photos), progress(onProgress))),
  update: (id, values, photos = [], onProgress) => data(api.put(`/devices/${id}`, toForm(values, photos), progress(onProgress))),
  setStatus: (id, status) => data(api.put(`/devices/${id}`, toForm({ status }, []))),
  remove: (id) => data(api.delete(`/devices/${id}`)),
};

export const reportApi = {
  create: (body) => data(api.post('/reports', body)),
};

const progress = (cb) => (cb ? { timeout: 120000, onUploadProgress: (e) => e.total && cb(Math.round((e.loaded / e.total) * 100)) } : { timeout: 120000 });

function toForm(values, photos) {
  const form = new FormData();
  for (const [key, value] of Object.entries(values || {})) {
    if (value === undefined || value === null || value === '') continue;
    form.append(key, Array.isArray(value) ? JSON.stringify(value) : value);
  }
  photos.forEach((file) => form.append('photos', file));
  return form;
}
