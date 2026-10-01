import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/api/client';
import { isValidSeatHash, resolveSeatHash } from '@/api/endpoints';
import type { ResolvedSeat } from '@/api/types';

/** Why a sticker cannot be used. Each maps to its own copy on the error screen. */
export type SeatFailure = 'invalid' | 'inactive' | 'unknown';

export type SeatSessionState =
  | { status: 'loading' }
  | { status: 'unavailable'; reason: SeatFailure }
  | { status: 'error'; retryable: boolean }
  | { status: 'ready'; seat: ResolvedSeat };

/**
 * Turns a scanned QR hash into a seat.
 *
 * This is the single entry point to the ordering experience. It never accepts a
 * seat, screen or theater from the URL - the hash is the capability, and the
 * response is the only source of truth.
 */
export function useSeatSession(hash: string): SeatSessionState & { retry: () => void } {
  const [state, setState] = useState<SeatSessionState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    // Reject a malformed sticker without spending a request on it.
    if (!isValidSeatHash(hash)) {
      setState({ status: 'unavailable', reason: 'invalid' });
      return;
    }

    const controller = new AbortController();
    setState({ status: 'loading' });

    resolveSeatHash(hash, controller.signal)
      .then((seat) => {
        if (!controller.signal.aborted) setState({ status: 'ready', seat });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;

        if (error instanceof ApiError) {
          if (error.isQrInactive) {
            setState({ status: 'unavailable', reason: 'inactive' });
            return;
          }
          if (error.isQrUnknown || error.isQrMalformed) {
            setState({ status: 'unavailable', reason: 'unknown' });
            return;
          }
          setState({ status: 'error', retryable: error.isRetryable });
          return;
        }

        setState({ status: 'error', retryable: true });
      });

    return () => controller.abort();
  }, [hash, attempt]);

  return { ...state, retry };
}
