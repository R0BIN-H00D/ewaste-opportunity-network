import { api } from './api';

const clean = (params) => Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v !== '' && v !== undefined && v !== null));
const page = (r) => ({ items: r.data.data, meta: r.data.meta });
const one = (r) => r.data.data;

// Administrator tools. The server checks the role on every call; these only describe the routes.
export const adminDashboardApi = {
  get: (signal) => api.get('/admin/dashboard', { signal }).then(one),
};

export const adminMonitorApi = {
  list: (kind, params, signal) => api.get(`/admin/monitors/${kind}`, { params: clean(params), signal }).then(page),
};

export const adminListingApi = {
  list: (params, signal) => api.get('/admin/listings', { params: clean(params), signal }).then(page),
  moderate: (id, body) => api.put(`/admin/listings/${id}/moderation`, body).then(one),
};

export const adminReviewApi = {
  list: (params, signal) => api.get('/admin/reviews', { params: clean(params), signal }).then(page),
  setStatus: (id, body) => api.put(`/admin/reviews/${id}/status`, body).then(one),
};

export const adminReportApi = {
  list: (params, signal) => api.get('/admin/reports', { params: clean(params), signal }).then(page),
  get: (id, signal) => api.get(`/admin/reports/${id}`, { signal }).then(one),
  decide: (id, body) => api.put(`/admin/reports/${id}`, body).then(one),
};

export const adminCategoryApi = {
  list: (signal) => api.get('/admin/categories', { signal }).then(one),
  create: (body) => api.post('/admin/categories', body).then(one),
  update: (id, body) => api.put(`/admin/categories/${id}`, body).then(one),
  reorder: (ids) => api.put('/admin/categories/order', { ids }).then(one),
  remove: (id) => api.delete(`/admin/categories/${id}`).then(one),
};

export const adminComplaintApi = {
  list: (params, signal) => api.get('/admin/complaints', { params: clean(params), signal }).then(page),
  get: (id, signal) => api.get(`/admin/complaints/${id}`, { signal }).then(one),
  act: (id, body) => api.put(`/admin/complaints/${id}`, body).then(one),
};

export const adminAnnouncementApi = {
  list: (params, signal) => api.get('/admin/announcements', { params: clean(params), signal }).then(page),
  create: (body) => api.post('/admin/announcements', body).then(one),
  update: (id, body) => api.put(`/admin/announcements/${id}`, body).then(one),
  remove: (id) => api.delete(`/admin/announcements/${id}`).then(one),
};

export const adminAuditApi = {
  list: (params, signal) => api.get('/admin/audit', { params: clean(params), signal }).then(page),
};

export const adminAnalyticsApi = {
  get: (params, signal) => api.get('/admin/analytics', { params: clean(params), signal }).then(one),
};

// A file download asks for a Blob, so an error body arrives as a Blob too. Read it back into JSON so the page can show the server's message.
async function readBlobError(err) {
  const data = err?.response?.data;
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    try { err.response.data = JSON.parse(await data.text()); } catch { /* keep the generic message */ }
  }
  throw err;
}
const fileName = (header) => /filename="?([^";]+)"?/i.exec(header || '')?.[1] || 'export.csv';

export const adminExportApi = {
  /** Resolves with { blob, filename, rows, truncated }. */
  download: (kind, params) => api.get(`/admin/exports/${kind}`, { params: clean(params), responseType: 'blob' }).then(
    (r) => ({ blob: r.data, filename: fileName(r.headers['content-disposition']), rows: Number(r.headers['x-export-rows'] || 0), truncated: r.headers['x-export-truncated'] === 'true' }),
    readBlobError,
  ),
};

export const adminUserApi = {
  list: (params, signal) => api.get('/admin/users', { params: clean(params), signal }).then(page),
  get: (id, signal) => api.get(`/admin/users/${id}`, { signal }).then(one),
  setStatus: (id, body) => api.put(`/admin/users/${id}/status`, body).then(one),
};

export const adminVerificationApi = {
  list: (params, signal) => api.get('/admin/verifications', { params: clean(params), signal }).then(page),
  get: (userId, type, signal) => api.get(`/admin/verifications/${userId}`, { params: clean({ type }), signal }).then(one),
  decide: (userId, body) => api.put(`/admin/verifications/${userId}`, body).then(one),
  /** A private document as a Blob. It needs the administrator's token, so it cannot be a plain link. */
  document: (viewUrl, signal) => api.get(viewUrl.replace(/^\/api/, ''), { responseType: 'blob', signal }).then((r) => r.data),
};

export const adminEducationApi = {
  list: (params, signal) => api.get('/admin/education', { params: clean(params), signal }).then(page),
  get: (id, signal) => api.get(`/admin/education/${id}`, { signal }).then(one),
  create: (body) => api.post('/admin/education', body).then(one),
  update: (id, body) => api.put(`/admin/education/${id}`, body).then(one),
  remove: (id) => api.delete(`/admin/education/${id}`).then(one),
};
