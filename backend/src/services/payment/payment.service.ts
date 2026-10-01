import { env } from '../../config/env';
import { ApiError, ErrorCode } from '../../utils/apiError';
import type { PaymentService } from './payment.interface';
import { MockPaymentService, type MockPaymentServiceOptions } from './mock-payment.service';

/**
 * Provider registry.
 *
 * This is the single place that decides which implementation backs
 * `PAYMENT_PROVIDER`. Adding a real gateway means writing a class that satisfies
 * `PaymentService` and adding one line here - the order service, controllers and
 * routes are written against the interface and never change.
 *
 * `PAYMENT_PROVIDER` is validated to `mock` in config/env.ts, so an unimplemented
 * provider cannot be selected at boot and cannot silently degrade to the mock.
 * The `switch` is still exhaustive so adding `razorpay` is a compile-time
 * prompt rather than a silent fallthrough.
 */
function buildPaymentService(options: MockPaymentServiceOptions = {}): PaymentService {
  switch (env.PAYMENT_PROVIDER) {
    case 'mock':
      return new MockPaymentService(options);
    default: {
      // Unreachable while the env enum is `['mock']`. Kept so that widening the
      // enum without adding an implementation fails loudly instead of quietly
      // simulating a payment for real orders.
      const provider: string = env.PAYMENT_PROVIDER;
      throw new ApiError(
        503,
        ErrorCode.PAYMENT_PROVIDER_UNAVAILABLE,
        `Payment provider "${provider}" is not implemented. Add it to the PAYMENT_PROVIDER ` +
          'enum and register a class implementing PaymentService.',
      );
    }
  }
}

let instance: PaymentService | null = null;

/** The process-wide payment provider. Constructed once, reused everywhere. */
export function getPaymentService(): PaymentService {
  if (!instance) {
    instance = buildPaymentService();
  }
  return instance;
}

/** Test seam: inject a provider (or `null` to force a rebuild from env). */
export function setPaymentService(service: PaymentService | null): void {
  instance = service;
}

export { MockPaymentService };
export type { CreatePaymentInput, CreatePaymentResult, PaymentService, VerifyPaymentInput, VerifyPaymentResult } from './payment.interface';
