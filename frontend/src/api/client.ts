import type { ApiEnvelope } from './types';

/**
 * Client-side error taxonomy. Everything the UI needs to choose a message is on
 * here: `code` lets us branch on QR lifecycle states, and `kind` separates
 * "the network is bad" from "the server said no" from "we gave up waiting".
 *
 * Raw exception messages never reach the customer: the UI renders copy chosen
 * from `code`/`kind`, never `message`.
 */
export type ApiErrorKind = 'network' | 'timeout' | 'http' | 'contract' | 'aborted';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  /** Server error code, e.g. `QR_INACTIVE`. Absent for network failures. */
  readonly code?: string;
  readonly status?: number;
  readonly requestId?: string;

  constructor(
    kind: ApiErrorKind,
    message: string,
    options: { code?: string; status?: number; requestId?: string; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'ApiError';
    this.kind = kind;
    this.code = options.code;
    this.status = options.status;
    this.requestId = options.requestId;
  }

  /** True when retrying the exact same request could plausibly succeed. */
  get isRetryable(): boolean {
    return (
      this.kind === 'network' ||
      this.kind === 'timeout' ||
      (this.status !== undefined && this.status >= 500)
    );
  }

  /** The QR sticker does not exist. The customer scanned something else. */
  get isQrUnknown(): boolean {
    return this.kind === 'http' && this.code === 'QR_NOT_FOUND';
  }

  /** The sticker exists but was retired. Worn-out, or a remapped seat. */
  get isQrInactive(): boolean {
    return this.kind === 'http' && this.code === 'QR_INACTIVE';
  }

  /** The seat hash could not even be parsed (bad characters/length). */
  get isQrMalformed(): boolean {
    return this.kind === 'http' && this.code === 'INVALID_SEAT_HASH';
  }
}

function isApiEnvelope(value: unknown): value is ApiEnvelope<unknown> {
  return typeof value === 'object' && value !== null && 'success' in value;
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Absolute or same-origin API root.
 *
 * Empty means same-origin, which is the production setup (the backend serves the
 * API behind the same host as the app) and what the dev proxy emulates - so no
 * CORS preflight is needed on the intermission-critical path.
 */
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

/**
 * Single choke point for all HTTP traffic: no component calls `fetch`.
 *
 * Unwraps the shared envelope, converts every failure into an `ApiError`, and
 * guarantees the call cannot hang forever on a flaky theater connection.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const abortFromCaller = () => controller.abort();
  signal?.addEventListener('abort', abortFromCaller, { once: true });

  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      method,
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
      // QR URLs are bearer capabilities; never let a shared cache hold one.
      credentials: 'omit',
      cache: 'no-store',
    });
  } catch (error) {
    if (signal?.aborted) throw new ApiError('aborted', 'Request cancelled');
    if (controller.signal.aborted) {
      throw new ApiError('timeout', `Request timed out after ${timeoutMs}ms`);
    }
    throw new ApiError('network', 'Could not reach the server', { cause: error });
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', abortFromCaller);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    // A proxy or crash page returned HTML. Treat it as an opaque server fault.
    throw new ApiError('http', 'Unexpected response from the server', { status: response.status });
  }

  if (!isApiEnvelope(payload)) {
    throw new ApiError('contract', 'Malformed response from the server', {
      status: response.status,
    });
  }

  if (!payload.success) {
    throw new ApiError('http', payload.error.message, {
      code: payload.error.code,
      status: response.status,
      ...(payload.error.requestId ? { requestId: payload.error.requestId } : {}),
    });
  }

  return payload.data as T;
}
