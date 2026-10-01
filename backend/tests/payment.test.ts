import { Order } from '../src/models/Order';
import { Payment } from '../src/models/Payment';
import { MockPaymentService } from '../src/services/payment/mock-payment.service';
import { getPaymentService, setPaymentService } from '../src/services/payment/payment.service';
import type {
  CreatePaymentInput,
  PaymentService,
  VerifyPaymentResult,
} from '../src/services/payment/payment.interface';
import { createVerificationPin } from '../src/services/pin.service';
import { setRealtimePublisher } from '../src/services/realtime.service';
import { api, openPayment, placeOrder, seedOrderableTheater } from './helpers';

afterEach(() => {
  setPaymentService(null);
  setRealtimePublisher(null);
});

describe('MockPaymentService', () => {
  const input: CreatePaymentInput = {
    orderId: 'a'.repeat(24),
    orderNumber: 'FM-1',
    theaterId: 'b'.repeat(24),
    amount: 18000,
    currency: 'INR',
  };

  it('is flagged as a simulation and never asks for card details', async () => {
    const service = new MockPaymentService({ delayMs: 0 });

    expect(service.isSimulation).toBe(true);
    expect(service.provider).toBe('MOCK');

    const created = await service.createPayment(input);
    // Assert on credential-shaped keys, not on the substring "number" (which
    // would also match the legitimate `orderNumber`).
    expect(JSON.stringify(created)).not.toMatch(
      /"(card|cardNumber|card_number|cvv|expiry|upi|upiId|otp|password|secret)"\s*:/i,
    );
    expect(Object.keys(created.clientPayload ?? {})).toEqual(['simulation', 'orderNumber']);
  });

  it('issues a fresh provider id per attempt', async () => {
    const service = new MockPaymentService({ delayMs: 0 });
    const first = await service.createPayment(input);
    const second = await service.createPayment(input);

    expect(first.paymentId).toMatch(/^mock_pay_[0-9a-f]{16}$/);
    expect(second.paymentId).not.toBe(first.paymentId);
  });

  it('rejects a malformed or unknown payment id', async () => {
    const service = new MockPaymentService({ delayMs: 0 });

    const malformed = await service.verifyPayment({
      orderId: input.orderId,
      paymentId: 'not-a-payment',
      expectedAmount: input.amount,
      currency: input.currency,
    });
    expect(malformed.verified).toBe(false);
    expect(malformed.reason).toBe('MALFORMED_PAYMENT_ID');

    const unknown = await service.verifyPayment({
      orderId: input.orderId,
      paymentId: `mock_pay_${'0'.repeat(16)}`,
      expectedAmount: input.amount,
      currency: input.currency,
    });
    expect(unknown.verified).toBe(false);
    expect(unknown.reason).toBe('UNKNOWN_PAYMENT_ID');
  });

  it('refuses to verify one order\'s payment against another order', async () => {
    const service = new MockPaymentService({ delayMs: 0 });
    const created = await service.createPayment(input);

    const result = await service.verifyPayment({
      orderId: 'c'.repeat(24),
      paymentId: created.paymentId,
      expectedAmount: created.amount,
      currency: created.currency,
    });

    expect(result.verified).toBe(false);
    expect(result.reason).toBe('PAYMENT_ORDER_MISMATCH');
  });

  it('refuses a mismatched amount', async () => {
    const service = new MockPaymentService({ delayMs: 0 });
    const created = await service.createPayment(input);

    const result = await service.verifyPayment({
      orderId: input.orderId,
      paymentId: created.paymentId,
      expectedAmount: 1,
      currency: created.currency,
    });

    expect(result.verified).toBe(false);
    expect(result.reason).toBe('AMOUNT_MISMATCH');
  });

  it('honours an injected delay instead of reading the environment', async () => {
    const slow = new MockPaymentService({ delayMs: 60 });
    const started = Date.now();
    await slow.createPayment(input);
    expect(Date.now() - started).toBeGreaterThanOrEqual(50);
  });
});

