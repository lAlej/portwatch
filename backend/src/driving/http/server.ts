import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import pinoHttp from 'pino-http';
import type { AppWiring } from '../../composition/container.js';
import { authRoutes } from './routes/auth.routes.js';
import { containerRoutes } from './routes/containers.routes.js';
import { systemRoutes } from './routes/system.routes.js';
import { errorHandler } from './middleware/error.js';

export function buildHttpServer(wiring: AppWiring): Express {
  const app = express();

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(cors({ origin: true, credentials: true }));
  app.use(compression());
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());
  app.use(
    pinoHttp({
      autoLogging: { ignore: (req) => req.url === '/health' },
    }),
  );

  app.get('/health', (_req, res) => {
    res.json({ ok: true, ts: Date.now() });
  });

  app.use('/api/auth', authRoutes(wiring));
  app.use('/api/containers', containerRoutes(wiring));
  app.use('/api/system', systemRoutes(wiring));

  app.use(errorHandler);
  return app;
}
