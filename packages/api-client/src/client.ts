import type {
  ApiError,
  ApiOne,
  DeviceRegisterInput,
  ErrorCode,
  MeDto,
  OtpStartInput,
  OtpVerifyInput,
  SessionDto,
} from '@shopinbos/validation';

export class ApiClientError extends Error {
  constructor(
    readonly code: ErrorCode | 'NETWORK',
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export interface ApiClientOptions {
  /** e.g. https://app.shopinbos.com (mobile) or '' (same-origin web). */
  baseUrl: string;
  /** Returns the current Supabase access token, if signed in. */
  getAccessToken?: () => Promise<string | null | undefined> | string | null | undefined;
  fetch?: typeof fetch;
}

export type ApiClient = ReturnType<typeof createApiClient>;

/** Typed client for apps/web API routes. Used by the web app and all three Expo apps. */
export function createApiClient({
  baseUrl,
  getAccessToken,
  fetch: doFetch = (...a) => fetch(...a),
}: ApiClientOptions) {
  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json', ...extraHeaders };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const token = await getAccessToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;

    let res: Response;
    try {
      res = await doFetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      throw new ApiClientError('NETWORK', "Can't reach Shopinbos. Check your connection.", 0, err);
    }
    const json = (await res.json().catch(() => null)) as T | ApiError | null;
    if (!res.ok) {
      const e = (json as ApiError | null)?.error;
      throw new ApiClientError(
        e?.code ?? 'INTERNAL',
        e?.message ?? 'Something went wrong. Try again.',
        res.status,
        e?.details,
      );
    }
    return json as T;
  }

  return {
    request,
    auth: {
      start: (input: OtpStartInput) =>
        request<ApiOne<{ sent: true }>>('POST', '/api/auth/otp/start', input).then((r) => r.data),
      verify: (input: OtpVerifyInput) =>
        request<ApiOne<SessionDto>>('POST', '/api/auth/otp/verify', input).then((r) => r.data),
    },
    me: {
      get: () => request<ApiOne<MeDto>>('GET', '/api/me').then((r) => r.data),
      registerDevice: (input: DeviceRegisterInput) =>
        request<ApiOne<{ id: string }>>('POST', '/api/me/devices', input).then((r) => r.data),
    },
  };
}
