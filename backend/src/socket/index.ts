import type http from 'node:http';
import type { Server as SocketIOServer } from 'socket.io';
import { Server as IOServer } from 'socket.io';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import {
  setRealtimePublisher,
  theaterRoom,
  type RealtimePublisher,
} from '../services/realtime.service';

export interface Realtime extends RealtimePublisher {
  io: SocketIOServer;
  close(): Promise<void>;
}

/**
 * Socket.io transport.
 *
 * Two room shapes exist:
 *  - `theater:{theaterId}`  - every order event for that cinema. This is what
 *                             the KDS display subscribes to.
 *  - `theater:{id}:screen:{n}` - a single screen's board, for a future split
 *                             kitchen view.
 *
 * There is deliberately no global room. Broadcasting every theater's tickets to
 * every connected client would leak one cinema's order volume to another.
 */
export function initRealtime(httpServer: http.Server): Realtime {
  const io = new IOServer(httpServer, {
    // Same allow-list as the HTTP layer. `origin: true` would reflect any
    // origin, which is a real exposure once a browser holds a socket.
    cors: {
      origin: env.corsOrigins.includes('*') ? true : env.corsOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // Long-lived KDS connections; ping often enough to evict dead sockets fast.
    pingInterval: 20_000,
    pingTimeout: 25_000,
    maxHttpBufferSize: 1e5,
    transports: ['websocket', 'polling'],
  });

  io.on('connection', (socket) => {
    logger.debug('Socket connected', { socketId: socket.id });

    socket.on(
      'kds:join',
      (payload: { theaterId?: unknown; screenNumber?: unknown }) => {
        const theaterId = typeof payload?.theaterId === 'string' ? payload.theaterId : '';
        const screenNumber =
          typeof payload?.screenNumber === 'number' ? payload.screenNumber : undefined;

        if (!isValidTheaterId(theaterId)) {
          socket.emit('kds:join-failed', { reason: 'INVALID_THEATER_ID' });
          return;
        }

        const rooms = [theaterRoom(theaterId)];
        if (screenNumber !== undefined && Number.isInteger(screenNumber) && screenNumber > 0) {
          rooms.push(`${theaterRoom(theaterId)}:screen:${screenNumber}`);
        }

        for (const room of rooms) {
          void socket.join(room);
        }

        socket.emit('kds:joined', { theaterId, screenNumber: screenNumber ?? null, rooms });
      },
    );

    socket.on('disconnect', (reason) => {
      logger.debug('Socket disconnected', { socketId: socket.id, reason });
    });
  });

  const realtime: Realtime = {
    io,
    emitToTheater(theaterId, event, payload) {
      io.to(theaterRoom(theaterId)).emit(event, payload);
    },
    close(): Promise<void> {
      return new Promise<void>((resolve) => {
        void io.close(() => resolve());
      });
    },
  };

  setRealtimePublisher(realtime);
  return realtime;
}

/** ObjectId-shaped only. A random string must not be able to name a room. */
function isValidTheaterId(value: string): boolean {
  return /^[a-f0-9]{24}$/i.test(value);
}
