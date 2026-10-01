import mongoose, {
  Schema,
  type HydratedDocument,
  type InferSchemaType,
  type Model,
} from 'mongoose';
import { generateSecureQrHash } from '../utils/generateHash';
import { env } from '../config/env';
import { ErrorCode, ApiError } from '../utils/apiError';
import { isDuplicateKeyError, isDuplicateSeatError } from '../utils/mongo';

const MAX_SEAT_NUMBER_LENGTH = 24;

const seatHashSchema = new Schema(
  {
    /**
     * Opaque, cryptographically random, URL-safe identifier baked into the QR.
     * It is the ONLY thing in the QR payload: no seat, screen or theater data.
     */
    hash: {
      type: String,
      required: [true, 'Hash is required'],
      unique: true,
      index: true,
      trim: true,
      minlength: [16, 'Hash is too short'],
      maxlength: [128, 'Hash is too long'],
      match: [
        /^[A-Za-z0-9_-]+$/,
        'Hash must be URL-safe base64 (letters, digits, hyphen and underscore only)',
      ],
      default: () => generateSecureQrHash(env.QR_HASH_BYTES),
    },
    theaterId: {
      type: Schema.Types.ObjectId,
      ref: 'Theater',
      required: [true, 'Theater is required'],
      index: true,
    },
    screenNumber: {
      type: Number,
      required: [true, 'Screen number is required'],
      min: [1, 'Screen number must be a positive integer'],
      max: [999, 'Screen number is unreasonably large'],
      validate: {
        validator: Number.isInteger,
        message: 'Screen number must be an integer',
      },
    },
    seatNumber: {
      type: String,
      required: [true, 'Seat number is required'],
      trim: true,
      uppercase: true,
      minlength: [1, 'Seat number cannot be empty'],
      maxlength: [
        MAX_SEAT_NUMBER_LENGTH,
        `Seat number must be at most ${MAX_SEAT_NUMBER_LENGTH} characters`,
      ],
      match: [/^[A-Z0-9][A-Z0-9\-/]*$/i, 'Seat number contains unsupported characters'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: String,
      trim: true,
      maxlength: 120,
      select: false,
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
 * A seat may hold at most one ACTIVE QR at a time, so the composite index is
 * unique but partial. This keeps the invariant "one live code per seat" without
 * blocking the reuse of a seat after its sticker was deactivated.
 */
seatHashSchema.index(
  { theaterId: 1, screenNumber: 1, seatNumber: 1 },
  {
    unique: true,
    partialFilterExpression: { isActive: true },
    name: 'theater_screen_seat_active_unique',
  },
);

// Seat inventories, ZIP export, "list all codes for a screen".
seatHashSchema.index({ theaterId: 1, screenNumber: 1, isActive: 1 });
seatHashSchema.index({ theaterId: 1, isActive: 1, updatedAt: -1 });

export type SeatHashAttrs = InferSchemaType<typeof seatHashSchema>;
export type SeatHashDoc = HydratedDocument<SeatHashAttrs>;

/** Translates MongoDB unique-index violations into the public API contract. */
export function rethrowSeatHashWriteError(error: unknown): never {
  if (isDuplicateKeyError(error)) {
    if (isDuplicateSeatError(error)) {
      throw ApiError.conflict(
        'A QR code is already mapped to this theater, screen and seat',
        ErrorCode.DUPLICATE_QR,
      );
    }
    throw ApiError.conflict('A QR code with this hash already exists', ErrorCode.DUPLICATE_QR);
  }
  throw error;
}

export const SeatHash: Model<SeatHashAttrs> =
  (mongoose.models.SeatHash as Model<SeatHashAttrs> | undefined) ??
  mongoose.model<SeatHashAttrs>('SeatHash', seatHashSchema);
