import '@testing-library/jest-dom/vitest';

// jsdom supplies its own AbortSignal, but Node's built-in Request (used by React Router for every in-app
// navigation/redirect) only accepts Node's. Without this, any <Navigate> in a test throws
// "Expected signal to be an instance of AbortSignal". Tests do not need request cancellation.
const NativeRequest = globalThis.Request;
globalThis.Request = class TestRequest extends NativeRequest {
  constructor(input, init) {
    if (init && 'signal' in init) {
      const { signal, ...rest } = init; // eslint-disable-line no-unused-vars
      super(input, rest);
    } else {
      super(input, init);
    }
  }
};

// The announcement banner loads on every page. Tests do not need it to reach the network; a test about the banner
// sets what `announcementApi.list` returns.
vi.mock('../services/announcementApi', () => ({ announcementApi: { list: vi.fn().mockResolvedValue([]) } }));
