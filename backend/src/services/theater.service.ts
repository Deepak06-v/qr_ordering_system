import type { ClientSession, FilterQuery, Types, UpdateQuery } from 'mongoose';
import { DEFAULT_TIMEZONE, Theater, type TheaterAttrs } from '../models/Theater';
import { ApiError, ErrorCode } from '../utils/apiError';
import type { EntityId } from '../utils/mongo';
import { isDuplicateKeyError } from '../utils/mongo';

type LeanTheater = {
  _id: Types.ObjectId;
  name: string;
  address?: string;
  city?: string;
  timezone: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export interface TheaterDTO {
  id: string;
  name: string;
  address?: string;
  city?: string;
  timezone: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTheaterInput {
  name: string;
  address?: string;
  city?: string;
  timezone?: string;
  isActive: boolean;
}
export interface UpdateTheaterInput {
  name?: string;
  address?: string;
  city?: string;
  timezone?: string;
  isActive?: boolean;
}

export interface ListTheatersParams {
  page: number;
  limit: number;
  isActive?: boolean;
  city?: string;
  search?: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function exactNameMatcher(name: string): RegExp {
  return new RegExp(`^${escapeRegExp(name.trim())}$`, 'i');
}

export function toTheaterDTO(doc: LeanTheater): TheaterDTO {
  return {
    id: doc._id.toString(),
    name: doc.name,
    ...(doc.address !== undefined ? { address: doc.address } : {}),
    ...(doc.city !== undefined ? { city: doc.city } : {}),
    timezone: doc.timezone ?? DEFAULT_TIMEZONE,
    isActive: doc.isActive,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export async function listTheaters(params: ListTheatersParams): Promise<{
  items: TheaterDTO[];
  total: number;
}> {
  const filter: FilterQuery<TheaterAttrs> = {};

  if (params.isActive !== undefined) filter.isActive = params.isActive;
  if (params.city) filter.city = new RegExp(`^${escapeRegExp(params.city)}$`, 'i');
  if (params.search) {
    const pattern = new RegExp(escapeRegExp(params.search), 'i');
    filter.$or = [{ name: pattern }, { city: pattern }, { address: pattern }];
  }

  const [docs, total] = await Promise.all([
    Theater.find(filter)
      .sort({ name: 1 })
      .skip((params.page - 1) * params.limit)
      .limit(params.limit)
      .lean()
      .exec(),
    Theater.countDocuments(filter).exec(),
  ]);

  return { items: docs.map((doc) => toTheaterDTO(doc as LeanTheater)), total };
}

export async function createTheater(
  input: CreateTheaterInput,
  session?: ClientSession,
): Promise<TheaterDTO> {
  const existing = await Theater.findOne(
    { name: exactNameMatcher(input.name) },
    { _id: 1 },
    session ? { session } : {},
  )
    .lean()
    .exec();

  if (existing) {
    throw ApiError.conflict(
      `A theater named "${input.name}" already exists`,
      ErrorCode.THEATER_DUPLICATE,
    );
  }

  const [doc] = await Theater.create(
    [
      {
        name: input.name,
        address: input.address,
        city: input.city,
        timezone: input.timezone ?? DEFAULT_TIMEZONE,
        isActive: input.isActive,
      },
    ],
    session ? { session } : {},
  ).catch((error: unknown) => {
    // The unique index is the real guard: two concurrent creates can both pass
    // the pre-check above, and only the index can break the tie.
    if (isDuplicateKeyError(error)) {
      throw ApiError.conflict(
        `A theater named "${input.name}" already exists`,
        ErrorCode.THEATER_DUPLICATE,
      );
    }
    throw error;
  });

  if (!doc) {
    throw ApiError.internal('Failed to create theater');
  }

  const lean = doc.toObject() as unknown as LeanTheater;
  return toTheaterDTO(lean);
}

/** Looks a theater up by id. Throws THEATER_NOT_FOUND (404) when missing. */
export async function getTheaterById(id: EntityId, session?: ClientSession): Promise<TheaterDTO> {
  const query = Theater.findById(id, undefined, session ? { session } : {})
    .lean()
    .exec();
  const doc = await query;

  if (!doc) {
    throw ApiError.notFound('Theater not found', ErrorCode.THEATER_NOT_FOUND);
  }

  return toTheaterDTO(doc as LeanTheater);
}

/** Same as getTheaterById but also refuses an inactive theater (410 Gone). */
export async function getActiveTheaterById(
  id: EntityId,
  session?: ClientSession,
): Promise<TheaterDTO> {
  const theater = await getTheaterById(id, session);
  if (!theater.isActive) {
    throw ApiError.gone('Theater is not accepting orders', ErrorCode.THEATER_INACTIVE);
  }
  return theater;
}

export async function updateTheater(id: EntityId, patch: UpdateTheaterInput): Promise<TheaterDTO> {
  if (patch.name !== undefined) {
    const clash = await Theater.findOne(
      { name: exactNameMatcher(patch.name), _id: { $ne: id } },
      { _id: 1 },
    )
      .lean()
      .exec();

    if (clash) {
      throw ApiError.conflict(
        `A theater named "${patch.name}" already exists`,
        ErrorCode.THEATER_DUPLICATE,
      );
    }
  }

  const update: UpdateQuery<TheaterAttrs> = { ...patch };

  const doc = await Theater.findByIdAndUpdate(id, update, {
    new: true,
    runValidators: true,
  })
    .lean()
    .exec()
    .catch((error: unknown) => {
      if (isDuplicateKeyError(error)) {
        throw ApiError.conflict(
          `A theater named "${patch.name}" already exists`,
          ErrorCode.THEATER_DUPLICATE,
        );
      }
      throw error;
    });

  if (!doc) {
    throw ApiError.notFound('Theater not found', ErrorCode.THEATER_NOT_FOUND);
  }

  return toTheaterDTO(doc as LeanTheater);
}
