import { _setSocketFactory, connectRealtime, disconnectRealtime, emitRealtime, isRealtimeConnected, onRealtime, onRealtimeStatus } from '../services/realtime';
import { API_BASE_URL, getAccessToken, refreshSession, setAccessToken } from '../services/api';

vi.mock('../services/api', async (importOriginal) => ({ ...(await importOriginal()), refreshSession: vi.fn() }));

/** A stand-in for the socket.io client: records what was asked and lets a test make the server "send" things. */
function fakeSocket() {
  const handlers = {};
  const socket = {
    auth: null,
    emitted: [],
    connectCalls: 0,
    disconnected: false,
    on: (event, fn) => { handlers[event] = fn; return socket; },
    emit: (event, payload) => socket.emitted.push([event, payload]),
    connect: () => { socket.connectCalls += 1; },
    disconnect: () => { socket.disconnected = true; },
    server: (event, payload) => handlers[event]?.(payload),
  };
  return socket;
}

let socket; let options; let url; let created;
beforeEach(() => {
  vi.resetAllMocks();
  disconnectRealtime();
  created = 0;
  socket = fakeSocket();
  _setSocketFactory((u, o) => { created += 1; url = u; options = o; socket.auth = o.auth; return socket; });
  setAccessToken('token-1');
});
afterEach(() => {
  disconnectRealtime();
  _setSocketFactory(null);
  setAccessToken(null);
});

describe('connecting', () => {
  it('signs in with the access token and does nothing without one', () => {
    setAccessToken(null);
    expect(connectRealtime()).toBeNull();
    expect(created).toBe(0);

    setAccessToken('token-1');
    expect(connectRealtime()).toBe(socket);
    expect(options.auth).toEqual({ token: 'token-1' });
    // It shares the API's server, so its address is the API's without the "/api" part.
    expect(url).toBe(API_BASE_URL.replace(/\/api\/?$/, ''));
  });

  it('is safe to call twice: one connection', () => {
    connectRealtime();
    connectRealtime();
    expect(created).toBe(1);
  });

  it('can connect again after a disconnect', () => {
    connectRealtime();
    disconnectRealtime();
    expect(socket.disconnected).toBe(true);
    connectRealtime();
    expect(created).toBe(2);
  });
});

describe('events', () => {
  it('reach everyone listening for them, and stop reaching those who unsubscribe', () => {
    connectRealtime();
    const a = vi.fn(); const b = vi.fn();
    const offA = onRealtime('message:new', a);
    onRealtime('message:new', b);

    socket.server('message:new', { message: { _id: 'm1' } });
    offA();
    socket.server('message:new', { message: { _id: 'm2' } });

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenLastCalledWith({ message: { _id: 'm2' } });
  });

  it('carry every kind the app uses', () => {
    connectRealtime();
    const seen = [];
    for (const e of ['message:new', 'message:read', 'typing', 'notification:new']) onRealtime(e, () => seen.push(e));
    for (const e of ['message:new', 'message:read', 'typing', 'notification:new']) socket.server(e, {});
    expect(seen).toEqual(['message:new', 'message:read', 'typing', 'notification:new']);
  });

  it('are not stopped by one listener that throws', () => {
    connectRealtime();
    const after = vi.fn();
    onRealtime('typing', () => { throw new Error('bad listener'); });
    onRealtime('typing', after);
    socket.server('typing', { typing: true });
    expect(after).toHaveBeenCalledWith({ typing: true });
  });
});

describe('connection status', () => {
  it('tells listeners when it comes up and goes down, once each', () => {
    connectRealtime();
    const seen = [];
    const off = onRealtimeStatus((up) => seen.push(up));
    expect(isRealtimeConnected()).toBe(false);

    socket.server('connect');
    socket.server('connect');
    expect(isRealtimeConnected()).toBe(true);
    socket.server('disconnect');
    off();
    socket.server('connect');

    expect(seen).toEqual([true, false]);
  });
});

describe('sending', () => {
  it('goes out only while connected', () => {
    connectRealtime();
    emitRealtime('typing', { conversationId: 'c1', typing: true });
    expect(socket.emitted).toEqual([]);

    socket.server('connect');
    emitRealtime('typing', { conversationId: 'c1', typing: true });
    expect(socket.emitted).toEqual([['typing', { conversationId: 'c1', typing: true }]]);
  });

  it('does nothing when there is no connection at all', () => {
    expect(() => emitRealtime('typing', {})).not.toThrow();
  });
});

describe('a stale token', () => {
  it('is refreshed once and the connection is tried again with the new one', async () => {
    connectRealtime();
    refreshSession.mockImplementation(async () => { setAccessToken('token-2'); });
    await socket.server('connect_error', new Error('UNAUTHORIZED'));

    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBe('token-2');
    expect(socket.auth).toEqual({ token: 'token-2' });
    expect(socket.connectCalls).toBe(1);
  });

  it('is left alone when the session cannot be refreshed', async () => {
    connectRealtime();
    refreshSession.mockRejectedValue(new Error('expired'));
    await socket.server('connect_error', new Error('UNAUTHORIZED'));
    expect(socket.connectCalls).toBe(0);
  });

  it('is not refreshed for a connection problem that is not about sign-in', async () => {
    connectRealtime();
    await socket.server('connect_error', new Error('xhr poll error'));
    expect(refreshSession).not.toHaveBeenCalled();
  });
});
