import type { ClientSession, FilterQuery, Types } from 'mongoose';
import archiver from 'archiver';
import { PassThrough } from 'node:stream';
import { SeatHash, rethrowSeatHashWriteError, type SeatHashAttrs } from '../models/SeatHash';
import { ApiError, ErrorCode } from '../utils/apiError';
import { isDuplicateKeyError, isDuplicateSeatError, type EntityId } from '../utils/mongo';
import { generateSecureQrHash, generateSecureQrHashes } from '../utils/generateHash';
import { withTransaction } from '../utils/withTransaction';
import { getActiveTheaterById } from './theater.service';
import { buildQrUrl, csvEscape, generateQrPng, qrFileNameForSeat } from './qr.service';
import { logger } from '../utils/logger';
import { env } from '../config/env';

const HASH_GENERATION_ATTEMPTS = 5;

export interface SeatHashDTO {
  hash: string;
  url: string;
  theaterId: string;
  screenNumber: number;
  seatNumber: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ResolvedSeatDTO {
  hash: string;
  theaterId: string;
  screenNumber: number;
  seatNumber: string;
  theater: {
    id: string;
    name: string;
    city?: string;
    timezone: string;
    isActive: boolean;
  };
}

type LeanSeatHash = {
  _id: Types.ObjectId;
  hash: string;
  theaterId: Types.ObjectId;
  screenNumber: number;
  seatNumber: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export function toSeatHashDTO(doc: LeanSeatHash): SeatHashDTO {
  return {
    hash: doc.hash,
    url: buildQrUrl(doc.hash),
    theaterId: doc.theaterId.toString(),
    screenNumber: doc.screenNumber,
    seatNumber: doc.seatNumber,
    isActive: doc.isActive,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/** Public projection for the customer-facing resolve endpoint. No internals. */
export function toResolvedSeatDTO(
  doc: LeanSeatHash,
  theater: {
    _id: Types.ObjectId;
    name: string;
    city?: string;
    timezone: string;
    isActive: boolean;
  },
): ResolvedSeatDTO {
  return {
    hash: doc.hash,
    theaterId: doc.theaterId.toString(),
    screenNumber: doc.screenNumber,
    seatNumber: doc.seatNumber,
    theater: {
      id: theater._id.toString(),
      name: theater.name,
      ...(theater.city !== undefined ? { city: theater.city } : {}),
      timezone: theater.timezone,
      isActive: theater.isActive,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                                   Create                                    */
/* -------------------------------------------------------------------------- */

export interface CreateSeatHashInput {
  theaterId: EntityId;
  screenNumber: number;
  seatNumber: string;
}

export async function createSeatHash(input: CreateSeatHashInput): Promise<SeatHashDTO> {
  await getActiveTheaterById(input.theaterId);

  let lastError: unknown;

  for (let attempt = 0; attempt < HASH_GENERATION_ATTEMPTS; attempt += 1) {
    // Fresh CSPRNG entropy on every attempt; a hash collision is astronomically
    // unlikely, and the unique index is the final backstop if one ever happens.
    const hash = generateSecureQrHash(env.QR_HASH_BYTES);

    try {
      const [doc] = await SeatHash.create([
        {
          hash,
          theaterId: input.theaterId,
          screenNumber: input.screenNumber,
          seatNumber: input.seatNumber,
          isActive: true,
        },
      ]);

      if (!doc) throw ApiError.internal('Failed to create QR mapping');

      logger.info('QR generated', {
        hash,
        theaterId: input.theaterId,
        screenNumber: input.screenNumber,
        seatNumber: input.seatNumber,
      });

      return toSeatHashDTO(doc.toObject());
    } catch (error) {
      const seatConflict =
        isDuplicateKeyError(error) && isDuplicateSeatError(error) && input.seatNumber !== undefined;

      if (seatConflict) {
        throw ApiError.conflict(
          `Screen ${input.screenNumber} seat ${input.seatNumber} already has an active QR code`,
          ErrorCode.DUPLICATE_QR,
        );
      }

      if (isDuplicateKeyError(error)) {
        // Hash collision: retry with new entropy.
        lastError = error;
        logger.warn('QR hash collision, regenerating', { attempt: attempt + 1 });
        continue;
      }

      rethrowSeatHashWriteError(error);
    }
  }

  throw ApiError.internal(
    `Could not generate a unique QR hash after ${HASH_GENERATION_ATTEMPTS} attempts: ${String(lastError)}`,
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Bulk                                     */
/* -------------------------------------------------------------------------- */

export interface BulkCreateSeatHashInput {
  theaterId: EntityId;
  screenNumber: number;
  seats: string[];
}

export interface BulkCreatedSeatDTO {
  seatNumber: string;
  hash: string;
  url: string;
  isActive: true;
}

/**
 * Creates one QR mapping per seat, all-or-nothing.
 *
 * Atomicity strategy:
 *  - replica set / sharded cluster -> a real multi-document transaction
 *  - standalone mongod             -> pre-flight duplicate check, then
 *                                      insertMany(ordered) with a compensating
 *                                      delete on any failure
 * Either way a failed batch leaves zero partial records behind.
 */
export async function bulkCreateSeatHashes(
  input: BulkCreateSeatHashInput,
): Promise<BulkCreatedSeatDTO[]> {
  const { theaterId, screenNumber, seats } = input;

  if (seats.length > env.BULK_SEAT_MAX) {
    throw ApiError.badRequest(
      `A maximum of ${env.BULK_SEAT_MAX} seats can be created at once`,
      ErrorCode.INVALID_SEAT,
    );
  }

  await getActiveTheaterById(theaterId);

  // Pre-flight: fail before writing anything if the batch collides with
  // existing active mappings. This is what makes the fallback path safe.
  const existing = await SeatHash.find(
    { theaterId, screenNumber, seatNumber: { $in: seats }, isActive: true },
    { seatNumber: 1, _id: 0 },
  )
    .lean()
    .exec();

  if (existing.length > 0) {
    const conflicts = existing.map((doc) => (doc as unknown as { seatNumber: string }).seatNumber);
    throw ApiError.conflict(
      `These seats already have an active QR code: ${conflicts.join(', ')}`,
      ErrorCode.DUPLICATE_QR,
    );
  }

  const insertedHashes: string[] = [];

  const { result, usedTransaction } = await withTransaction(
    async (session) => {
      const hashes = generateSecureQrHashes(seats.length, env.QR_HASH_BYTES);
      const docs = seats.map((seatNumber, index) => ({
        hash: hashes[index] as string,
        theaterId,
        screenNumber,
        seatNumber,
        isActive: true,
      }));

      const created = await SeatHash.insertMany(docs, {
        ordered: true,
        ...(session ? { session } : {}),
      });

      insertedHashes.push(...created.map((doc) => doc.hash));

      return created.map((doc) => {
        const lean = doc.toObject() as unknown as LeanSeatHash;
        return {
          seatNumber: lean.seatNumber,
          hash: lean.hash,
          url: buildQrUrl(lean.hash),
          isActive: true as const,
        };
      });
    },
    {
      label: 'bulkCreateSeatHashes',
      compensate: async (session) => {
        if (insertedHashes.length === 0) return;
        await SeatHash.deleteMany(
          { hash: { $in: insertedHashes } },
          session ? { session } : {},
        ).exec();
        logger.warn('Rolled back partial bulk QR batch', { count: insertedHashes.length });
      },
    },
  );

  logger.info('Bulk QR generated', {
    theaterId,
    screenNumber,
    count: result.length,
    usedTransaction,
  });

  return result;
}

/* -------------------------------------------------------------------------- */
/*                                  Resolve                                   */
/* -------------------------------------------------------------------------- */

/**
 * Resolves a scanned QR hash to its seat.
 *
 * This is the ONLY way a seat is ever established for an order. There is no
 * parameter through which a client can nominate a seat.
 */
export async function resolveSeatHash(hash: string): Promise<ResolvedSeatDTO> {
  // Single indexed lookup on `hash` (unique) - the intermission hot path.
  const doc = (await SeatHash.findOne(
    { hash },
    { hash: 1, theaterId: 1, screenNumber: 1, seatNumber: 1, isActive: 1 },
  )
    .lean()
    .exec()) as LeanSeatHash | null;

  if (!doc) {
    throw ApiError.notFound('QR code not found', ErrorCode.QR_NOT_FOUND);
  }

  if (!doc.isActive) {
    // 410 Gone: the code is known but deliberately retired.
    throw ApiError.gone(
      'This QR code is no longer active. Please contact the theater staff.',
      ErrorCode.QR_INACTIVE,
    );
  }

  const theater = await getActiveTheaterById(doc.theaterId);

  const leanTheater = {
    _id: theater.id as unknown as Types.ObjectId,
    name: theater.name,
    city: theater.city,
    timezone: theater.timezone,
    isActive: theater.isActive,
  };

  return toResolvedSeatDTO(doc, leanTheater);
}

/** Fetch a mapping regardless of active state (admin/export flows). */
export async function getSeatHashByHash(
  hash: string,
  session?: ClientSession,
): Promise<SeatHashDTO> {
  const doc = (await SeatHash.findOne({ hash }, undefined, session ? { session } : {})
    .lean()
    .exec()) as LeanSeatHash | null;

  if (!doc) {
    throw ApiError.notFound('QR code not found', ErrorCode.QR_NOT_FOUND);
  }

  return toSeatHashDTO(doc);
}

/** Asserts a hash exists and is usable for ordering, without leaking the mapping. */
export async function assertSeatHashUsable(hash: string, session?: ClientSession): Promise<void> {
  const doc = await SeatHash.findOne(
    { hash, isActive: true },
    { _id: 1 },
    session ? { session } : {},
  )
    .lean()
    .exec();

  if (!doc) {
    throw ApiError.notFound('QR code not found or not active', ErrorCode.QR_NOT_FOUND);
  }
}

/* -------------------------------------------------------------------------- */
/*                             Remap / deactivate                             */
/* -------------------------------------------------------------------------- */

export interface RemapSeatHashInput {
  screenNumber?: number;
  seatNumber?: string;
  theaterId?: EntityId;
}

/**
 * Remaps a physical sticker to a different seat.
 * The hash never changes: the sticker on the armrest is immutable, only the
 * database row moves.
 */
export async function remapSeatHash(hash: string, patch: RemapSeatHashInput): Promise<SeatHashDTO> {
  const current = (await SeatHash.findOne({ hash }).lean().exec()) as LeanSeatHash | null;
  if (!current) {
    throw ApiError.notFound('QR code not found', ErrorCode.QR_NOT_FOUND);
  }

  const nextTheaterId = patch.theaterId ?? current.theaterId.toString();
  const nextScreenNumber = patch.screenNumber ?? current.screenNumber;
  const nextSeatNumber = patch.seatNumber ?? current.seatNumber;

  if (patch.theaterId) {
    await getActiveTheaterById(patch.theaterId);
  }

  try {
    const updated = await SeatHash.findOneAndUpdate(
      { hash },
      {
        $set: {
          theaterId: nextTheaterId,
          screenNumber: nextScreenNumber,
          seatNumber: nextSeatNumber,
        },
      },
      { new: true, runValidators: true },
    )
      .lean()
      .exec();

    if (!updated) {
      throw ApiError.notFound('QR code not found', ErrorCode.QR_NOT_FOUND);
    }

    const dto = toSeatHashDTO(updated);
    logger.info('QR remapped', {
      hash,
      from: { screenNumber: current.screenNumber, seatNumber: current.seatNumber },
      to: { screenNumber: dto.screenNumber, seatNumber: dto.seatNumber },
    });
    return dto;
  } catch (error) {
    if (isDuplicateKeyError(error) && isDuplicateSeatError(error)) {
      throw ApiError.conflict(
        `Screen ${nextScreenNumber} seat ${nextSeatNumber} already has an active QR code`,
        ErrorCode.DUPLICATE_QR,
      );
    }
    rethrowSeatHashWriteError(error);
  }
}

export async function setSeatHashStatus(
  hash: string,
  isActive: boolean,
  reason?: string,
): Promise<SeatHashDTO> {
  const updated = await SeatHash.findOneAndUpdate({ hash }, { $set: { isActive } }, { new: true })
    .lean()
    .exec();

  if (!updated) {
    throw ApiError.notFound('QR code not found', ErrorCode.QR_NOT_FOUND);
  }

  logger.info(isActive ? 'QR activated' : 'QR deactivated', { hash, reason });

  return toSeatHashDTO(updated);
}

/* -------------------------------------------------------------------------- */
/*                                  Listing                                   */
/* -------------------------------------------------------------------------- */

export interface ListSeatHashesParams {
  theaterId: EntityId;
  screenNumber?: number;
  isActive?: boolean;
  page: number;
  limit: number;
}

export async function listSeatHashes(params: ListSeatHashesParams): Promise<{
  items: SeatHashDTO[];
  total: number;
}> {
  const filter: FilterQuery<SeatHashAttrs> = { theaterId: params.theaterId };
  if (params.screenNumber !== undefined) filter.screenNumber = params.screenNumber;
  if (params.isActive !== undefined) filter.isActive = params.isActive;

  const [docs, total] = await Promise.all([
    SeatHash.find(filter)
      .sort({ screenNumber: 1, seatNumber: 1 })
      .skip((params.page - 1) * params.limit)
      .limit(params.limit)
      .lean()
      .exec(),
    SeatHash.countDocuments(filter).exec(),
  ]);

  return { items: docs.map((doc) => toSeatHashDTO(doc)), total };
}

/* -------------------------------------------------------------------------- */
/*                                ZIP export                                  */
/* -------------------------------------------------------------------------- */

export interface ExportSeatHashInput {
  theaterId: EntityId;
  screenNumber: number;
  includeInactive: boolean;
}

export interface ZipExport {
  stream: PassThrough;
  filename: string;
  count: number;
}

/**
 * Streams `screen-N-qrs.zip` containing one `<SEAT>.png` per mapping plus a
 * manifest.csv (seatNumber,hash,url). Nothing sensitive is ever placed in the QR
 * itself, and the stream is piped rather than buffered so memory stays flat even
 * for a 500-seat screen.
 */
export async function exportSeatHashesZip(input: ExportSeatHashInput): Promise<ZipExport> {
  await getActiveTheaterById(input.theaterId);

  const filter: FilterQuery<SeatHashAttrs> = {
    theaterId: input.theaterId,
    screenNumber: input.screenNumber,
  };
  if (!input.includeInactive) filter.isActive = true;

  const docs = (await SeatHash.find(filter)
    .sort({ seatNumber: 1 })
    .select({ hash: 1, seatNumber: 1, _id: 0 })
    .lean()
    .exec()) as Array<{ hash: string; seatNumber: string }>;

  if (docs.length === 0) {
    throw ApiError.notFound(
      `No QR codes found for screen ${input.screenNumber}`,
      ErrorCode.QR_NOT_FOUND,
    );
  }

  const stream = new PassThrough();
  const archive = archiver('zip', { zlib: { level: 9 } });

  archive.on('warning', (error: unknown) => {
    if ((error as { code?: string }).code === 'ENOENT') {
      logger.warn('Archiver warning', { message: String(error) });
      return;
    }
    archive.emit('error', error);
  });

  archive.pipe(stream);

  const manifestRows: string[] = ['seatNumber,hash,url'];

  // PNG rendering is CPU-bound; keep it sequential to avoid a burst of
  // event-loop-blocking work on a single Node thread.
  for (const doc of docs) {
    const png = await generateQrPng(doc.hash);
    archive.append(png, { name: qrFileNameForSeat(doc.seatNumber, 'png') });
    manifestRows.push(
      [csvEscape(doc.seatNumber), csvEscape(doc.hash), csvEscape(buildQrUrl(doc.hash))].join(','),
    );
  }

  archive.append(`${manifestRows.join('\n')}\n`, { name: 'manifest.csv' });
  await archive.finalize();

  logger.info('QR ZIP exported', {
    theaterId: input.theaterId,
    screenNumber: input.screenNumber,
    count: docs.length,
  });

  return { stream, filename: `screen-${input.screenNumber}-qrs.zip`, count: docs.length };
}
