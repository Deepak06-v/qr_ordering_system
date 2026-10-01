import type { ClientSession, FilterQuery, Types, UpdateQuery } from 'mongoose';
import { MenuItem, type MenuItemAttrs } from '../models/MenuItem';
import { ApiError, ErrorCode } from '../utils/apiError';
import type { EntityId } from '../utils/mongo';
import { getTheaterById } from './theater.service';
import { logger } from '../utils/logger';

type LeanMenuItem = {
  _id: Types.ObjectId;
  theaterId: Types.ObjectId;
  name: string;
  category: string;
  description?: string;
  price: number;
  imageUrl?: string;
  isAvailable: boolean;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

export interface MenuItemDTO {
  id: string;
  theaterId: string;
  name: string;
  category: string;
  description?: string;
  /** Integer paise. ₹250 === 25000. */
  price: number;
  priceRupees: number;
  imageUrl?: string;
  isAvailable: boolean;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMenuItemInput {
  theaterId: EntityId;
  name: string;
  category: string;
  description?: string;
  price: number;
  imageUrl?: string;
  isAvailable: boolean;
  displayOrder: number;
}

export interface UpdateMenuItemInput {
  name?: string;
  category?: string;
  description?: string;
  price?: number;
  imageUrl?: string;
  isAvailable?: boolean;
  displayOrder?: number;
}

export function toMenuItemDTO(doc: LeanMenuItem): MenuItemDTO {
  return {
    id: doc._id.toString(),
    theaterId: doc.theaterId.toString(),
    name: doc.name,
    category: doc.category,
    ...(doc.description !== undefined ? { description: doc.description } : {}),
    price: doc.price,
    priceRupees: doc.price / 100,
    ...(doc.imageUrl !== undefined ? { imageUrl: doc.imageUrl } : {}),
    isAvailable: doc.isAvailable,
    displayOrder: doc.displayOrder,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export interface ListMenuParams {
  theaterId: EntityId;
  category?: string;
  isAvailable?: boolean;
  includeUnavailable?: boolean;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function exactNameMatcher(name: string): RegExp {
  return new RegExp(`^${escapeRegExp(name.trim())}$`, 'i');
}

/**
 * Menu for a theater. Unavailable items are hidden from customers unless the
 * caller explicitly asks for them (an admin toggle view).
 */
export async function listMenuItems(params: ListMenuParams): Promise<MenuItemDTO[]> {
  const filter: FilterQuery<MenuItemAttrs> = { theaterId: params.theaterId };

  if (params.category) filter.category = params.category;
  if (params.isAvailable !== undefined) {
    filter.isAvailable = params.isAvailable;
  } else if (params.includeUnavailable !== true) {
    // Customer default: sold-out items never reach the menu endpoint.
    filter.isAvailable = true;
  }

  const docs = await MenuItem.find(filter)
    .sort({ category: 1, displayOrder: 1, name: 1 })
    .lean()
    .exec();

  return docs.map((doc) => toMenuItemDTO(doc as LeanMenuItem));
}

export async function createMenuItem(
  input: CreateMenuItemInput,
  session?: ClientSession,
): Promise<MenuItemDTO> {
  await getTheaterById(input.theaterId, session);

  const existing = await MenuItem.findOne(
    { theaterId: input.theaterId, name: exactNameMatcher(input.name) },
    { _id: 1 },
    session ? { session } : {},
  )
    .lean()
    .exec();

  if (existing) {
    throw ApiError.conflict(
      `An item named "${input.name}" already exists for this theater`,
      ErrorCode.DUPLICATE_MENU_ITEM,
    );
  }

  const [doc] = await MenuItem.create(
    [
      {
        theaterId: input.theaterId,
        name: input.name,
        category: input.category,
        description: input.description,
        price: input.price,
        imageUrl: input.imageUrl,
        isAvailable: input.isAvailable,
        displayOrder: input.displayOrder,
      },
    ],
    session ? { session } : {},
  );

  if (!doc) throw ApiError.internal('Failed to create menu item');

  logger.info('Menu item created', { menuItemId: doc._id.toString(), theaterId: input.theaterId });

  return toMenuItemDTO(doc.toObject() as unknown as LeanMenuItem);
}

export async function getMenuItemById(
  id: EntityId,
  options: { session?: ClientSession; theaterId?: EntityId } = {},
): Promise<MenuItemDTO> {
  const filter: FilterQuery<MenuItemAttrs> = { _id: id };
  if (options.theaterId) filter.theaterId = options.theaterId;

  const doc = await MenuItem.findOne(
    filter,
    undefined,
    options.session ? { session: options.session } : {},
  )
    .lean()
    .exec();

  if (!doc) {
    throw ApiError.notFound('Menu item not found', ErrorCode.MENU_ITEM_NOT_FOUND);
  }

  return toMenuItemDTO(doc as LeanMenuItem);
}

export async function updateMenuItem(
  id: EntityId,
  patch: UpdateMenuItemInput,
): Promise<MenuItemDTO> {
  const update: UpdateQuery<MenuItemAttrs> = { ...patch };

  const doc = await MenuItem.findByIdAndUpdate(id, update, { new: true, runValidators: true })
    .lean()
    .exec();

  if (!doc) {
    throw ApiError.notFound('Menu item not found', ErrorCode.MENU_ITEM_NOT_FOUND);
  }

  logger.info('Menu item updated', { menuItemId: id });

  return toMenuItemDTO(doc as LeanMenuItem);
}

export async function deleteMenuItem(id: EntityId): Promise<{ id: string; deleted: true }> {
  const doc = await MenuItem.findByIdAndDelete(id).lean().exec();

  if (!doc) {
    throw ApiError.notFound('Menu item not found', ErrorCode.MENU_ITEM_NOT_FOUND);
  }

  logger.info('Menu item deleted', { menuItemId: id });

  return { id: id.toString(), deleted: true };
}
