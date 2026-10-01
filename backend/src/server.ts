import http from 'node:http';
import { createApp } from './app';
import { env } from './config/env';
import { connectToDatabase, disconnectFromDatabase } from './config/db';
import { initRealtime, type Realtime } from './socket';
import { logger } from './utils/logger';

export interface StartedServer {
  httpServer: http.Server;
  realtime: Realtime;
  close(): Promise<void>;
}

export async function startServer(): Promise<StartedServer> {
  await connectToDatabase();

  const app = createApp();
  const httpServer = http.createServer(app);
  const realtime = initRealtime(httpServer);

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(env.PORT, () => {
      httpServer.removeListener('error', reject);
      resolve();
    });
  });

  logger.info('Server started', {
    port: env.PORT,
    env: env.NODE_ENV,
    appBaseUrl: env.APP_BASE_URL,
    qrHashBytes: env.QR_HASH_BYTES,
  });

  const close = async (): Promise<void> => {
    logger.info('Server shutting down');
    await realtime.close();
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
    await disconnectFromDatabase();
    logger.info('Server stopped');
  };

  return { httpServer, realtime, close };
}

if (require.main === module) {
  startServer()
    .then((started) => {
      const shutdown = (signal: string): void => {
        void started
          .close()
          .then(() => process.exit(0))
          .catch((error: unknown) => {
            logger.error('Graceful shutdown failed', { message: String(error) });
            process.exit(1);
          });
        logger.info('Shutdown signal received', { signal });
      };

      process.on('SIGINT', () => shutdown('SIGINT'));
      process.on('SIGTERM', () => shutdown('SIGTERM'));
    })
    .catch((error: unknown) => {
      logger.error('Failed to start server', { message: String(error) });
      process.exit(1);
    });
}
