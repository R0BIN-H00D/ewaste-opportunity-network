import axios from 'axios';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
// Uploaded files are served from the API origin (e.g. /uploads/avatars/x.png).
export const assetUrl = (path) => (!path ? '' : /^https?:/i.test(path) ? path : `${API_BASE_URL.replace(/\/api\/?$/, '')}${path}`);

// `X-Requested-With` is the CSRF guard for the cookie-based refresh endpoint (docs/design.md §security).
export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  withCredentials: true,
  headers: { 'X-Requested-With': 'ewaste-web' },
});

export const getHealth = () => api.get('/health').then((r) => r.data);

/* ---------- access token (kept in memory only; the refresh token lives in an httpOnly cookie) ---------- */
let accessToken = null;
let onExpired = () => {};
export const setAccessToken = (token) => {
  accessToken = token || null;
};
export const getAccessToken = () => accessToken;
/** The store registers a callback so a failed silent refresh can log the user out of the UI. */
export const onSessionExpired = (fn) => {
  onExpired = fn;
};

api.interceptors.request.use((config) => {
  if (accessToken && !config.headers.Authorization) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

// One refresh at a time: concurrent 401s share the same request. (The server treats reuse of a rotated token as theft.)
let refreshing = null;
export function refreshSession() {
  if (!refreshing) {
    refreshing = api
      .post('/auth/refresh', {}, { skipAuthRefresh: true })
      .then((res) => {
        setAccessToken(res.data.data.accessToken);
        return res.data.data;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

const NO_REFRESH = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/forgot-password', '/auth/reset-password', '/auth/verify-email'];

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const { config, response } = error;
    const skip = !config || config.skipAuthRefresh || config._retried || NO_REFRESH.some((p) => config.url?.startsWith(p));
    if (response?.status !== 401 || skip) throw error;
    try {
      await refreshSession();
    } catch {
      setAccessToken(null);
      onExpired();
      throw error;
    }
    config._retried = true; // retry once with the new token, then give up
    config.headers.Authorization = `Bearer ${accessToken}`;
    return api(config);
  },
);
