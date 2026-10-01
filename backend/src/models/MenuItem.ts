import mongoose, {
  Schema,
  type HydratedDocument,
  type InferSchemaType,
  type Model,
} from 'mongoose';

const MAX_ITEM_PRICE_PAISE = 100_000_00; // ₹1,00,000
const MENU_CATEGORIES = [
  'POPCORN',
  'DRINKS',
  'SNACKS',
  'SANDWICHES',
  'COMBOS',
  'DESSERTS',
  'OTHER',
] as const;

const menuItemSchema = new Schema(
  {
    theaterId: {
      type: Schema.Types.ObjectId,
      ref: 'Theater',
      required: [true, 'Theater is required'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Item name is required'],
      trim: true,
      maxlength: [120, 'Item name must be at most 120 characters'],
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      trim: true,
      uppercase: true,
      maxlength: [60, 'Category must be at most 60 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description must be at most 500 characters'],
    },
    /**
     * Integer paise. Never a float: ₹250 is stored as 25000.
     * (25000 paise / 100 = ₹250.)
     */
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0, 'Price cannot be negative'],
      max: [MAX_ITEM_PRICE_PAISE, 'Price exceeds the maximum allowed value'],
      validate: {
        validator: Number.isInteger,
        message: 'Price must be an integer number of paise (no decimals, no floats)',
      },
    },
    imageUrl: {
      type: String,
      trim: true,
      maxlength: [2048, 'imageUrl must be at most 2048 characters'],
    },
    isAvailable: {
      type: Boolean,
      default: true,
    },
    displayOrder: {
      type: Number,
      default: 0,
      min: [0, 'displayOrder cannot be negative'],
      max: [100_000, 'displayOrder is unreasonably large'],
      validate: { validator: Number.isInteger, message: 'displayOrder must be an integer' },
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Customer menu: filter to a theater, optionally only available items, sorted.
menuItemSchema.index({ theaterId: 1, isAvailable: 1, displayOrder: 1 });
// Browsing by aisle.
menuItemSchema.index({ theaterId: 1, category: 1, displayOrder: 1 });
// Availability toggle dashboards.
menuItemSchema.index({ theaterId: 1, isAvailable: 1 });
// Stop-duplicate-item check.
menuItemSchema.index({ theaterId: 1, name: 1 });

export type MenuItemAttrs = InferSchemaType<typeof menuItemSchema>;
export type MenuItemDoc = HydratedDocument<MenuItemAttrs>;

export const MenuItem: Model<MenuItemAttrs> =
  (mongoose.models.MenuItem as Model<MenuItemAttrs> | undefined) ??
  mongoose.model<MenuItemAttrs>('MenuItem', menuItemSchema);

export { MENU_CATEGORIES, MAX_ITEM_PRICE_PAISE };
