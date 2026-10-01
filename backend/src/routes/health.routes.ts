import { Router } from 'express';
import { isConnected } from '../config/db';
import { ErrorCode } from '../utils/apiError';

export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  const database = isConnected();

  res.status(database ? 200 : 503).json({
    success: database,
    data: {
      status: database ? 'ok' : 'degraded',
      database: database ? 'connected' : 'disconnected',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
    ...(database
      ? {}
      : { error: { code: ErrorCode.DATABASE_UNAVAILABLE, message: 'Database is not connected' } }),
  });
});
