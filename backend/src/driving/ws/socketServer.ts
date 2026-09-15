import { Server as IoServer, type Socket } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import type { AppWiring } from '../../composition/container.js';
import { UnauthorizedError } from '../../lib/errors.js';
import type { LogLine } from '../../domain/ports/LogStreamer.js';

interface SubscribePayload {
  channel: 'system:stats' | 'container:stats' | 'container:logs' | 'deploy';
  id?: string;
  tail?: number;
  since?: number;
}

interface AuthedSocket extends Socket {
  data: { user?: { username: string; role: 'admin' }; cleanup: Array<() => void> };
}

export function attachSocketServer(http: HttpServer, wiring: AppWiring): IoServer {
  const io = new IoServer(http, {
    cors: { origin: true, credentials: true },
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
    const cleanup: Array<() => void> = [];

    socket.on('subscribe', (payload: SubscribePayload) => {
      try {
        if (payload.channel === 'system:stats') {
          const unsub = wiring.useCases.subscribeSystem.execute((sample) => {
            socket.emit('system:stats', sample);
          });
          cleanup.push(unsub);
        } else if (payload.channel === 'container:stats') {
          const id = payload.id;
          if (!id) throw new Error('container:stats requires id');
          const unsub = wiring.useCases.subscribeContainer.execute(id, (sample) => {
            socket.emit(`container:stats:${id}`, sample);
          });
          cleanup.push(unsub);
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
          cleanup.push(off);
        } else if (payload.channel === 'deploy') {
          const id = payload.id;
          if (!id) throw new Error('deploy channel requires id');
          const room = `deploy:${id}`;
          void socket.join(room);
          cleanup.push(() => {
            void socket.leave(room);
          });
        } else {
          throw new Error(`unknown channel: ${String((payload as { channel?: string }).channel)}`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'subscribe failed';
        socket.emit('error', { code: 'subscribe_error', message });
      }
    });

    socket.on('unsubscribe', (payload: SubscribePayload) => {
      const tag = payload.id ? `${payload.channel}:${payload.id}` : payload.channel;
      const idx = cleanup.findIndex((fn) => fn.toString().includes(tag));
      if (idx >= 0) {
        try {
          cleanup[idx]?.();
        } catch {
          /* ignore */
        }
        cleanup.splice(idx, 1);
      }
    });

    socket.on('disconnect', () => {
      while (cleanup.length) {
        try {
          cleanup.pop()?.();
        } catch {
          /* ignore */
        }
      }
    });
  });

  // Touch UnauthorizedError so it isn't tree-shaken away in some builds.
  void UnauthorizedError;
  return io;
}
