import { Counter } from '../src/models/Counter';
import { MenuItem } from '../src/models/MenuItem';
import { Order } from '../src/models/Order';
import { Payment } from '../src/models/Payment';
import { verifyVerificationPin } from '../src/services/pin.service';
import { setRealtimePublisher } from '../src/services/realtime.service';
import { api, createSeatHash, createTheater, placeOrder, seedOrderableTheater } from './helpers';

afterEach(() => {
  setRealtimePublisher(null);
});

describe('POST /api/orders', () => {
  it('creates an order in PENDING_PAYMENT and never marks it paid', async () => {
    const seed = await seedOrderableTheater();

    const order = await placeOrder(seed, 2);

    expect(order.status).toBe('PENDING_PAYMENT');
    expect(order.paymentStatus).toBe('PENDING');
    expect(order.totalAmount).toBe(36000);
    expect(order.orderNumber).toMatch(/^FM-\d+$/);
    expect(order.orderId).toMatch(/^[a-f0-9]{24}$/);

    // The plaintext PIN must not exist before money has moved.
    expect(order.verificationPin).toBeUndefined();
  });

  it('snapshots item name and price from the server-side menu', async () => {
    const seed = await seedOrderableTheater({ itemName: 'Classic Popcorn', price: 18000 });
    const order = await placeOrder(seed, 2);

    expect(order.items).toHaveLength(1);
    expect(order.items[0]).toMatchObject({
      itemId: seed.item.id,
      name: 'Classic Popcorn',
      quantity: 2,
      price: 18000,
    });

    // Raising the price afterwards must not rewrite history.
    await api()
      .patch(`/api/menu/items/${seed.item.id}`)
      .send({ price: 25000 })
      .expect(200);

    const refetched = await api().get(`/api/orders/${order.orderId}`).expect(200);
    expect(refetched.body.data.totalAmount).toBe(36000);
    expect(refetched.body.data.items[0].price).toBe(18000);
  });

  it('ignores a client-supplied price and totals from the menu instead', async () => {
    const seed = await seedOrderableTheater({ price: 18000 });

    // `.strict()` should reject the whole body: there is nowhere for a price to land.
    const tampered = await api()
      .post('/api/orders')
      .send({
        hash: seed.hash,
        items: [{ itemId: seed.item.id, quantity: 1, price: 1 }],
        totalAmount: 1,
      });

    expect(tampered.status).toBe(400);
    expect(tampered.body.error.code).toBe('VALIDATION_ERROR');

    const order = await placeOrder(seed);
    expect(order.totalAmount).toBe(18000);
  });

  it('derives the seat from the QR hash, not from anything the client claims', async () => {
    const seed = await seedOrderableTheater({ screenNumber: 4, seatNumber: 'G3' });
    const order = await placeOrder(seed);

    expect(order.screenNumber).toBe(4);
    expect(order.seatNumber).toBe('G3');
    expect(order.theaterId).toBe(seed.theaterId);
  });

  it('rejects an empty cart', async () => {
    const seed = await seedOrderableTheater();
    const response = await api().post('/api/orders').send({ hash: seed.hash, items: [] });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a quantity below 1 and above 20', async () => {
    const seed = await seedOrderableTheater();

    const zero = await api()
      .post('/api/orders')
      .send({ hash: seed.hash, items: [{ itemId: seed.item.id, quantity: 0 }] });
    expect(zero.status).toBe(400);

    const tooMany = await api()
      .post('/api/orders')
      .send({ hash: seed.hash, items: [{ itemId: seed.item.id, quantity: 21 }] });
    expect(tooMany.status).toBe(400);
  });

  it('rejects the same item listed twice', async () => {
    const seed = await seedOrderableTheater();
    const response = await api()
      .post('/api/orders')
      .send({
        hash: seed.hash,
        items: [
          { itemId: seed.item.id, quantity: 1 },
          { itemId: seed.item.id, quantity: 2 },
        ],
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an unknown menu item', async () => {
    const seed = await seedOrderableTheater();
    const response = await api()
      .post('/api/orders')
      .send({ hash: seed.hash, items: [{ itemId: new MenuItem()._id.toString(), quantity: 1 }] });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('MENU_ITEM_NOT_FOUND');
  });

  it("refuses another theater's menu item", async () => {
    const seed = await seedOrderableTheater();
    const otherTheaterId = (await createTheater({ name: 'Other Cinema' })).id;

    const otherItem = await api()
      .post('/api/menu')
      .send({ theaterId: otherTheaterId, name: 'Foreign Nachos', category: 'SNACKS', price: 9000 })
      .expect(201);

    const response = await api()
      .post('/api/orders')
      .send({ hash: seed.hash, items: [{ itemId: otherItem.body.data.id, quantity: 1 }] });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('MENU_ITEM_WRONG_THEATER');
  });

  it('refuses a sold-out item', async () => {
    const seed = await seedOrderableTheater();
    // Sold out is a soft flag, not a deletion: the item still exists on the menu
    // but must not be orderable.
    await api().patch(`/api/menu/items/${seed.item.id}`).send({ isAvailable: false }).expect(200);

    const response = await api()
      .post('/api/orders')
      .send({ hash: seed.hash, items: [{ itemId: seed.item.id, quantity: 1 }] });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('MENU_ITEM_UNAVAILABLE');
  });

  it('rejects an unknown or inactive QR hash', async () => {
    const seed = await seedOrderableTheater();

    const unknown = await api()
      .post('/api/orders')
      .send({ hash: 'a'.repeat(24), items: [{ itemId: seed.item.id, quantity: 1 }] });
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('QR_NOT_FOUND');

    const theaterId = (await createTheater({ name: 'Going Dark' })).id;
    const seat = await createSeatHash(theaterId, 'D1', 1);
    await api().patch(`/api/theaters/${theaterId}`).send({ isActive: false }).expect(200);

    const inactive = await api()
      .post('/api/orders')
      .send({ hash: seat.hash, items: [{ itemId: seed.item.id, quantity: 1 }] });
    expect(inactive.status).toBe(410);
  });

  it('issues a distinct, monotonic order number to every order', async () => {
    const seed = await seedOrderableTheater();

    const first = await placeOrder(seed);
    const second = await placeOrder(seed);
    const third = await placeOrder(seed);

    const numbers = [first.orderNumber, second.orderNumber, third.orderNumber];
    expect(new Set(numbers).size).toBe(3);

    const parsed = numbers.map((n) => Number(n.split('-')[1]));
    expect(parsed[1]).toBeGreaterThan(parsed[0] as number);
    expect(parsed[2]).toBeGreaterThan(parsed[1] as number);
  });

  it('keeps order numbers unique under concurrent creation', async () => {
    const seed = await seedOrderableTheater();

    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        api().post('/api/orders').send({ hash: seed.hash, items: [{ itemId: seed.item.id, quantity: 1 }] }),
      ),
    );

    expect(responses.every((r) => r.status === 201)).toBe(true);
    const numbers = responses.map((r) => r.body.data.orderNumber as string);
    expect(new Set(numbers).size).toBe(10);
    expect(await Order.countDocuments({})).toBe(10);
  });
});

