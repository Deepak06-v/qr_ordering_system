import type { Server } from 'node:http';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { app } from './helpers';
import { initRealtime, type Realtime } from '../src/socket';
import {
  SOCKET_EVENTS,
  emitOrderCancelled,
  emitOrderNew,
  emitOrderUpdated,
  setRealtimePublisher,
  theaterRoom,
  type OrderEventPayload,
  type RealtimePublisher,
} from '../src/services/realtime.service';
import { api, openPayment, placeOrder, seedOrderableTheater } from './helpers';

const payload: OrderEventPayload = {
  orderId: 'a'.repeat(24),
  orderNumber: 'FM-1042',
  theaterId: 'b'.repeat(24),
  screenNumber: 4,
  seatNumber: 'G3',
  items: [{ name: 'Classic Popcorn', quantity: 2, price: 18000 }],
  totalAmount: 36000,
  status: 'PAID',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  verificationPin: '8492',
};

describe('realtime.service', () => {
  let emitted: Array<{ theaterId: string; event: string; payload: unknown }>;

  beforeEach(() => {
    emitted = [];
    const publisher: RealtimePublisher = {
      emitToTheater(theaterId, event, body) {
        emitted.push({ theaterId, event, payload: body });
      },
    };
    setRealtimePublisher(publisher);
  });

  afterEach(() => {
    setRealtimePublisher(null);
  });

  it('namespaces a room per theater', () => {
    expect(theaterRoom('abc')).toBe('theater:abc');
  });

  it('emits each event to the originating theater room only', () => {
    emitOrderNew(payload);
    emitOrderUpdated(payload);
    emitOrderCancelled(payload);

    expect(emitted.map((e) => e.event)).toEqual([
      SOCKET_EVENTS.ORDER_NEW,
      SOCKET_EVENTS.ORDER_UPDATED,
      SOCKET_EVENTS.ORDER_CANCELLED,
    ]);
    expect(emitted.every((e) => e.theaterId === payload.theaterId)).toBe(true);
  });

  it('carries the PIN on order:new so the kitchen can verify delivery', () => {
    emitOrderNew(payload);
    expect((emitted[0]?.payload as OrderEventPayload).verificationPin).toBe('8492');
  });

  it('never attaches a PIN to order:updated or order:cancelled', () => {
    emitOrderUpdated({ ...payload, verificationPin: undefined });
    emitOrderCancelled(payload);

    for (const entry of emitted) {
      expect((entry.payload as OrderEventPayload).verificationPin).toBeUndefined();
    }
  });

  it('does not throw when no publisher is attached', () => {
    setRealtimePublisher(null);
    expect(() => emitOrderNew(payload)).not.toThrow();
  });
});

