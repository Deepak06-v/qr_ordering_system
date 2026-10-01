import type { PaymentProvider, PaymentTransactionStatus } from '../../models/Payment';

/**
 * The contract every payment provider must satisfy.
 *
 * The order service depends on *this* interface only. Swapping the MVP mock for
 * a real gateway is a matter of writing a class that implements these four
 * methods and registering it in `payment.service.ts` - no order, controller or
 * route code changes.
 */
export interface PaymentService {
  /** Stable identifier of the backing implementation, e.g. `mock`. */
  readonly provider: PaymentProvider;

  /** True when this implementation simulates a charge rather than making one. */
  readonly isSimulation: boolean;

  /**
   * Opens a payment attempt for an order and returns whatever the client needs
   * to complete it.
   *
   * For a real gateway this is where an order is created upstream and a
   * checkout session / signature is minted. For the mock it just allocates an
   * identifier.
   */
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;

  /**
   * Confirms that money actually arrived. This is the ONLY method allowed to
   * move an order to PAID, so it must be unforgiving: return `verified: false`
   * rather than throwing on a recoverable failure, and never return `true` for
   * a payment it did not independently confirm.
   */
  verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult>;
}

export interface CreatePaymentInput {
  /** Our order id. Passed to the gateway as the merchant reference. */
  orderId: string;
  orderNumber: string;
  theaterId: string;
  /** Integer paise, copied from the order. The provider must not alter it. */
  amount: number;
  currency: string;
}

export interface CreatePaymentResult {
  provider: PaymentProvider;
  /** What the client sends back to `/api/payments/verify`. */
  paymentId: string;
  amount: number;
  currency: string;
  status: PaymentTransactionStatus;
  /**
   * Opaque provider payload the client must echo or redirect with. For the mock
   * this is unused; a real gateway would return a checkout URL or a signature.
   */
  clientPayload?: Record<string, unknown>;
}

export interface VerifyPaymentInput {
  orderId: string;
  /** The identifier previously returned by `createPayment`. */
  paymentId: string;
  /** Integer paise the client believes it is paying. Used as a tamper check. */
  expectedAmount: number;
  currency: string;
  /** Whatever the gateway handed the client, if anything. */
  clientPayload?: Record<string, unknown>;
}

export interface VerifyPaymentResult {
  verified: boolean;
  status: PaymentTransactionStatus;
  /** Gateway receipt/reference, stored on the Payment row for reconciliation. */
  providerReference?: string;
  /** Machine-readable reason when `verified` is false. */
  reason?: string;
  /** Provider-specific detail for support. Never a secret, never logged raw. */
  metadata?: Record<string, unknown>;
}
