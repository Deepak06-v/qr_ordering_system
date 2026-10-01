import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderAt } from '@/test/renderAt';
import { ITEM_POPCORN_L, PIN, VALID_HASH, order, seat } from '@/test/fixtures';
import { useOrderSessionStore, cartFingerprint } from '@/store/orderSessionStore';
import { useCartStore } from '@/store/cartStore';

/**
 * The PIN is issued exactly once by the server - it keeps only a scrypt hash.
 * If the browser forgets it, the customer can never collect their food, so
 * surviving a reload is a hard requirement, not a nicety.
 */
function seedConfirmedOrder() {
  useOrderSessionStore.getState().confirmPayment({
    orderId: order.orderId,
    orderNumber: order.orderNumber,
    hash: VALID_HASH,
    theaterName: seat.theater.name,
    screenNumber: order.screenNumber,
    seatNumber: order.seatNumber,
    totalAmount: order.totalAmount,
    items: order.items,
    status: order.status,
    pin: PIN,
    confirmedAt: order.createdAt,
  });
}

describe('order persistence', () => {
  it('renders the confirmation straight from local state, with no network call', async () => {
    seedConfirmedOrder();

    renderAt(`/${VALID_HASH}`);

    expect(
      await screen.findByRole('heading', { name: 'Order confirmed' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(`Delivery PIN: 8 4 9 2`)).toBeInTheDocument();
    // The menu is never fetched once an order is confirmed for this seat.
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
  });

  it('survives a full unmount and remount', async () => {
    seedConfirmedOrder();
    const { unmount } = renderAt(`/${VALID_HASH}`);
    await screen.findByLabelText(`Delivery PIN: 8 4 9 2`);
    unmount();

    renderAt(`/${VALID_HASH}`);
    expect(await screen.findByLabelText(`Delivery PIN: 8 4 9 2`)).toBeInTheDocument();
  });

  it('does not leak a confirmed order to a different seat', async () => {
    seedConfirmedOrder();
    renderAt(`/zZ00zz11ZZ22yy33XX44yy55`);

    // A different sticker is a different customer: the QR error wins, and the
    // other seat's PIN is never rendered.
    expect(
      await screen.findByRole('heading', { name: 'QR code not recognised' }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/Delivery PIN/)).not.toBeInTheDocument();
  });

  it('resumes an in-flight attempt instead of starting a second order', () => {
    useOrderSessionStore.getState().beginAttempt({ hash: VALID_HASH, fingerprint: 'm1x2' });
    useOrderSessionStore.getState().recordOrderId('66a1b2c3d4e5f60718293a99');
    useOrderSessionStore.getState().recordPaymentId('pay_sim_1');

    const resumed = useOrderSessionStore
      .getState()
      .beginAttempt({ hash: VALID_HASH, fingerprint: 'm1x2' });

    // Same sticker, same basket: the ids the server already issued survive, so
    // the retry cannot create a second order or a second charge.
    expect(resumed.orderId).toBe('66a1b2c3d4e5f60718293a99');
    expect(resumed.paymentId).toBe('pay_sim_1');
  });

  it('starts a genuinely new attempt when the basket changes', () => {
    useOrderSessionStore.getState().beginAttempt({ hash: VALID_HASH, fingerprint: 'm1x1' });
    useOrderSessionStore.getState().recordOrderId('66a1b2c3d4e5f60718293a99');

    const changed = useOrderSessionStore
      .getState()
      .beginAttempt({ hash: VALID_HASH, fingerprint: 'm1x2' });

    expect(changed.orderId).toBeUndefined();
    expect(changed.paymentId).toBeUndefined();
  });

  it('does not resume another sticker\'s attempt', () => {
    useOrderSessionStore.getState().beginAttempt({ hash: VALID_HASH, fingerprint: 'm1x1' });
    useOrderSessionStore.getState().recordOrderId('66a1b2c3d4e5f60718293a99');

    const other = useOrderSessionStore
      .getState()
      .beginAttempt({ hash: 'zZ00zz11ZZ22yy33XX44yy55', fingerprint: 'm1x1' });

    expect(other.orderId).toBeUndefined();
  });

  it('fingerprints a basket independently of its order', () => {
    expect(cartFingerprint([{ itemId: 'b', quantity: 1 }, { itemId: 'a', quantity: 2 }])).toBe(
      cartFingerprint([{ itemId: 'a', quantity: 2 }, { itemId: 'b', quantity: 1 }]),
    );
  });
});

describe('cart persistence', () => {
  it('restores a cart after a reload for the same sticker', async () => {
    useCartStore.setState({ sessionHash: VALID_HASH, items: [] });
    useCartStore.getState().addItem({
      itemId: ITEM_POPCORN_L,
      name: 'Large Popcorn',
      price: 35000,
    });

    const { unmount } = renderAt(`/${VALID_HASH}`);
    await screen.findByRole('tabpanel');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /view order/i })).toHaveTextContent('₹350'),
    );
    unmount();

    renderAt(`/${VALID_HASH}`);
    await screen.findByRole('tabpanel');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /view order/i })).toHaveTextContent('₹350'),
    );
  });

  it('drops a cart that belongs to a different sticker', async () => {
    useCartStore.setState({ sessionHash: 'someOtherStickerHash1234', items: [] });
    useCartStore.getState().addItem({
      itemId: ITEM_POPCORN_L,
      name: 'Large Popcorn',
      price: 35000,
    });

    renderAt(`/${VALID_HASH}`);
    await screen.findByRole('tabpanel');

    expect(screen.queryByRole('button', { name: /view order/i })).not.toBeInTheDocument();
  });
});
