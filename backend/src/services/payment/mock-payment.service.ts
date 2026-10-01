import { randomBytes } from 'node:crypto';
import { env } from '../../config/env';
import { ApiError, ErrorCode } from '../../utils/apiError';
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentService,
  VerifyPaymentInput,
  VerifyPaymentResult,
} from './payment.interface';

const MOCK_ID_PREFIX = 'mock_pay_';

export interface MockPaymentServiceOptions {
  /**
   * Artificial latency so the demo can render a "Processing..." state.
   * Injected rather than read from env at call time so tests can assert the
   * behaviour without a half-second sleep.
   */
  delayMs?: number;
}

function newPaymentId(): string {
  return `${MOCK_ID_PREFIX}${randomBytes(8).toString('hex')}`;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * MVP payment provider. It moves no money.
 *
 * It exists so the whole business flow - order, payment, PIN, kitchen - can be
 * demonstrated end to end before a gateway is integrated. The only rule it
 * enforces is that a payment can only be verified for an identifier it actually
 * issued, which keeps the mock honest enough that the surrounding idempotency
 * and amount checks are genuinely exercised.
 *
 * It deliberately does NOT accept a card number, CVV, UPI id or any other
 * financial instrument: collecting credentials we cannot process safely would
 * be far worse than collecting none.
 */
export class MockPaymentService implements PaymentService {
  readonly provider = 'MOCK' as const;
  readonly isSimulation = true;

  private readonly delayMs: number;

  /** Every id this instance has issued. Stands in for the gateway's own record. */
  private readonly issued = new Map<string, { orderId: string; amount: number }>();

  constructor(options: MockPaymentServiceOptions = {}) {
    this.delayMs = options.delayMs ?? env.MOCK_PAYMENT_DELAY_MS;
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    await sleep(this.delayMs);

    if (!Number.isInteger(input.amount) || input.amount < 0) {
      throw ApiError.badRequest('Payment amount must be a non-negative integer', ErrorCode.INVALID_PAYMENT);
    }

    const paymentId = newPaymentId();
    this.issued.set(paymentId, { orderId: input.orderId, amount: input.amount });

    return {
      provider: this.provider,
      paymentId,
      amount: input.amount,
      currency: input.currency,
      status: 'PENDING',
      clientPayload: { simulation: true, orderNumber: input.orderNumber },
    };
  }

  async verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    await sleep(this.delayMs);

    // Structural check first so a malformed id never reaches the map, then the
    // lookup itself: only an id this instance actually issued can succeed.
    if (!/^mock_pay_[0-9a-f]{16}$/.test(input.paymentId)) {
      return { verified: false, status: 'FAILED', reason: 'MALFORMED_PAYMENT_ID' };
    }

    const record = this.issued.get(input.paymentId);
    if (!record) {
      return { verified: false, status: 'FAILED', reason: 'UNKNOWN_PAYMENT_ID' };
    }

    if (record.orderId !== input.orderId) {
      return { verified: false, status: 'FAILED', reason: 'PAYMENT_ORDER_MISMATCH' };
    }

    if (record.amount !== input.expectedAmount) {
      return { verified: false, status: 'FAILED', reason: 'AMOUNT_MISMATCH' };
    }

    // The simulated "charge" always succeeds. A real gateway would be making a
    // network call here and could return a bank decline instead.
    return {
      verified: true,
      status: 'COMPLETED',
      providerReference: `mock_ref_${randomBytes(6).toString('hex')}`,
      metadata: { simulated: true, delayMs: this.delayMs },
    };
  }
}
