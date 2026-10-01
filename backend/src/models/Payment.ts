import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { PAYMENT_STATUSES, type PaymentStatus } from './order-status';

/**
 * Payment providers. `MOCK` simulates a charge and moves no money.
 * `RAZORPAY` is reserved: adding it here is the first step of the real
 * integration, and `payment.service.ts` maps it to a `RazorpayPaymentService`
 * that satisfies the same `PaymentService` interface.
 */
export const PAYMENT_PROVIDERS = ['MOCK', 'RAZORPAY'] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

/** Same vocabulary as `Order.paymentStatus` - one status, no second source of truth. */
export const PAYMENT_TRANSACTION_STATUSES = PAYMENT_STATUSES;
export type PaymentTransactionStatus = PaymentStatus;

const paymentSchema = new Schema(
  {
    orderId: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      required: [true, 'Order is required'],
      index: true,
    },
    theaterId: {
      type: Schema.Types.ObjectId,
      ref: 'Theater',
      required: [true, 'Theater is required'],
    },
    provider: {
      type: String,
      enum: PAYMENT_PROVIDERS,
      required: [true, 'Provider is required'],
    },
    /**
     * The provider's own identifier for this attempt (e.g. `mock_pay_ab12…`).
     * Unique across the whole collection, which is what makes a retried
     * `POST /api/payments/create` detectable rather than silently duplicated.
     */
    providerPaymentId: {
      type: String,
      required: [true, 'Provider payment id is required'],
      trim: true,
      maxlength: 128,
      unique: true,
    },
    /** Integer paise. Copied from the order so an amount drift is detectable. */
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'Amount must be an integer number of paise',
      },
    },
    currency: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 3,
      default: 'INR',
    },
    status: {
      type: String,
      enum: PAYMENT_TRANSACTION_STATUSES,
      default: 'PENDING',
      index: true,
    },
    completedAt: { type: Date },
    /** Provider-specific payload (gateway order id, signature, etc). Never a secret. */
    metadata: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

/**
 * At most one in-flight payment per order. Two taps on "PAY" must not produce
 * two live charges; the partial unique index is the atomic guard that a
 * pre-flight check alone cannot provide.
 */
paymentSchema.index(
  { orderId: 1 },
  {
    unique: true,
    name: 'uniq_pending_payment_per_order',
    partialFilterExpression: { status: 'PENDING' },
  },
);

// KDS / support lookup: everything that ever happened for one order.
paymentSchema.index({ orderId: 1, createdAt: -1 });

export type PaymentAttrs = InferSchemaType<typeof paymentSchema>;

export const Payment: Model<PaymentAttrs> =
  (mongoose.models.Payment as Model<PaymentAttrs> | undefined) ??
  mongoose.model<PaymentAttrs>('Payment', paymentSchema);