describe('GET /api/orders/:id', () => {
  it('returns the order without the QR hash or any PIN', async () => {
    const seed = await seedOrderableTheater();
    const order = await placeOrder(seed);

    const response = await api().get(`/api/orders/${order.orderId}`).expect(200);
    const body = JSON.stringify(response.body);

    expect(response.body.data.orderId).toBe(order.orderId);
    expect(body).not.toContain(seed.hash);
    expect(body).not.toContain('verificationPin');
    expect(body).not.toContain('verificationPinHash');
  });

  it('404s an unknown order and 400s a malformed id', async () => {
    const missing = await api().get(`/api/orders/${'a'.repeat(24)}`);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('ORDER_NOT_FOUND');

    const malformed = await api().get('/api/orders/not-an-id');
    expect(malformed.status).toBe(400);
  });
});

describe('GET /api/orders (KDS feed)', () => {
  it('lists newest first, filtered by theater and status', async () => {
    const seedA = await seedOrderableTheater({ name: 'Cinema A' });
    const seedB = await seedOrderableTheater({ name: 'Cinema B', seatNumber: 'H7' });

    const older = await placeOrder(seedA);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const newer = await placeOrder(seedA);
    await placeOrder(seedB);

    const all = await api().get('/api/orders').query({ theaterId: seedA.theaterId }).expect(200);
    expect(all.body.data.total).toBe(2);
    expect(all.body.data.items.map((o: { orderId: string }) => o.orderId)).toEqual([
      newer.orderId,
      older.orderId,
    ]);

    // Cinema B's order must not appear in cinema A's feed.
    const other = await api().get('/api/orders').query({ theaterId: seedB.theaterId }).expect(200);
    expect(other.body.data.total).toBe(1);

    const byStatus = await api()
      .get('/api/orders')
      .query({ theaterId: seedA.theaterId, status: 'PAID' })
      .expect(200);
    expect(byStatus.body.data.total).toBe(0);
  });

  it('requires a theaterId - there is no cross-theater order list', async () => {
    const response = await api().get('/api/orders');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('never exposes a plaintext PIN, even for a paid order', async () => {
    const seed = await seedOrderableTheater();
    const order = await placeOrder(seed);

    const payment = await api().post(`/api/orders/${order.orderId}/payments`).expect(201);
    await api()
      .post(`/api/orders/${order.orderId}/payments/verify`)
      .send({ paymentId: payment.body.data.paymentId })
      .expect(200);

    const feed = await api().get('/api/orders').query({ theaterId: seed.theaterId }).expect(200);
    expect(feed.body.data.items[0].status).toBe('PAID');
    expect(JSON.stringify(feed.body)).not.toContain('verificationPin');
  });
});

describe('PATCH /api/orders/:id/status', () => {
  it('walks an order through the fulfillment states', async () => {
    const seed = await seedOrderableTheater();
    const order = await placeOrder(seed);

    const payment = await api().post(`/api/orders/${order.orderId}/payments`).expect(201);
    await api()
      .post(`/api/orders/${order.orderId}/payments/verify`)
      .send({ paymentId: payment.body.data.paymentId })
      .expect(200);

    for (const status of ['PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED']) {
      const response = await api()
        .patch(`/api/orders/${order.orderId}/status`)
        .send({ status })
        .expect(200);
      expect(response.body.data.status).toBe(status);
    }
  });

  it('cannot be used to mark an order paid - only payment verification can', async () => {
    const seed = await seedOrderableTheater();
    const order = await placeOrder(seed);

    const response = await api()
      .patch(`/api/orders/${order.orderId}/status`)
      .send({ status: 'PAID' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('refuses to move an unpaid order straight to DELIVERED', async () => {
    const seed = await seedOrderableTheater();
    const order = await placeOrder(seed);

    const response = await api()
      .patch(`/api/orders/${order.orderId}/status`)
      .send({ status: 'DELIVERED' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('treats DELIVERED and CANCELLED as terminal', async () => {
    const seed = await seedOrderableTheater();
    const order = await placeOrder(seed);
    const payment = await api().post(`/api/orders/${order.orderId}/payments`).expect(201);
    await api()
      .post(`/api/orders/${order.orderId}/payments/verify`)
      .send({ paymentId: payment.body.data.paymentId })
      .expect(200);

    for (const status of ['PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED']) {
      await api()
        .patch(`/api/orders/${order.orderId}/status`)
        .send({ status })
        .expect(200);
    }

    const afterDelivery = await api()
      .patch(`/api/orders/${order.orderId}/status`)
      .send({ status: 'CANCELLED' });
    expect(afterDelivery.status).toBe(409);
  });

  it('cannot skip a fulfillment state', async () => {
    const seed = await seedOrderableTheater();
    const order = await placeOrder(seed);
    const payment = await api().post(`/api/orders/${order.orderId}/payments`).expect(201);
    await api()
      .post(`/api/orders/${order.orderId}/payments/verify`)
      .send({ paymentId: payment.body.data.paymentId })
      .expect(200);

    // PAID -> DELIVERED bypasses both kitchen and courier states.
    const skipped = await api()
      .patch(`/api/orders/${order.orderId}/status`)
      .send({ status: 'DELIVERED' });
    expect(skipped.status).toBe(409);
    expect(skipped.body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('allows cancelling before delivery but not after', async () => {
    const seed = await seedOrderableTheater();
    const order = await placeOrder(seed);
    const payment = await api().post(`/api/orders/${order.orderId}/payments`).expect(201);
    await api()
      .post(`/api/orders/${order.orderId}/payments/verify`)
      .send({ paymentId: payment.body.data.paymentId })
      .expect(200);

    const cancelled = await api()
      .patch(`/api/orders/${order.orderId}/status`)
      .send({ status: 'CANCELLED' })
      .expect(200);
    expect(cancelled.body.data.status).toBe('CANCELLED');

    const reopen = await api()
      .patch(`/api/orders/${order.orderId}/status`)
      .send({ status: 'PREPARING' });
    expect(reopen.status).toBe(409);
  });

  it('repeating the current status is a no-op, not an error', async () => {
    const seed = await seedOrderableTheater();
    const order = await placeOrder(seed);
    const payment = await api().post(`/api/orders/${order.orderId}/payments`).expect(201);
    await api()
      .post(`/api/orders/${order.orderId}/payments/verify`)
      .send({ paymentId: payment.body.data.paymentId })
      .expect(200);

    await api()
      .patch(`/api/orders/${order.orderId}/status`)
      .send({ status: 'PREPARING' })
      .expect(200);

    const repeat = await api()
      .patch(`/api/orders/${order.orderId}/status`)
      .send({ status: 'PREPARING' })
      .expect(200);
    expect(repeat.body.data.status).toBe('PREPARING');
  });
});

describe('Order persistence', () => {
  it('stores the PIN only as a hash that verifies against the plaintext', async () => {
    const seed = await seedOrderableTheater();
    const order = await placeOrder(seed);
    const payment = await api().post(`/api/orders/${order.orderId}/payments`).expect(201);
    const verified = await api()
      .post(`/api/orders/${order.orderId}/payments/verify`)
      .send({ paymentId: payment.body.data.paymentId })
      .expect(200);

    const pin = verified.body.data.verificationPin as string;
    expect(pin).toMatch(/^\d{4}$/);

    const stored = await Order.findById(order.orderId).select('+verificationPinHash').lean();
    expect(JSON.stringify(stored)).not.toContain(pin);
    expect(verifyVerificationPin(pin, stored?.verificationPinHash ?? undefined)).toBe(true);
  });

  it('records paidAt exactly when the order becomes PAID', async () => {
    const seed = await seedOrderableTheater();
    const order = await placeOrder(seed);
    expect((await Order.findById(order.orderId).lean())?.paidAt).toBeUndefined();

    const payment = await api().post(`/api/orders/${order.orderId}/payments`).expect(201);
    await api()
      .post(`/api/orders/${order.orderId}/payments/verify`)
      .send({ paymentId: payment.body.data.paymentId })
      .expect(200);

    const paid = await Order.findById(order.orderId).lean();
    expect(paid?.paidAt).toBeInstanceOf(Date);
    expect(paid?.status).toBe('PAID');
  });

  it('keeps the order counter in its own collection', async () => {
    const seed = await seedOrderableTheater();
    await placeOrder(seed);

    const counter = await Counter.findOne({ key: 'orderNumber' }).lean();
    expect(counter?.value).toBeGreaterThan(0);
  });

  it('lets a cancelled order sit without any payment row', async () => {
    const seed = await seedOrderableTheater();
    const order = await placeOrder(seed);
    const payment = await api().post(`/api/orders/${order.orderId}/payments`).expect(201);
    await api()
      .post(`/api/orders/${order.orderId}/payments/verify`)
      .send({ paymentId: payment.body.data.paymentId })
      .expect(200);
    await api()
      .patch(`/api/orders/${order.orderId}/status`)
      .send({ status: 'CANCELLED' })
      .expect(200);

    // The payment row survives for reconciliation; the order is simply dead.
    expect(await Payment.countDocuments({ orderId: order.orderId })).toBe(1);
    expect((await Order.findById(order.orderId).lean())?.status).toBe('CANCELLED');
  });
});
