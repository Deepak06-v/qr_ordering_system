import path from 'node:path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

const rootDir = path.resolve(__dirname, '..');

// 1. Load the developer's .env first (it is ignored for values we force below).
dotenv.config({ path: path.join(rootDir, '.env') });

// 2. Force the test environment. dotenv never overwrites keys that already exist,
//    so these win no matter what a local .env contains. This must happen before
//    any `src/**` module is imported, because config/env.ts reads at import time.
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = process.env.TEST_LOG_LEVEL ?? 'silent';
process.env.MONGODB_URI =
  process.env.MONGODB_URI_TEST ?? 'mongodb://127.0.0.1:27017/theater-ordering-test';
process.env.APP_BASE_URL = process.env.TEST_APP_BASE_URL ?? 'http://localhost:5173';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:5173';
// The mock provider's artificial latency is a demo affordance, not behaviour
// under test. Timings are asserted against an explicitly injected delay.
process.env.MOCK_PAYMENT_DELAY_MS = '0';

const TEST_URI = process.env.MONGODB_URI;

beforeAll(async () => {
  try {
    await mongoose.connect(TEST_URI, { serverSelectionTimeoutMS: 10_000 });
  } catch (error) {
    throw new Error(
      `Cannot reach the test MongoDB at ${TEST_URI}.\n` +
        'Start MongoDB, or set MONGODB_URI_TEST in .env, then re-run `npm test`.\n' +
        `Underlying error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Build every declared index: the unique seat index is part of what we assert on.
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
});

afterEach(async () => {
  const collections = Object.values(mongoose.connection.collections);
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
  const collections = Object.values(mongoose.connection.collections);
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
  await mongoose.connection.dropDatabase().catch(() => undefined);
  await mongoose.disconnect();
});
