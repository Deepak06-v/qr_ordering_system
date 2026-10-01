import mongoose from 'mongoose';
import { env, isProduction } from './env';
import { logger } from '../utils/logger';

let connectionPromise: Promise<typeof mongoose> | null = null;

mongoose.set('strictQuery', true);
// Fail fast instead of buffering commands when MongoDB is unreachable.
mongoose.set('bufferCommands', false);

/**
 * Opens (or reuses) the single Mongoose connection for the process.
 * Safe to call from the server bootstrap, the seed script and the test suite.
 */
export async function connectToDatabase(uri: string = env.mongodbUri): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === mongoose.ConnectionStates.connected) {
    return mongoose;
  }

  if (!connectionPromise) {
    connectionPromise = mongoose
      .connect(uri, {
        maxPoolSize: env.MONGODB_MAX_POOL_SIZE,
        minPoolSize: isProduction ? 2 : 0,
        serverSelectionTimeoutMS: env.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
        socketTimeoutMS: env.MONGODB_SOCKET_TIMEOUT_MS,
        autoIndex: !isProduction,
      })
      .then((m) => {
        m.connection.on('connected', () => logger.info('MongoDB connected'));
        m.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
        m.connection.on('error', (error: unknown) => {
          logger.error('MongoDB connection error', toErrorPayload(error));
        });
        m.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
        return m;
      })
      .catch((error: unknown) => {
        connectionPromise = null;
        throw error;
      });
  }

  return connectionPromise;
}

export async function disconnectFromDatabase(): Promise<void> {
  connectionPromise = null;
  if (mongoose.connection.readyState !== mongoose.ConnectionStates.disconnected) {
    await mongoose.disconnect();
  }
}

export function getDatabaseName(): string {
  return mongoose.connection.name;
}

export function isConnected(): boolean {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}

function toErrorPayload(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { message: error.message, name: error.name };
  }
  return { message: String(error) };
}
