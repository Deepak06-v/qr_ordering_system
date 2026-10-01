import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

/**
 * Monotonic counters backing human-facing identifiers (currently only
 * `orderNumber`, e.g. `FM-1042`).
 *
 * A dedicated collection is used rather than `countDocuments()` because a
 * count is not monotonic under concurrent inserts and is wrong the moment an
 * order is deleted. `$inc` on a single document is atomic, so two concurrent
 * order creations can never be handed the same number.
 *
 * Gaps are expected and harmless: a rolled-back transaction still consumes its
 * number. Customer-facing order numbers must not be gapless - a gap would leak
 * order volume.
 */
const counterSchema = new Schema(
  {
    /** e.g. `orderNumber` */
    key: {
      type: String,
      required: [true, 'Counter key is required'],
      unique: true,
      trim: true,
    },
    value: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true, versionKey: false },
);

export type CounterAttrs = InferSchemaType<typeof counterSchema>;

export const Counter: Model<CounterAttrs> =
  (mongoose.models.Counter as Model<CounterAttrs> | undefined) ??
  mongoose.model<CounterAttrs>('Counter', counterSchema);

export const ORDER_NUMBER_COUNTER = 'orderNumber';
