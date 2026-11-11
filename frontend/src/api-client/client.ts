import type { ApiFailure, ApiMeta, ApiResponse, ApiSuccess } from '@vj/types';

export type TokenProvider = () => string | null;
export type TokenRefresher = () => Promise<string | null>;

export interface ApiClientOptions {
  baseUrl: string;
  getAccessToken?: TokenProvider;
  refreshAccessToken?: TokenRefresher;
}

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function buildQuery(params?: Record<string, string | number | boolean | undefined | null>): string {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const q = search.toString();
  return q ? `?${q}` : '';
}

export function createApiClient(options: ApiClientOptions) {
  const { baseUrl, getAccessToken, refreshAccessToken } = options;

  async function requestEnvelope<T>(
    path: string,
    init: RequestInit & { query?: Record<string, string | number | boolean | undefined | null> } = {},
    retried = false,
  ): Promise<ApiSuccess<T>> {
    const { query, ...fetchInit } = init;
    const headers = new Headers(fetchInit.headers);
    if (!headers.has('Content-Type') && fetchInit.body && !(fetchInit.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }
    const token = getAccessToken?.();
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const url = `${baseUrl.replace(/\/$/, '')}${path}${buildQuery(query)}`;
    const res = await fetch(url, { ...fetchInit, headers });

    if (res.status === 401 && refreshAccessToken && !retried) {
      const newToken = await refreshAccessToken();
      if (newToken) return requestEnvelope<T>(path, init, true);
    }

    const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;

    if (!json || typeof json !== 'object' || !('success' in json)) {
      throw new ApiError('NETWORK_ERROR', res.statusText || 'Request failed', res.status);
    }

    if (!json.success) {
      const failure = json as ApiFailure;
      throw new ApiError(
        failure.error.code,
        failure.error.message,
        res.status,
        failure.error.details,
      );
    }

    return json as ApiSuccess<T>;
  }

  async function request<T>(
    path: string,
    init: RequestInit & { query?: Record<string, string | number | boolean | undefined | null> } = {},
    retried = false,
  ): Promise<T> {
    const envelope = await requestEnvelope<T>(path, init, retried);
    return envelope.data;
  }

  return {
    get: <T>(path: string, query?: Record<string, string | number | boolean | undefined | null>) =>
      request<T>(path, { method: 'GET', query }),
    getWithMeta: <T>(
      path: string,
      query?: Record<string, string | number | boolean | undefined | null>,
    ) => requestEnvelope<T>(path, { method: 'GET', query }),
    post: <T>(path: string, body?: unknown) =>
      request<T>(path, {
        method: 'POST',
        body:
          typeof FormData !== 'undefined' && body instanceof FormData
            ? body
            : body !== undefined
              ? JSON.stringify(body)
              : undefined,
      }),
    patch: <T>(path: string, body?: unknown) =>
      request<T>(path, { method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined }),
    put: <T>(path: string, body?: unknown) =>
      request<T>(path, { method: 'PUT', body: body !== undefined ? JSON.stringify(body) : undefined }),
    delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  };
}

export type PaginatedResult<T> = { data: T; meta: ApiMeta };

export type ApiClient = ReturnType<typeof createApiClient>;
