import express, { type Application } from 'express';
import cors, { type CorsOptions } from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { apiRouter } from './routes';
import { healthRouter } from './routes/health.routes';
import { errorHandler, notFoundHandler, payloadTooLarge } from './middleware/error.middleware';
import { httpLogger, requestId } from './middleware/requestLogger.middleware';

export function createApp(): Application {
  const app = express();

  // Behind a load balancer / reverse proxy in production.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // The API serves JSON and generated images only; a strict default-src of
      // 'self' is all that is needed, and no inline scripts are ever served.
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );

  const corsOptions: CorsOptions = {
    origin(origin, callback) {
      // Same-origin / server-to-server calls have no Origin header.
      if (!origin) return callback(null, true);

      if (env.corsOrigins.includes('*')) return callback(null, true);
      if (env.corsOrigins.includes(origin)) return callback(null, true);

      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['Content-Disposition', 'X-Request-Id', 'X-QR-Count'],
    maxAge: 600,
  };
  app.use(cors(corsOptions));

  app.use(requestId);
  app.use(httpLogger);

  // Bounded payload size. Bulk requests are the largest legitimate body.
  app.use(express.json({ limit: env.JSON_BODY_LIMIT }));
  app.use(express.urlencoded({ extended: false, limit: env.JSON_BODY_LIMIT }));
  app.use(payloadTooLarge);

  app.use(healthRouter);
  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
