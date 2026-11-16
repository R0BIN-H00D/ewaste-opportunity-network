import axios from 'axios';
import { api, getAccessToken, onSessionExpired, setAccessToken } from '../services/api';

const original = api.defaults.adapter;
const unauthorized = (config) => new axios.AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, null, { status: 401, data: {}, headers: {}, config });
const ok = (config, data) => Promise.resolve({ data, status: 200, statusText: 'OK', headers: {}, config });

afterEach(() => {
  api.defaults.adapter = original;
  setAccessToken(null);
  onSessionExpired(() => {});
});

describe('Axios auth interceptors', () => {
  it('sends the access token and the CSRF header', async () => {
    let seen;
    api.defaults.adapter = (config) => {
      seen = config.headers;
      return ok(config, { success: true });
    };
    setAccessToken('abc');
    await api.get('/things');
    expect(seen.Authorization).toBe('Bearer abc');
    expect(seen['X-Requested-With']).toBe('ewaste-web');
  });

  it('refreshes once on a 401 and retries the request with the new token', async () => {
    const calls = [];
    api.defaults.adapter = (config) => {
      calls.push(`${config.method} ${config.url} ${config.headers.Authorization || '-'}`);
      if (config.url === '/auth/refresh') return ok(config, { data: { accessToken: 'new-token' } });
      if (config.headers.Authorization === 'Bearer new-token') return ok(config, { data: 'secret' });
      return Promise.reject(unauthorized(config));
    };
    setAccessToken('expired-token');
    const res = await api.get('/private');
    expect(res.data.data).toBe('secret');
    expect(getAccessToken()).toBe('new-token');
    expect(calls).toEqual(['get /private Bearer expired-token', 'post /auth/refresh Bearer expired-token', 'get /private Bearer new-token']);
  });

  it('shares ONE refresh between concurrent 401s (a rotated token must never be used twice)', async () => {
    let refreshes = 0;
    api.defaults.adapter = async (config) => {
      if (config.url === '/auth/refresh') {
        refreshes += 1;
        await new Promise((r) => setTimeout(r, 20));
        return ok(config, { data: { accessToken: 'fresh' } });
      }
      return config.headers.Authorization === 'Bearer fresh' ? ok(config, { data: config.url }) : Promise.reject(unauthorized(config));
    };
    setAccessToken('old');
    const results = await Promise.all([api.get('/a'), api.get('/b'), api.get('/c')]);
    expect(results.map((r) => r.data.data)).toEqual(['/a', '/b', '/c']);
    expect(refreshes).toBe(1);
  });

  it('signs the UI out when the refresh fails', async () => {
    const expired = vi.fn();
    onSessionExpired(expired);
    api.defaults.adapter = (config) => Promise.reject(unauthorized(config));
    setAccessToken('old');
    await expect(api.get('/private')).rejects.toMatchObject({ response: { status: 401 } });
    expect(expired).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBeNull();
  });

  it('does not try to refresh a failed login', async () => {
    let refreshes = 0;
    api.defaults.adapter = (config) => {
      if (config.url === '/auth/refresh') refreshes += 1;
      return Promise.reject(unauthorized(config));
    };
    await expect(api.post('/auth/login', {})).rejects.toBeTruthy();
    expect(refreshes).toBe(0);
  });
});
