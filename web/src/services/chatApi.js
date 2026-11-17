import { api } from './api';

const data = (promise) => promise.then((res) => res.data.data);
const page = (promise) => promise.then((r) => ({ items: r.data.data, meta: r.data.meta }));
const clean = (params) => Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v !== '' && v !== undefined && v !== null));

// One-to-one chat (P8-03). Live delivery comes from services/realtime.js; these calls always work, with or without it.
export const chatApi = {
  /** Finds or starts the thread for a repair, order, donation request, recycling request, refurbishment offer or listing. */
  open: (contextType, contextId) => data(api.post('/chat/conversations', { contextType, contextId })),
  get: (id, signal) => data(api.get(`/chat/conversations/${id}`, { signal })),
  list: (params, signal) => page(api.get('/chat/conversations', { params: clean(params), signal })),
  unreadCount: () => data(api.get('/chat/unread-count')).then((d) => d.unread),
  /** Oldest first within the page. Pass `before` (the previous page's `meta.nextBefore`) to go further back. */
  messages: (id, params, signal) => page(api.get(`/chat/conversations/${id}/messages`, { params: clean(params), signal })),
  send: (id, text) => data(api.post(`/chat/conversations/${id}/messages`, { text })),
  markRead: (id) => data(api.put(`/chat/conversations/${id}/read`)),
};

// The person's own notification centre (P8-05).
export const notificationApi = {
  list: (params, signal) => page(api.get('/notifications', { params: clean(params), signal })),
  unreadCount: () => data(api.get('/notifications/unread-count')).then((d) => d.unread),
  markRead: (id) => data(api.put(`/notifications/${id}/read`)),
  markAllRead: () => data(api.put('/notifications/read-all')),
};
