/**
 * Development seed. Safe to run repeatedly: every write is an upsert keyed on a
 * natural business key, so re-running never creates uncontrolled duplicates and
 * never re-rolls an existing QR hash (which would invalidate a printed sticker).
 *
 *   npm run seed
 */
import path from 'node:path';
import fs from 'node:fs';
import { Types } from 'mongoose';
import { connectToDatabase, disconnectFromDatabase, getDatabaseName } from '../src/config/db';
import { env } from '../src/config/env';
import { logger } from '../src/utils/logger';
import { Theater } from '../src/models/Theater';
import { MenuItem } from '../src/models/MenuItem';
import { SeatHash } from '../src/models/SeatHash';
import { generateSecureQrHash } from '../src/utils/generateHash';
import { buildQrUrl, generateQrPng } from '../src/services/qr.service';

const THEATER_NAME = 'Demo Cinema';
const SCREENS = [1, 2, 3, 4];
const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const SEATS_PER_ROW = 10;

const QR_OUTPUT_DIR = path.resolve(process.cwd(), 'generated', 'qr');

/** Prices are integer paise. ₹250 === 25000. */
const MENU = [
  { name: 'Classic Popcorn', category: 'POPCORN', price: 18000, displayOrder: 1, imageUrl: '/images/products/regular-popcorn.jpg' },
  { name: 'Large Popcorn', category: 'POPCORN', price: 25000, displayOrder: 2, imageUrl: '/images/products/large-popcorn.jpg' },
  { name: 'Cheese Popcorn', category: 'POPCORN', price: 28000, displayOrder: 3, imageUrl: '/images/products/caramel-popcorn.jpg' },
  { name: 'Coke', category: 'DRINKS', price: 8000, displayOrder: 4, imageUrl: '/images/products/coke.jpg' },
  { name: 'Pepsi', category: 'DRINKS', price: 8000, displayOrder: 5, imageUrl: '/images/products/pepsi.jpg' },
  { name: 'Water', category: 'DRINKS', price: 2000, displayOrder: 6, imageUrl: '/images/products/water.jpg' },
  { name: 'Nachos', category: 'SNACKS', price: 20000, displayOrder: 7, imageUrl: '/images/products/nachos.jpg' },
  { name: 'Cheese Nachos', category: 'SNACKS', price: 26000, displayOrder: 8, imageUrl: '/images/products/nachos.jpg' },
  { name: 'Veg Sandwich', category: 'SANDWICHES', price: 15000, displayOrder: 9, imageUrl: '/images/products/veg-sandwich.jpg' },
  { name: 'Chicken Sandwich', category: 'SANDWICHES', price: 19000, displayOrder: 10, imageUrl: '/images/products/chicken-sandwich.jpg' },
  { name: 'Movie Combo', category: 'COMBOS', price: 35000, displayOrder: 11, imageUrl: '/images/products/movie-night-combo.jpg' },
  { name: 'Family Combo', category: 'COMBOS', price: 89000, displayOrder: 12, imageUrl: '/images/products/family-bundle.jpg' },
] as const;

function buildSeatLabels(): string[] {
  const seats: string[] = [];
  for (const row of ROWS) {
    for (let index = 1; index <= SEATS_PER_ROW; index += 1) {
      seats.push(`${row}${index}`);
    }
  }
  return seats;
}

async function seedTheater(): Promise<{ id: string }> {
  const theater = await Theater.findOneAndUpdate(
    { name: THEATER_NAME },
    {
      $set: {
        address: '12 Marathahalli Road',
        city: 'Bengaluru',
        timezone: 'Asia/Kolkata',
        isActive: true,
      },
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  ).lean();

  if (!theater) throw new Error('Failed to seed theater');
  logger.info('Theater ready', { id: theater._id.toString(), name: theater.name });
  return { id: theater._id.toString() };
}

async function seedMenu(theaterId: string): Promise<number> {
  const theaterObjectId = new Types.ObjectId(theaterId);

  const result = await MenuItem.bulkWrite(
    MENU.map((item) => ({
      updateOne: {
        filter: { theaterId: theaterObjectId, name: item.name },
        update: {
          $set: {
            theaterId: theaterObjectId,
            name: item.name,
            category: item.category,
            price: item.price,
            displayOrder: item.displayOrder,
            isAvailable: true,
            imageUrl: item.imageUrl,
          },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  );

  logger.info('Menu ready', {
    upserted: result.upsertedCount,
    matched: result.matchedCount,
    total: MENU.length,
  });
  return result.upsertedCount + result.matchedCount;
}

async function seedSeatHashes(theaterId: string): Promise<{ created: number; existing: number }> {
  const seats = buildSeatLabels();
  const docs: Array<{
    hash: string;
    theaterId: string;
    screenNumber: number;
    seatNumber: string;
    isActive: boolean;
  }> = [];

  for (const screenNumber of SCREENS) {
    for (const seatNumber of seats) {
      docs.push({
        hash: generateSecureQrHash(env.QR_HASH_BYTES),
        theaterId,
        screenNumber,
        seatNumber,
        isActive: true,
      });
    }
  }

  // Skip seats that already hold an active code, so re-running preserves printed stickers.
  const existing = await SeatHash.find(
    { theaterId, isActive: true },
    { screenNumber: 1, seatNumber: 1, _id: 0 },
  )
    .lean()
    .exec();

  const taken = new Set(
    existing.map(
      (doc) =>
        `${(doc as unknown as { screenNumber: number }).screenNumber}:${(doc as unknown as { seatNumber: string }).seatNumber}`,
    ),
  );

  const toInsert = docs.filter((doc) => !taken.has(`${doc.screenNumber}:${doc.seatNumber}`));

  if (toInsert.length > 0) {
    await SeatHash.insertMany(toInsert, { ordered: true });
  }

  logger.info('Seat QR codes ready', {
    created: toInsert.length,
    existing: docs.length - toInsert.length,
    screens: SCREENS.length,
    seatsPerScreen: seats.length,
  });

  return { created: toInsert.length, existing: docs.length - toInsert.length };
}

/** Writes a sample PNG for Screen 4 / Seat G3 so `generated/qr/` is not empty. */
async function writeSampleQrImage(theaterId: string): Promise<string | null> {
  const doc = await SeatHash.findOne({ theaterId, screenNumber: 4, seatNumber: 'G3' })
    .lean()
    .exec();

  if (!doc) return null;

  const png = await generateQrPng(doc.hash);
  fs.mkdirSync(QR_OUTPUT_DIR, { recursive: true });
  const file = path.join(QR_OUTPUT_DIR, 'screen-4-G3.png');
  fs.writeFileSync(file, png);

  logger.info('Sample QR image written', { file, url: buildQrUrl(doc.hash) });
  return file;
}

async function main(): Promise<void> {
  logger.info('Seeding database', { database: getDatabaseName() ?? 'connecting' });
  await connectToDatabase();

  const { id: theaterId } = await seedTheater();
  const menuCount = await seedMenu(theaterId);
  const { created, existing } = await seedSeatHashes(theaterId);
  const sample = await writeSampleQrImage(theaterId);

  logger.info('Seed complete', {
    theater: THEATER_NAME,
    theaterId,
    menuItems: menuCount,
    seatHashesCreated: created,
    seatHashesReused: existing,
    sampleQrImage: sample,
  });
}

main()
  .then(async () => {
    await disconnectFromDatabase();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    logger.error('Seed failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    await disconnectFromDatabase().catch(() => undefined);
    process.exit(1);
  });
