import mongoose, {
  Schema,
  type HydratedDocument,
  type InferSchemaType,
  type Model,
} from 'mongoose';
import { ORDER_STATUSES, PAYMENT_STATUSES } from './order-status';

export {
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  ACTIVE_ORDER_STATUSES,
  TERMINAL_ORDER_STATUSES,
  ALLOWED_STATUS_TRANSITIONS,
  canTransition,
  type OrderStatus,
  type PaymentStatus,
} from './order-status';

/**
 * PIN hashing lives in `services/pin.service.ts` - a model should not carry
 * crypto. Re-exported here only so existing importers keep working.
 *
 * @deprecated Import from `src/services/pin.service` instead.
 */
export { hashVerificationPin, verifyVerificationPin } from '../services/pin.service';

const orderItemSchema = new Schema(
  {
    itemId: {
      type: Schema.Types.ObjectId,
      ref: 'MenuItem',
      required: [true, 'Item id is required'],
    },
    /**
     * Name and price are snapshotted at order time so historical orders stay
     * correct after the menu changes. `price` is authoritative: it is the price
     * the server read from MongoDB, never a client-supplied number.
     */
    name: {
      type: String,
      required: [true, 'Item name is required'],
      trim: true,
      maxlength: 120,
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, 'Quantity must be at least 1'],
      max: [20, 'Quantity per item is capped at 20'],
      validate: { validator: Number.isInteger, message: 'Quantity must be an integer' },
    },
    price: {
      type: Number,
      required: true,
      min: [0, 'Price cannot be negative'],
      validate: {
        validator: Number.isInteger,
        message: 'Price must be an integer number of paise',
      },
    },
  },
  { _id: false, versionKey: false },
);

const orderSchema = new Schema(
  {
    /**
     * Human-facing identifier shown to staff on the KDS and quoted by
     * customers, e.g. `FM-1042`. Raw ObjectIds are never the primary
     * customer-facing identifier.
     */
    orderNumber: {
      type: String,
      required: [true, 'Order number is required'],
      trim: true,
      uppercase: true,
      unique: true,
    },
    /**
     * The scanned QR hash this order belongs to. The seat is always derived
     * from this hash - never from anything the client sends.
     */
    hash: {
      type: String,
      required: [true, 'QR hash is required'],
      index: true,
      trim: true,
    },
    theaterId: {
      type: Schema.Types.ObjectId,
      ref: 'Theater',
      required: [true, 'Theater is required'],
      index: true,
    },
    seatDetails: {
      screenNumber: {
        type: Number,
        required: true,
        min: 1,
      },
      seatNumber: {
        type: String,
        required: true,
        trim: true,
        uppercase: true,
      },
    },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: (items: unknown[]) => Array.isArray(items) && items.length > 0,
        message: 'An order must contain at least one item',
      },
    },
    /** Integer paise. Sum of (price * quantity), computed server-side. */
    totalAmount: {
      type: Number,
      required: [true, 'Total amount is required'],
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'Total amount must be an integer number of paise',
      },
    },
    /** Hash only. The plaintext PIN exists once, in the payment-confirmation response. */
    verificationPinHash: {
      type: String,
      select: false,
    },
    status: {
      type: String,
      enum: ORDER_STATUSES,
      // Never PAID by default: an order only becomes PAID once a payment has
      // been verified by the payment service.
      default: 'PENDING_PAYMENT',
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: 'PENDING',
      index: true,
    },
    /** Set exactly when payment verification flips the order to PAID. */
    paidAt: { type: Date },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// "Orders for this screen right now" - the KDS hot path.
orderSchema.index({ theaterId: 1, status: 1, createdAt: -1 });
// Customer order history for a scanned seat.
orderSchema.index({ hash: 1, createdAt: -1 });
orderSchema.index({ 'seatDetails.screenNumber': 1, status: 1 });
// KDS feed: newest first within a theater, optionally filtered by status.
orderSchema.index({ theaterId: 1, createdAt: -1 });

export type OrderAttrs = InferSchemaType<typeof orderSchema>;
export type OrderDoc = HydratedDocument<OrderAttrs>;

export const Order: Model<OrderAttrs> =
  (mongoose.models.Order as Model<OrderAttrs> | undefined) ??
  mongoose.model<OrderAttrs>('Order', orderSchema);