describe('PaymentService registry', () => {
  it('resolves the mock provider from config and caches it', () => {
    const first = getPaymentService();
    expect(first.isSimulation).toBe(true);
    expect(getPaymentService()).toBe(first);
  });

  it('can be replaced wholesale, so a real gateway is a drop-in', () => {
    const stub: PaymentService = {
      provider: 'RAZORPAY',
      isSimulation: false,
      createPayment: () =>
        Promise.resolve({
          provider: 'RAZORPAY' as const,
          paymentId: 'order_abc',
          amount: 0,
          currency: 'INR',
          status: 'PENDING' as const,
        }),
      verifyPayment: (): Promise<VerifyPaymentResult> =>
        Promise.resolve({ verified: true, status: 'COMPLETED' }),
    };

    setPaymentService(stub);
    expect(getPaymentService()).toBe(stub);
    expect(getPaymentService().isSimulation).toBe(false);
  });
});

describe('POST /api/orders/:id/payments', () => {
  it('opens a pending payment for an unpaid order', async () => {
    const seed = await seedOrderableTheater();
    const order = await placeOrder(seed);

    const payment = await openPayment(order.orderId);

    expect(payment.paymentId).toMatch(/^mock_pay_[0-9a-f]{16}$/);
    expect(payment.amount).toBe(18000);

    const row = await Payment.findOne({ orderId: order.orderId }).lean();
    expect(row?.status).toBe('PENDING');
    expect(row?.provider).toBe('MOCK');
  });

  it('is idempotent - a second call returns the same payment', async () => {
    const seed = await seedOrderableTheater();
    const order = await placeOrder(seed);

    const first = await openPayment(order.orderId);
    const second = await openPayment(order.orderId);

    expect(second.paymentId).toBe(first.paymentId);
    expect(await Payment.countDocuments({})).toBe(1);
  });

  it('opens exactly one payment when three requests race', async () => {
    const seed = await seedOrderableTheater();
    const order = await placeOrder(seed);

    const responses = await Promise.all(
      Array.from({ length: 3 }, () => openPayment(order.orderId)),
    );

    const ids = new Set(responses.map((r) => r.paymentId));
    expect(ids.size).toBe(1);
    expect(await Payment.countDocuments({})).toBe(1);
  });

  it('404s an unknown order', async () => {
    const response = await api().post(`/api/orders/${'a'.repeat(24)}/payments`);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ORDER_NOT_FOUND');
  });

  it('refuses to open a second payment for an already-paid order', async () => {
    const seed = await seedOrderableTheater();
    const order = await placeOrder(seed);
    const payment = await openPayment(order.orderId);
    await api()
      .post(`/api/orders/${order.orderId}/payments/verify`)
      .send({ paymentId: payment.paymentId })
      .expect(200);

    const second = await api().post(`/api/orders/${order.orderId}/payments`);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('ORDER_ALREADY_PAID');
  });
});

