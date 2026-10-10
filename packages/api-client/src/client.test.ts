import { describe, expect, it, vi } from 'vitest';
import { ApiClientError, createApiClient } from './index';

describe('api client', () => {
  it('sends the bearer token and unwraps data', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ data: { user: { id: 'u1' }, memberships: [] } })),
      );
    const api = createApiClient({
      baseUrl: 'https://app.test',
      getAccessToken: () => 'jwt',
      fetch,
    });
    await expect(api.me.get()).resolves.toEqual({ user: { id: 'u1' }, memberships: [] });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://app.test/api/me');
    expect(init.headers.Authorization).toBe('Bearer jwt');
  });

  it('maps API errors', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'Wait a minute' } }),
          { status: 429 },
        ),
      );
    const api = createApiClient({ baseUrl: '', fetch });
    const err = await api.auth.start({ phone: '08031234567' }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err).toMatchObject({ code: 'RATE_LIMITED', status: 429, message: 'Wait a minute' });
  });

  it('maps network failures', async () => {
    const api = createApiClient({
      baseUrl: '',
      fetch: vi.fn().mockRejectedValue(new TypeError('fetch failed')),
    });
    await expect(api.me.get()).rejects.toMatchObject({ code: 'NETWORK', status: 0 });
  });
});
