import mongoose, {
  Schema,
  type HydratedDocument,
  type InferSchemaType,
  type Model,
} from 'mongoose';

const MAX_STRING_LENGTH = 200;

const isValidTimeZone = (value: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

const theaterSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Theater name is required'],
      trim: true,
      maxlength: [
        MAX_STRING_LENGTH,
        `Theater name must be at most ${MAX_STRING_LENGTH} characters`,
      ],
    },
    address: {
      type: String,
      trim: true,
      maxlength: [500, 'Address must be at most 500 characters'],
    },
    city: {
      type: String,
      trim: true,
      maxlength: [120, 'City must be at most 120 characters'],
    },
    timezone: {
      type: String,
      required: true,
      default: DEFAULT_TIMEZONE,
      validate: {
        validator: isValidTimeZone,
        message: (props: { value: string }) => `"${props.value}" is not a valid IANA timezone`,
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// A theater is identified by its name, so the name has to be unique
// (case-insensitively: "PVR Icon" and "pvr icon" are the same cinema).
// The application layer checks this first for a clean 409; this index is the
// backstop that makes the invariant true even under concurrent requests.
theaterSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

// Directory listing and "active theaters only" lookups.
theaterSchema.index({ isActive: 1, name: 1 });
theaterSchema.index({ city: 1, isActive: 1 });

export type TheaterAttrs = InferSchemaType<typeof theaterSchema>;
export type TheaterDoc = HydratedDocument<TheaterAttrs>;

export const Theater: Model<TheaterAttrs> =
  (mongoose.models.Theater as Model<TheaterAttrs> | undefined) ??
  mongoose.model<TheaterAttrs>('Theater', theaterSchema);