describe('POST /api/orders/:id/payments/verify', () => {
  it('moves the order to PAID and returns the PIN exactly once', async () => {
    const seed = await seedOrderableTheater();
    const order = await placeOrder(seed);
    const payment = await openPayment(order.orderId);

    const verified = await api()
      .post(`/api/orders/${order.orderId}/payments/verify`)
      .send({ paymentId: payment.paymentId })
      .expect(200);

    expect(verified.body.data.order.status).toBe('PAID');
    expect(verified.body.data.order.paymentStatus).toBe('COMPLETED');
    expect(verified.body.data.alreadyCompleted).toBe(false);
    expect(verified.body.data.verificationPin).toMatch(/^\d{4}$/);

    // A repeat call returns the order but no new PIN.
    const repeat = await api()
      .post(`/api/orders/${order.orderId}/payments/verify`)
      .send({ paymentId: payment.paymentId })
      .expect(200);

    expect(repeat.body.data.alreadyCompleted).toBe(true);
    expect(repeat.body.data.verificationPin).toBeUndefined();
  });

  it('keeps the PIN stable across repeats', async () => {
    const seed = await seedOrderableTheater();
    const order = await placeOrder(seed);
    const payment = await openPayment(order.orderId);

    const verified = await api()
      .post(`/api/orders/${order.orderId}/payments/verify`)
      .send({ paymentId: payment.paymentId })
      .expect(200);
    const pin = verified.body.data.verificationPin as string;

    // Hammer it. The stored hash must keep verifying against the same PIN.
    await Promise.all(
      Array.from({ length: 5 }, () =>
        api()
          .post(`/api/orders/${order.orderId}/payments/verify`)
          .send({ paymentId: payment.paymentId }),
      ),
    );

    const stored = await Order.findById(order.orderId).select('+verificationPinHash').lean();
    const { verifyVerificationPin } = await import('../src/services/pin.service');
    expect(verifyVerificationPin(pin, stored?.verificationPinHash ?? undefined)).toBe(true);
  });

  it('completes the order exactly once under concurrent verification', async () => {
    const seed = await seedOrderableTheater();
    const order = await placeOrder(seed);
    const payment = await openPayment(order.orderId);

    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        api()
          .post(`/api/orders/${order.orderId}/payments/verify`)
          .send({ paymentId: payment.paymentId }),
      ),
    );

    expect(responses.every((r) => r.status === 200)).toBe(true);

    // Exactly one response may carry a PIN; the rest must be told it already happened.
    const withPin = responses.filter((r) => r.body.data.verificationPin !== undefined);
    expect(withPin).toHaveLength(1);

    const stored = await Order.findById(order.orderId).select('+verificationPinHash').lean();
    expect(stored?.status).toBe('PAID');
    expect(stored?.verificationPinHash).toBeTruthy();
  });

  it('refuses a payment that belongs to a different order', async () => {
    const seed = await seedOrderableTheater();
    const orderA = await placeOrder(seed);
    const orderB = await placeOrder(seed);
    const payment = await openPayment(orderA.orderId);

    const response = await api()
      .post(`/api/orders/${orderB.orderId}/payments/verify`)
      .send({ paymentId: payment.paymentId });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('PAYMENT_WRONG_ORDER');
    expect((await Order.findById(orderB.orderId).lean())?.status).toBe('PENDING_PAYMENT');
  });

  it('404s an unknown payment id', async () => {
    const seed = await seedOrderableTheater();
    const order = await placeOrder(seed);

    const response = await api()
      .post(`/api/orders/${order.orderId}/payments/verify`)
      .send({ paymentId: `mock_pay_${'0'.repeat(16)}` });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('PAYMENT_NOT_FOUND');
  });

  it('rejects a malformed payment id at the edge', async () => {
    const seed = await seedOrderableTheater();
    const order = await placeOrder(seed);

    for (const paymentId of ['', 'has spaces', '../../etc/passwd', 'a'.repeat(200)]) {
      const response = await api()
        .post(`/api/orders/${order.orderId}/payments/verify`)
        .send({ paymentId });
      expect(response.status).toBe(400);
    }
  });

  it('never accepts card or credential data in the body', async () => {
    const seed = await seedOrderableTheater();
    const order = await placeOrder(seed);
    const payment = await openPayment(order.orderId);

    const response = await api()
      .post(`/api/orders/${order.orderId}/payments/verify`)
      .send({ paymentId: payment.paymentId, cardNumber: '4111111111111111', cvv: '123' });

    // `.strict()` rejects the whole body rather than quietly ignoring the extras.
    expect(response.status).toBe(400);
    expect((await Order.findById(order.orderId).lean())?.status).toBe('PENDING_PAYMENT');
  });

  it('marks the payment FAILED and leaves the order unpaid when the provider declines', async () => {
    const seed = await seedOrderableTheater();
    const order = await placeOrder(seed);
    const payment = await openPayment(order.orderId);

    const declining: PaymentService = {
      provider: 'MOCK',
      isSimulation: true,
      createPayment: () =>
        Promise.resolve({
          provider: 'MOCK' as const,
          paymentId: payment.paymentId,
          amount: 18000,
          currency: 'INR',
          status: 'PENDING' as const,
        }),
      verifyPayment: (): Promise<VerifyPaymentResult> =>
        Promise.resolve({ verified: false, status: 'FAILED', reason: 'BANK_DECLINED' }),
    };
    setPaymentService(declining);

    const response = await api()
      .post(`/api/orders/${order.orderId}/payments/verify`)
      .send({ paymentId: payment.paymentId });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_PAYMENT');

    const row = await Payment.findOne({ providerPaymentId: payment.paymentId }).lean();
    expect(row?.status).toBe('FAILED');
    expect((await Order.findById(order.orderId).lean())?.status).toBe('PENDING_PAYMENT');
  });

  it('does not leak the PIN through the failure path', async () => {
    const seed = await seedOrderableTheater();
    const order = await placeOrder(seed);
    await openPayment(order.orderId);

    const response = await api()
      .post(`/api/orders/${order.orderId}/payments/verify`)
      .send({ paymentId: `mock_pay_${'1'.repeat(16)}` });

    expect(JSON.stringify(response.body)).not.toContain('verificationPin');
    expect((await Order.findById(order.orderId).select('+verificationPinHash').lean())
      ?.verificationPinHash).toBeUndefined();
  });

  it('generates a PIN that actually verifies against the stored hash', async () => {
    const generated = createVerificationPin();
    const { verifyVerificationPin } = await import('../src/services/pin.service');

    expect(generated.plaintext).toMatch(/^\d{4}$/);
    expect(generated.hash).not.toBe(generated.plaintext);
    expect(verifyVerificationPin(generated.plaintext, generated.hash)).toBe(true);
  });
});

