import { describe, expect, it } from 'vitest';
import { http } from 'msw';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt } from '@/test/renderAt';
import { VALID_HASH, order, payment, verified } from '@/test/fixtures';
import { server } from '@/test/server';
import { fail, ok } from '@/test/handlers';

async function openCheckout(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Add Large Popcorn to order' }));
  await user.click(screen.getByRole('button', { name: 'Increase Large Popcorn' }));
  await user.click(screen.getByRole('button', { name: /view order/i }));
  await user.click(await screen.findByRole('button', { name: 'Proceed to checkout' }));
  return screen.findByRole('dialog', { name: 'Checkout' });
}

/** Records every request the payment flow makes, in order. */
function traceCalls() {
  const calls: string[] = [];
  server.events.on('request:start', ({ request }) => {
    if (request.method === 'POST') {
      calls.push(`${request.method} ${new URL(request.url).pathname}`);
    }
  });
  return calls;
}

describe('checkout', () => {
  it('shows the order, a read-only seat and a large pay button', async () => {
    const user = userEvent.setup();
    renderAt(`/${VALID_HASH}`);
    await screen.findByRole('tabpanel');

    const sheet = await openCheckout(user);

    expect(within(sheet).getByText('2×')).toBeInTheDocument();
    // ₹700 appears twice on purpose: once as the line total, once as the
    // order total. The pay button restates the authoritative number.
    expect(within(sheet).getAllByText('₹700')).toHaveLength(2);
    expect(within(sheet).getByRole('button', { name: 'Pay ₹700' })).toBeInTheDocument();
    expect(within(sheet).getByText('Seat G3 • Screen 4')).toBeInTheDocument();

    // The seat is text, never an input. Nothing on this screen is editable.
    expect(within(sheet).queryByRole('textbox')).not.toBeInTheDocument();
    expect(within(sheet).queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Edit order' })).toBeInTheDocument();
  });

  it('never asks for a name, phone, email or address', async () => {
    const user = userEvent.setup();
    renderAt(`/${VALID_HASH}`);
    await screen.findByRole('tabpanel');
    const sheet = await openCheckout(user);

    for (const label of [/name/i, /phone/i, /email/i, /address/i, /delivery note/i]) {
      expect(within(sheet).queryByLabelText(label)).not.toBeInTheDocument();
    }
    expect(within(sheet).queryAllByRole('textbox')).toHaveLength(0);
  });

  it('lets the customer go back and edit the order', async () => {
    const user = userEvent.setup();
    renderAt(`/${VALID_HASH}`);
    await screen.findByRole('tabpanel');
    const sheet = await openCheckout(user);

    await user.click(within(sheet).getByRole('button', { name: 'Edit order' }));

    const cart = await screen.findByRole('dialog', { name: 'Your order' });
    await user.click(within(cart).getByRole('button', { name: 'Increase Large Popcorn' }));
    expect(screen.getByRole('button', { name: /view order/i })).toHaveTextContent('₹1,050');
  });
});

describe('payment', () => {
  it('walks the documented three-step flow', async () => {
    const user = userEvent.setup();
    const calls = traceCalls();

    renderAt(`/${VALID_HASH}`);
    await screen.findByRole('tabpanel');
    const sheet = await openCheckout(user);
    await user.click(within(sheet).getByRole('button', { name: /pay ₹700/i }));

    await screen.findByRole('heading', { name: 'Order confirmed' });

    expect(calls).toEqual([
      'POST /api/orders',
      `POST /api/orders/${order.orderId}/payments`,
      `POST /api/orders/${order.orderId}/payments/verify`,
    ]);
  });

  it('sends only item ids and quantities, never a price or a seat', async () => {
    const user = userEvent.setup();

    let body: unknown = null;
    server.use(
      http.post('/api/orders', async ({ request }) => {
        body = await request.json();
        return ok({ ...order, status: 'PENDING_PAYMENT', paymentStatus: 'PENDING' });
      }),
    );

    renderAt(`/${VALID_HASH}`);
    await screen.findByRole('tabpanel');
    const sheet = await openCheckout(user);
    await user.click(within(sheet).getByRole('button', { name: /pay ₹700/i }));

    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toEqual({
      hash: VALID_HASH,
      items: [{ itemId: order.items[0]?.itemId, quantity: 2 }],
    });

    const serialised = JSON.stringify(body);
    expect(serialised).not.toMatch(/idempot|price|total|screen|seatNumber/i);
  });

  it('presents the provider payment id for verification', async () => {
    const user = userEvent.setup();

    let verifiedBody: unknown = null;
    server.use(
      http.post('/api/orders/:id/payments/verify', async ({ request }) => {
        verifiedBody = await request.json();
        return ok(verified);
      }),
    );

    renderAt(`/${VALID_HASH}`);
    await screen.findByRole('tabpanel');
    const sheet = await openCheckout(user);
    await user.click(within(sheet).getByRole('button', { name: /pay ₹700/i }));

    await screen.findByRole('heading', { name: 'Order confirmed' });
    expect(verifiedBody).toEqual({ paymentId: payment.paymentId });
  });

  it('resumes the same order rather than creating a second one', async () => {
    const user = userEvent.setup();

    let orderCreates = 0;
    let paymentOpens = 0;
    let verifications = 0;

    server.use(
      http.post('/api/orders', async () => {
        orderCreates += 1;
        return ok({ ...order, status: 'PENDING_PAYMENT', paymentStatus: 'PENDING' });
      }),
      http.post('/api/orders/:id/payments', async ({ params }) => {
        paymentOpens += 1;
        // The order exists and its id reached us; this response is what gets lost.
        if (paymentOpens === 1) return fail(504, 'INTERNAL_SERVER_ERROR', 'gateway timeout');
        if (params.id !== order.orderId) return fail(404, 'ORDER_NOT_FOUND', 'Order not found');
        return ok(payment);
      }),
      http.post('/api/orders/:id/payments/verify', () => {
        verifications += 1;
        return ok(verified);
      }),
    );

    renderAt(`/${VALID_HASH}`);
    await screen.findByRole('tabpanel');
    const sheet = await openCheckout(user);

    await user.click(within(sheet).getByRole('button', { name: /pay ₹700/i }));
    await screen.findByRole('alert');

    await user.click(within(sheet).getByRole('button', { name: /pay ₹700/i }));
    await screen.findByRole('heading', { name: 'Order confirmed' });

    // The retry resumed the order it already had rather than creating another.
    expect(orderCreates).toBe(1);
    expect(paymentOpens).toBe(2);
    expect(verifications).toBe(1);
  });

  it('ignores repeat taps while the payment is in flight', async () => {
    const user = userEvent.setup();
    let orderCreates = 0;
    let release: (() => void) | undefined;

    server.use(
      http.post('/api/orders', async () => {
        orderCreates += 1;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return ok({ ...order, status: 'PENDING_PAYMENT', paymentStatus: 'PENDING' });
      }),
    );

    renderAt(`/${VALID_HASH}`);
    await screen.findByRole('tabpanel');
    const sheet = await openCheckout(user);

    const pay = within(sheet).getByRole('button', { name: /pay ₹700/i });
    await user.click(pay);
    await user.click(pay).catch(() => undefined);
    await user.click(pay).catch(() => undefined);

    expect(orderCreates).toBe(1);
    release?.();
    await screen.findByRole('heading', { name: 'Order confirmed' });
  });

  it('shows a friendly, non-technical message when payment fails', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('/api/orders', () =>
        fail(503, 'INTERNAL_SERVER_ERROR', 'MongoServerError: ECONNREFUSED'),
      ),
    );

    renderAt(`/${VALID_HASH}`);
    await screen.findByRole('tabpanel');
    const sheet = await openCheckout(user);
    await user.click(within(sheet).getByRole('button', { name: /pay ₹700/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Connection lost.');
    // The raw server message must never reach the customer.
    expect(alert).not.toHaveTextContent('MongoServerError');
    expect(alert).not.toHaveTextContent('ECONNREFUSED');
  });

  it('surfaces a sold-out item as an actionable message', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('/api/orders', () => fail(400, 'MENU_ITEM_UNAVAILABLE', 'item sold out')),
    );

    renderAt(`/${VALID_HASH}`);
    await screen.findByRole('tabpanel');
    const sheet = await openCheckout(user);
    await user.click(within(sheet).getByRole('button', { name: /pay ₹700/i }));

    expect(await screen.findByText('Some items just sold out.')).toBeInTheDocument();
  });

  it('explains an already-paid order instead of rendering a broken PIN', async () => {
    const user = userEvent.setup();
    // The one response that carried the PIN has been spent.
    server.use(
      http.post('/api/orders/:id/payments/verify', () =>
        ok({ order: { ...order, status: 'PAID', paymentStatus: 'COMPLETED' }, alreadyCompleted: true }),
      ),
    );

    renderAt(`/${VALID_HASH}`);
    await screen.findByRole('tabpanel');
    const sheet = await openCheckout(user);
    await user.click(within(sheet).getByRole('button', { name: /pay ₹700/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('already paid');
    expect(screen.queryByLabelText(/Delivery PIN/)).not.toBeInTheDocument();
  });

  it('does not show the PIN when verification is declined', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('/api/orders/:id/payments/verify', () =>
        fail(400, 'INVALID_PAYMENT', 'Payment could not be verified'),
      ),
    );

    renderAt(`/${VALID_HASH}`);
    await screen.findByRole('tabpanel');
    const sheet = await openCheckout(user);
    await user.click(within(sheet).getByRole('button', { name: /pay ₹700/i }));

    await screen.findByRole('alert');
    expect(screen.queryByLabelText(/Delivery PIN/)).not.toBeInTheDocument();
  });
});

describe('order confirmation', () => {
  it('shows the 4-digit PIN after a verified payment', async () => {
    const user = userEvent.setup();
    renderAt(`/${VALID_HASH}`);
    await screen.findByRole('tabpanel');
    const sheet = await openCheckout(user);

    await user.click(within(sheet).getByRole('button', { name: /pay ₹700/i }));

    expect(await screen.findByRole('heading', { name: 'Order confirmed' })).toBeInTheDocument();
    expect(screen.getByLabelText('Delivery PIN: 8 4 9 2')).toBeInTheDocument();
    expect(screen.getByText(/Show this PIN when your order arrives/i)).toBeInTheDocument();
    expect(screen.getByText('Seat G3 • Screen 4')).toBeInTheDocument();
    expect(screen.getByText('Payment confirmed')).toBeInTheDocument();
    expect(screen.getByText('FM-1042')).toBeInTheDocument();
  });

  it('empties the cart so a new order starts clean', async () => {
    const user = userEvent.setup();
    renderAt(`/${VALID_HASH}`);
    await screen.findByRole('tabpanel');
    const sheet = await openCheckout(user);
    await user.click(within(sheet).getByRole('button', { name: /pay ₹700/i }));

    await screen.findByRole('heading', { name: 'Order confirmed' });
    expect(screen.queryByRole('button', { name: /view order/i })).not.toBeInTheDocument();
  });

  it('offers to order again without ejecting the customer from the PIN screen', async () => {
    const user = userEvent.setup();
    renderAt(`/${VALID_HASH}`);
    await screen.findByRole('tabpanel');
    const sheet = await openCheckout(user);
    await user.click(within(sheet).getByRole('button', { name: /pay ₹700/i }));
    await screen.findByRole('heading', { name: 'Order confirmed' });

    await user.click(screen.getByRole('button', { name: /order something else/i }));

    expect(await screen.findByRole('tabpanel')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Delivery PIN/)).not.toBeInTheDocument();
  });
});