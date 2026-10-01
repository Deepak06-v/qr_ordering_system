import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { server } from './server';
import { resetTestState } from './resetState';

/* jsdom implements neither of these, and both are called on mount by the
 * category rail and the route-level scroll reset. */
window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
Element.prototype.scrollIntoView = vi.fn();

/* jsdom does not always expose randomUUID. The idempotency key must never
 * silently fall back to a predictable value. */
if (typeof globalThis.crypto?.randomUUID !== 'function') {
  let counter = 0;
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: {
      ...globalThis.crypto,
      randomUUID: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
    },
  });
}

/**
 * AbortSignal realm mismatch.
 *
 * Under Vitest's jsdom environment the global `AbortController` comes from a
 * different realm than the one Node's `fetch`/undici validates against, so an
 * `init.signal` throws a TypeError before a request is even made. This is a
 * test-environment artefact - in a browser there is a single realm and the
 * signal passes straight through.
 *
 * Rather than weaken the production client, this shim strips `signal` from the
 * init and re-implements exactly the behaviour the client depends on: the
 * returned promise rejects when the signal aborts. Request timeouts,
 * cancellation and error mapping are therefore still exercised end to end.
 *
 * It must be installed AFTER `server.listen()`, which is what replaces
 * `globalThis.fetch` with MSW's interceptor - otherwise the interceptor sees
 * the raw signal and throws before the shim runs.
 */
function installAbortShim(): void {
  const intercepted = globalThis.fetch.bind(globalThis);

  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const { signal, ...rest } = init ?? {};

    if (!signal) return intercepted(input, rest);
    if (signal.aborted) {
      return Promise.reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    }

    return new Promise<Response>((resolve, reject) => {
      signal.addEventListener(
        'abort',
        () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError')),
        { once: true },
      );
      intercepted(input, rest).then(resolve, reject);
    });
  }) as typeof globalThis.fetch;
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  installAbortShim();
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetTestState();
});

afterAll(() => server.close());

beforeEach(() => {
  localStorage.clear();
});