describe('Socket.io transport', () => {
  let server: Server;
  let realtime: Realtime;
  let baseUrl: string;
  const clients: ClientSocket[] = [];

  const connect = (): ClientSocket => {
    const client = ioClient(baseUrl, {
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    clients.push(client);
    return client;
  };

  const joinKds = (client: ClientSocket, theaterId: string): Promise<Record<string, unknown>> =>
    new Promise((resolve) => {
      client.once(SOCKET_EVENTS.KDS_JOINED, resolve);
      client.emit(SOCKET_EVENTS.KDS_JOIN, { theaterId });
    });

  const nextEvent = (client: ClientSocket, event: string): Promise<Record<string, unknown>> =>
    new Promise((resolve) => {
      client.once(event, resolve);
    });

  /**
   * Asserts an event does NOT arrive.
   *
   * The listener is removed before returning. `Promise.race` alone is not enough:
   * an unawaited `once` listener stays attached, and would then swallow the very
   * event a later assertion is waiting for.
   */
  const expectNoEvent = async (client: ClientSocket, event: string): Promise<void> => {
    let seen = false;
    const listener = (): void => {
      seen = true;
    };
    client.on(event, listener);
    await new Promise((resolve) => setTimeout(resolve, 250));
    client.off(event, listener);
    expect(seen).toBe(false);
  };

  beforeAll(async () => {
    server = createServer(app);
    realtime = initRealtime(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    for (const client of clients) client.disconnect();
    await realtime.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('accepts a join and reports the rooms it joined', async () => {
    const client = connect();
    const ack = await joinKds(client, 'a'.repeat(24));

    expect(ack.theaterId).toBe('a'.repeat(24));
    expect(ack.rooms).toEqual([theaterRoom('a'.repeat(24))]);
  });

  it('refuses a malformed theater id', async () => {
    const client = connect();
    const failure = await new Promise<Record<string, unknown>>((resolve) => {
      client.once(SOCKET_EVENTS.KDS_JOIN_FAILED, resolve);
      client.emit(SOCKET_EVENTS.KDS_JOIN, { theaterId: 'not-an-id' });
    });

    expect(failure.reason).toBe('INVALID_THEATER_ID');
  });

  it('adds a screen room when a screen is requested', async () => {
    const client = connect();
    const ack = await new Promise<Record<string, unknown>>((resolve) => {
      client.once(SOCKET_EVENTS.KDS_JOINED, resolve);
      client.emit(SOCKET_EVENTS.KDS_JOIN, { theaterId: 'b'.repeat(24), screenNumber: 4 });
    });

    expect(ack.rooms).toEqual([theaterRoom('b'.repeat(24)), `${theaterRoom('b'.repeat(24))}:screen:4`]);
  });

  it('delivers order:new only to the matching theater room', async () => {
    const seed = await seedOrderableTheater({ name: 'Realtime Cinema' });
    const otherTheater = (await api()
      .post('/api/theaters')
      .send({ name: 'Unrelated Cinema' })
      .expect(201)).body.data.id as string;

    const ours = connect();
    const theirs = connect();
    await joinKds(ours, seed.theaterId);
    await joinKds(theirs, otherTheater);

    const received = nextEvent(ours, SOCKET_EVENTS.ORDER_NEW);

    const order = await placeOrder(seed);
    const payment = await openPayment(order.orderId);
    await api()
      .post(`/api/orders/${order.orderId}/payments/verify`)
      .send({ paymentId: payment.paymentId })
      .expect(200);

    const event = await received;
    expect(event.orderNumber).toBe(order.orderNumber);
    expect(event.orderId).toBe(order.orderId);
    expect(event.theaterId).toBe(seed.theaterId);
    expect(event.seatNumber).toBe(seed.seatNumber);
    expect(event.verificationPin).toMatch(/^\d{4}$/);

    // The other cinema's board must see nothing.
    await expectNoEvent(theirs, SOCKET_EVENTS.ORDER_NEW);

    ours.disconnect();
    theirs.disconnect();
  });

  it('does not emit order:new until payment is verified', async () => {
    const seed = await seedOrderableTheater({ name: 'Quiet Cinema' });
    const client = connect();
    await joinKds(client, seed.theaterId);

    const order = await placeOrder(seed);
    await openPayment(order.orderId);

    await expectNoEvent(client, SOCKET_EVENTS.ORDER_NEW);

    const payment = await openPayment(order.orderId);
    const received = nextEvent(client, SOCKET_EVENTS.ORDER_NEW);
    await api()
      .post(`/api/orders/${order.orderId}/payments/verify`)
      .send({ paymentId: payment.paymentId })
      .expect(200);

    const event = await received;
    expect(event.orderId).toBe(order.orderId);
    client.disconnect();
  });

  it('emits order:updated when the kitchen advances an order', async () => {
    const seed = await seedOrderableTheater({ name: 'Advancing Cinema' });
    const order = await placeOrder(seed);
    const payment = await openPayment(order.orderId);
    await api()
      .post(`/api/orders/${order.orderId}/payments/verify`)
      .send({ paymentId: payment.paymentId })
      .expect(200);

    const client = connect();
    await joinKds(client, seed.theaterId);

    const updated = nextEvent(client, SOCKET_EVENTS.ORDER_UPDATED);
    await api()
      .patch(`/api/orders/${order.orderId}/status`)
      .send({ status: 'PREPARING' })
      .expect(200);

    const event = await updated;
    expect(event.status).toBe('PREPARING');
    expect(event.verificationPin).toBeUndefined();
    client.disconnect();
  });

  it('emits order:cancelled and not order:updated when an order is cancelled', async () => {
    const seed = await seedOrderableTheater({ name: 'Cancelling Cinema' });
    const order = await placeOrder(seed);
    const payment = await openPayment(order.orderId);
    await api()
      .post(`/api/orders/${order.orderId}/payments/verify`)
      .send({ paymentId: payment.paymentId })
      .expect(200);

    const client = connect();
    await joinKds(client, seed.theaterId);

    const cancelled = nextEvent(client, SOCKET_EVENTS.ORDER_CANCELLED);
    await api()
      .patch(`/api/orders/${order.orderId}/status`)
      .send({ status: 'CANCELLED' })
      .expect(200);

    const event = await cancelled;
    expect(event.status).toBe('CANCELLED');
    client.disconnect();
  });

  it('sends no order event at all for an unpaid order', async () => {
    const seed = await seedOrderableTheater({ name: 'Unpaid Cinema' });
    const client = connect();
    await joinKds(client, seed.theaterId);

    await placeOrder(seed);
    await expectNoEvent(client, SOCKET_EVENTS.ORDER_NEW);
    await expectNoEvent(client, SOCKET_EVENTS.ORDER_UPDATED);
    client.disconnect();
  });
});
