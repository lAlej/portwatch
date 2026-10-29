import { Server as IoServer, type Socket } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import { z } from 'zod';
import type { AppWiring } from '../../composition/container.js';
import { UnauthorizedError } from '../../lib/errors.js';
import type { LogLine } from '../../domain/ports/LogStreamer.js';
import { isAllowedOrigin } from '../../lib/origin.js';

// Client messages are untrusted: validate shape and bound the numbers before
// they reach Docker (an unbounded `tail` would read the whole log history).
const subscribeSchema = z.object({
  channel: z.enum(['system:stats', 'container:stats', 'container:logs', 'deploy']),
  id: z.string().min(1).max(128).optional(),
  tail: z.number().int().min(0).max(10_000).optional(),
  since: z.number().int().min(0).optional(),
});
type SubscribePayload = z.infer<typeof subscribeSchema>;

interface AuthedSocket extends Socket {
  data: { user?: { username: string; role: 'admin' }; cleanup: Array<() => void> };
}

export function attachSocketServer(http: HttpServer, wiring: AppWiring): IoServer {
  const io = new IoServer(http, {
    cors: wiring.config.CORS_ORIGINS.length
      ? { origin: wiring.config.CORS_ORIGINS, credentials: true }
      : undefined,
    // CORS doesn't apply to WebSocket handshakes, and the auth cookie rides
    // along on them. Reject foreign origins here to block cross-site
    // WebSocket hijacking.
    allowRequest: (req, callback) => {
      callback(
        null,
        isAllowedOrigin(req.headers.origin, req.headers.host, wiring.config.CORS_ORIGINS),
      );
    },
    serveClient: false,
  });

  io.use((socket, next) => {
    try {
      const token =
        (socket.handshake.headers.cookie ?? '')
          .split(';')
          .map((c) => c.trim())
          .find((c) => c.startsWith('token='))
          ?.split('=')[1];
      if (!token) return next(new Error('unauthorized'));
      const user = wiring.ports.tokens.verify(token);
      (socket as AuthedSocket).data = { user, cleanup: [] };
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (raw) => {
    const socket = raw as AuthedSocket;
    // Lookup por clave estable en lugar de comparar el source del closure
    // con un literal — `fn.toString()` nunca contiene el id, así que el
    // `findIndex` previo devolvía -1 y los unsubscribe no cerraban streams.
    // Re-suscribir al mismo canal reabre el stream sin liberar el anterior,
    // y cada línea se emitía N veces al cliente (N = mounts acumulados).
    const subs = new Map<string, () => void>();

    const release = (key: string): void => {
      const fn = subs.get(key);
      if (!fn) return;
      subs.delete(key);
      try {
        fn();
      } catch {
        /* ignore */
      }
    };

    const subscribeKey = (p: SubscribePayload): string =>
      p.id ? `${p.channel}:${p.id}` : p.channel;

    socket.on('subscribe', (raw: unknown) => {
      try {
        const parsed = subscribeSchema.safeParse(raw);
        if (!parsed.success) throw new Error('invalid subscribe payload');
        const payload = parsed.data;
        const key = subscribeKey(payload);
        // Idempotente: si ya hay una suscripción viva para esta clave,
        // liberamos la anterior antes de crear la nueva para no duplicar
        // streams en cada re-mount de LogTerminal / StrictMode.
        if (subs.has(key)) release(key);

        if (payload.channel === 'system:stats') {
          const unsub = wiring.useCases.subscribeSystem.execute((sample) => {
            socket.emit('system:stats', sample);
          });
          subs.set(key, unsub);
        } else if (payload.channel === 'container:stats') {
          const id = payload.id;
          if (!id) throw new Error('container:stats requires id');
          const unsub = wiring.useCases.subscribeContainer.execute(id, (sample) => {
            socket.emit(`container:stats:${id}`, sample);
          });
          subs.set(key, unsub);
        } else if (payload.channel === 'container:logs') {
          const id = payload.id;
          if (!id) throw new Error('container:logs requires id');
          const off = wiring.ports.logStreamer.stream(
            id,
            { tail: payload.tail ?? 200, since: payload.since ?? 0 },
            (line: LogLine) => {
              socket.emit(`container:logs:${id}`, line);
            },
          );
          subs.set(key, off);
        } else if (payload.channel === 'deploy') {
          const id = payload.id;
          if (!id) throw new Error('deploy channel requires id');
          const room = `deploy:${id}`;
          void socket.join(room);
          subs.set(key, () => {
            void socket.leave(room);
          });
        } else {
          throw new Error('unknown channel');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'subscribe failed';
        socket.emit('error', { code: 'subscribe_error', message });
      }
    });

    socket.on('unsubscribe', (raw: unknown) => {
      const parsed = subscribeSchema.safeParse(raw);
      if (parsed.success) release(subscribeKey(parsed.data));
    });

    socket.on('disconnect', () => {
      for (const fn of subs.values()) {
        try {
          fn();
        } catch {
          /* ignore */
        }
      }
      subs.clear();
    });
  });

  // Touch UnauthorizedError so it isn't tree-shaken away in some builds.
  void UnauthorizedError;
  return io;
}
