import { useEffect } from 'react';
import { getOrder } from '@/api/endpoints';
import { STATUS_POLL_INTERVAL_MS } from '@/lib/constants';
import { useOrderSessionStore, type ConfirmedOrder } from '@/store/orderSessionStore';

/**
 * Keeps the fulfilment status on the confirmation screen current.
 *
 * Polling rather than a socket: this page is a single customer's, it is open
 * for a few minutes at most, and a 12s poll on one order id is far cheaper than
 * a persistent connection in a theatre with 300 seats and bad Wi-Fi.
 *
 * Deliberately cannot deliver the PIN - the endpoint never returns it, and the
 * only copy that exists is the one already on this device.
 */
export function useOrderStatusPolling(order: ConfirmedOrder | null): void {
  const setStatus = useOrderSessionStore((state) => state.setStatus);

  useEffect(() => {
    if (!order || order.status === 'DELIVERED' || order.status === 'CANCELLED') return;

    let cancelled = false;

    const tick = async () => {
      try {
        const latest = await getOrder(order.orderId);
        if (!cancelled) setStatus(latest.status);
      } catch {
        // A failed poll is invisible on purpose: the customer is here to read
        // a PIN, not to debug their connection. The next tick tries again.
      }
    };

    const id = setInterval(() => void tick(), STATUS_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [order, setStatus]);
}
