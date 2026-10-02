import type { ValidationDetail } from './types';

/**
 * API prefix. Local dev and same-origin deployments use the gateway proxy
 * (`/api`). On hosts where the frontend and backend are separate origins
 * (e.g. two Railway services), set `VITE_API_BASE` at build time to the
 * backend origin (`https://<backend>.up.railway.app`) or its full API base.
 */
function resolveApiBase(): string {
  const raw = (import.meta.env.VITE_API_BASE ?? '').trim().replace(/\/+$/, '');
  if (!raw) return '/api';
  return raw.endsWith('/api') ? raw : `${raw}/api`;
}

export const API_BASE = resolveApiBase();

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: ValidationDetail[],
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isNetwork(): boolean {
    return this.status === 0;
  }

  get isAuthError(): boolean {
    return this.status === 401;
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string | null;
  timeoutMs?: number;
  retries?: number;
}

const RETRYABLE_STATUS = new Set([408, 425, 500, 502, 503, 504]);
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRIES = 2;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeDelay(attempt: number): number {
  const base = 300 * 2 ** attempt;
  return base + Math.floor(Math.random() * 150);
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function toApiError(status: number, payload: unknown, retryable: boolean): ApiError {
  const envelope = payload as
    | { success?: boolean; error?: { code?: string; message?: string; details?: ValidationDetail[] } }
    | null;
  const code = envelope?.error?.code ?? `HTTP_${status}`;
  const message = envelope?.error?.message ?? `Request failed (${status})`;
  return new ApiError(status, code, message, envelope?.error?.details, retryable);
}

/**
 * Thin fetch wrapper around the Chika's Game Hub API.
 * - adds the bearer token when supplied
 * - applies an abort timeout
 * - retries transient failures (network errors / 5xx) with backoff
 * - unwraps the { success, data } / { success, error } envelope
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token, timeoutMs = DEFAULT_TIMEOUT_MS, retries = DEFAULT_RETRIES } = options;
  const clean = path.replace(/^\/+/, '').replace(/^api\//, '');
  const url = `${API_BASE}/${clean}`;

  let lastError: ApiError | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (token) headers.Authorization = `Bearer ${token}`;

      const response = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });

      const payload = await parseBody(response);

      if (response.ok) {
        const envelope = payload as { success?: boolean; data?: T } | null;
        if (envelope && typeof envelope === 'object' && 'success' in envelope) {
          if (envelope.success === false) {
            throw toApiError(response.status, payload, false);
          }
          return envelope.data as T;
        }
        return payload as T;
      }

      const retryable = RETRYABLE_STATUS.has(response.status);
      const error = toApiError(response.status, payload, retryable);
      if (!retryable || attempt === retries) throw error;
      lastError = error;
    } catch (err) {
      if (err instanceof ApiError) {
        if (!err.retryable || attempt === retries) throw err;
        lastError = err;
      } else {
        const aborted = err instanceof DOMException && err.name === 'AbortError';
        const networkError = new ApiError(
          0,
          aborted ? 'TIMEOUT' : 'NETWORK_ERROR',
          aborted
            ? 'The request took too long. Please check your connection and try again.'
            : 'We could not reach the server. Please check your connection and try again.',
          undefined,
          !aborted,
        );
        if (aborted || attempt === retries) throw networkError;
        lastError = networkError;
      }
    } finally {
      clearTimeout(timer);
    }

    await sleep(computeDelay(attempt));
  }

  throw lastError ?? new ApiError(0, 'NETWORK_ERROR', 'Unable to complete the request', undefined, true);
}

export const api = {
  get: <T>(path: string, token?: string | null) => apiRequest<T>(path, { method: 'GET', token }),
  post: <T>(path: string, body?: unknown, token?: string | null) =>
    apiRequest<T>(path, { method: 'POST', body, token }),
};
