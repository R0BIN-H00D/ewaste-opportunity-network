import { io } from 'socket.io-client';
import { API_BASE_URL, getAccessToken, refreshSession } from './api';

// The live channel (P8-03). It shares the API's server, so by default it is the API address without "/api". Everything it
// delivers can also be fetched over the normal API, so when it is down the pages still work: they just update on reload.
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || API_BASE_URL.replace(/\/api\/?$/, '');
const EVENTS = ['message:new', 'message:read', 'typing', 'notification:new'];

let socket = null;
let connected = false;
const listeners = new Map(); // event -> Set of handlers
const statusListeners = new Set();
let factory = io;

/** For tests: swap in a fake `io`. */
export const _setSocketFactory = (fn) => {
  factory = fn || io;
};

function setConnected(value) {
  if (connected === value) return;
  connected = value;
  statusListeners.forEach((fn) => fn(value));
}

function dispatch(event, payload) {
  listeners.get(event)?.forEach((fn) => {
    try {
      fn(payload);
    } catch {
      // One misbehaving page must not stop the others hearing the event.
    }
  });
}

/** Connects with the current access token. Safe to call twice. Does nothing when nobody is signed in. */
export function connectRealtime() {
  if (socket) return socket;
  const token = getAccessToken();
  if (!token) return null;
  const s = factory(SOCKET_URL, { auth: { token }, transports: ['websocket'], withCredentials: true, reconnectionDelay: 2000 });
  socket = s;
  s.on('connect', () => setConnected(true));
  s.on('disconnect', () => setConnected(false));
  s.on('connect_error', async (err) => {
    setConnected(false);
    // "UNAUTHORIZED" is how the server says the token is missing, expired or revoked: refresh the session and try once more.
    if (String(err?.message).includes('UNAUTHORIZED') && socket === s) {
      try {
        await refreshSession();
        s.auth = { token: getAccessToken() };
        s.connect();
      } catch {
        // The session is gone; the API layer signs the person out.
      }
    }
  });
  EVENTS.forEach((event) => s.on(event, (payload) => dispatch(event, payload)));
  return s;
}

export function disconnectRealtime() {
  if (!socket) return;
  socket.disconnect();
  socket = null;
  setConnected(false);
}

/** Listens for an event from the server. Returns the function that stops listening. */
export function onRealtime(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(handler);
  return () => listeners.get(event)?.delete(handler);
}

/** Calls `handler(true|false)` when the connection comes up or goes down. Returns the function that stops listening. */
export function onRealtimeStatus(handler) {
  statusListeners.add(handler);
  return () => statusListeners.delete(handler);
}

/** Sends something to the server (for example "typing"). Dropped when not connected. */
export function emitRealtime(event, payload) {
  if (socket && connected) socket.emit(event, payload);
}

export const isRealtimeConnected = () => connected;