describe('Payment data integrity', () => {
  it('never stores a card number anywhere in the payment row', async () => {
    const seed = await seedOrderableTheater();
    const order = await placeOrder(seed);
    const payment = await openPayment(order.orderId);
    await api()
      .post(`/api/orders/${order.orderId}/payments/verify`)
      .send({ paymentId: payment.paymentId })
      .expect(200);

    const row = await Payment.findOne({ orderId: order.orderId }).lean();
    expect(JSON.stringify(row)).not.toMatch(/card|cvv|4111/);
  });

  it('keeps the provider payment id unique', async () => {
    const service = new MockPaymentService({ delayMs: 0 });
    const input: CreatePaymentInput = {
      orderId: 'a'.repeat(24),
      orderNumber: 'FM-1',
      theaterId: 'b'.repeat(24),
      amount: 100,
      currency: 'INR',
    };
    const created = await service.createPayment(input);

    await Payment.create({
      orderId: 'd'.repeat(24),
      theaterId: 'b'.repeat(24),
      provider: 'MOCK',
      providerPaymentId: created.paymentId,
      amount: 100,
      currency: 'INR',
      status: 'PENDING',
    });

    await expect(
      Payment.create({
        orderId: 'e'.repeat(24),
        theaterId: 'b'.repeat(24),
        provider: 'MOCK',
        providerPaymentId: created.paymentId,
        amount: 100,
        currency: 'INR',
        status: 'PENDING',
      }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('passes the amount the order actually computed', async () => {
    const seed = await seedOrderableTheater({ price: 18000 });
    const order = await placeOrder(seed, 3);

    const payment = await openPayment(order.orderId);
    expect(payment.amount).toBe(54000);

    const row = await Payment.findOne({ orderId: order.orderId }).lean();
    expect(row?.amount).toBe(54000);
    expect(row?.amount).toBe((await Order.findById(order.orderId).lean())?.totalAmount);
  });
});
