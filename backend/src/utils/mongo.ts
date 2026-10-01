import type { Types } from 'mongoose';

/** Anything Mongoose accepts where a document id is expected. */
export type EntityId = string | Types.ObjectId;

interface MongoServerErrorLike {
  name?: string;
  code?: number;
  keyPattern?: Record<string, unknown>;
  keyValue?: Record<string, unknown>;
  errmsg?: string;
}

export function isMongoServerError(error: unknown): error is MongoServerErrorLike {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as MongoServerErrorLike).name === 'MongoServerError'
  );
}

export function isDuplicateKeyError(
  error: unknown,
): error is MongoServerErrorLike & { code: 11000 } {
  return isMongoServerError(error) && error.code === 11000;
}

/** Which index/fields collided, e.g. `{ theaterId: 1, screenNumber: 1, seatNumber: 1 }`. */
export function duplicateKeyFields(error: unknown): string[] {
  if (!isDuplicateKeyError(error)) return [];
  return Object.keys(error.keyPattern ?? {});
}

export const DUPLICATE_SEAT_INDEX_FIELDS = ['theaterId', 'screenNumber', 'seatNumber'] as const;

export function isDuplicateSeatError(error: unknown): boolean {
  const fields = duplicateKeyFields(error);
  return fields.length === DUPLICATE_SEAT_INDEX_FIELDS.length;
}
