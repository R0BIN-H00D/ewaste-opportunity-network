import { act, render, screen, waitFor } from '@testing-library/react';
import { LIVE_DELAY_MS, useFetch } from '../hooks/useFetch';
import { _setSocketFactory, connectRealtime, disconnectRealtime } from '../services/realtime';
import { setAccessToken } from '../services/api';

/** A stand-in for the socket.io client: a test makes the server "send" things. */
function fakeSocket() {
  const handlers = {};
  const socket = { auth: null, on: (e, fn) => { handlers[e] = fn; return socket; }, emit: () => {}, connect: () => {}, disconnect: () => {}, server: (e, p) => handlers[e]?.(p) };
  return socket;
}

let socket;
function Probe({ fetcher, options, deps = [] }) {
  const { data, error, loading } = useFetch(fetcher, deps, options);
  return <p>{loading ? 'loading' : error ? `error:${error.message}` : `data:${data}`}</p>;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  socket = fakeSocket();
  _setSocketFactory(() => socket);
  setAccessToken('t');
  connectRealtime();
});
afterEach(() => {
  disconnectRealtime();
  _setSocketFactory(null);
  setAccessToken(null);
  vi.useRealTimers();
});

const later = (ms = LIVE_DELAY_MS + 50) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

describe('useFetch, live', () => {
  it('fetches again when the server says something changed, and keeps the old data on screen until the new arrives', async () => {
    let n = 0;
    let release;
    const fetcher = vi.fn(() => (n++ === 0 ? Promise.resolve('one') : new Promise((resolve) => { release = () => resolve('two'); })));
    render(<Probe fetcher={fetcher} />);
    expect(await screen.findByText('data:one')).toBeInTheDocument();

    act(() => socket.server('data:changed', { resource: 'listing', id: 'x', action: 'updated' }));
    await later();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(screen.getByText('data:one')).toBeInTheDocument(); // no flash of "loading"
    await act(async () => release());
    expect(await screen.findByText('data:two')).toBeInTheDocument();
  });

  it('turns a burst of changes into one fetch', async () => {
    const fetcher = vi.fn(() => Promise.resolve('x'));
    render(<Probe fetcher={fetcher} />);
    await screen.findByText('data:x');
    act(() => { for (let i = 0; i < 10; i += 1) socket.server('data:changed', { resource: 'request', id: String(i), action: 'updated' }); });
    await later();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('keeps good data when a quiet fetch fails, instead of showing an error', async () => {
    let n = 0;
    const fetcher = vi.fn(() => (n++ === 0 ? Promise.resolve('good') : Promise.reject(new Error('offline'))));
    render(<Probe fetcher={fetcher} />);
    await screen.findByText('data:good');
    act(() => socket.server('data:changed', { resource: 'order', id: '1', action: 'updated' }));
    await later();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(screen.getByText('data:good')).toBeInTheDocument();
    expect(screen.queryByText(/error:/)).not.toBeInTheDocument();
  });

  it('still shows an error when the first fetch fails', async () => {
    render(<Probe fetcher={() => Promise.reject(Object.assign(new Error('Server down'), { response: { status: 500, data: { message: 'Server down' } } }))} />);
    expect(await screen.findByText(/error:/)).toBeInTheDocument();
  });

  it('can be switched off for a page that holds typed input', async () => {
    const fetcher = vi.fn(() => Promise.resolve('x'));
    render(<Probe fetcher={fetcher} options={{ live: false }} />);
    await screen.findByText('data:x');
    act(() => socket.server('data:changed', { resource: 'listing', id: '1', action: 'updated' }));
    await later(2000);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not fetch while it is switched off, and stops listening when the page goes away', async () => {
    const fetcher = vi.fn(() => Promise.resolve('x'));
    const { unmount } = render(<Probe fetcher={fetcher} options={{ enabled: false }} />);
    act(() => socket.server('data:changed', { resource: 'listing', id: '1', action: 'updated' }));
    await later();
    expect(fetcher).not.toHaveBeenCalled();
    unmount();
    act(() => socket.server('data:changed', { resource: 'listing', id: '1', action: 'updated' }));
    await later();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('catches up when the live connection comes back, but not on the first connection', async () => {
    const fetcher = vi.fn(() => Promise.resolve('x'));
    render(<Probe fetcher={fetcher} />);
    await screen.findByText('data:x');
    act(() => socket.server('connect')); // the first connection: the page has just fetched, nothing to catch up on
    await later();
    expect(fetcher).toHaveBeenCalledTimes(1);
    act(() => { socket.server('disconnect'); socket.server('connect'); });
    await later();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('waits for the tab to come back before fetching, then does', async () => {
    const fetcher = vi.fn(() => Promise.resolve('x'));
    render(<Probe fetcher={fetcher} />);
    await screen.findByText('data:x');
    const state = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => socket.server('data:changed', { resource: 'listing', id: '1', action: 'updated' }));
    await later();
    expect(fetcher).toHaveBeenCalledTimes(1);
    state.mockReturnValue('visible');
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    await later();
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    state.mockRestore();
  });

  it('a normal change of its inputs still shows loading', async () => {
    let value = 'a';
    const fetcher = vi.fn(() => Promise.resolve(value));
    const { rerender } = render(<Probe fetcher={fetcher} deps={['a']} />);
    await screen.findByText('data:a');
    value = 'b';
    rerender(<Probe fetcher={fetcher} deps={['b']} />);
    expect(await screen.findByText('data:b')).toBeInTheDocument();
  });
});