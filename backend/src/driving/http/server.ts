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
import { projectRoutes } from './routes/projects.routes.js';
import { errorHandler } from './middleware/error.js';

const COMPOSE_WRITE_PATH = /^\/api\/projects\/[^/]+\/compose$/;

export function buildHttpServer(wiring: AppWiring): Express {
  const app = express();

  // Caddy sits in front; trust its X-Forwarded-For so req.ip (and therefore
  // the login rate limiter) sees the real client instead of the proxy.
  app.set('trust proxy', wiring.config.TRUST_PROXY_HOPS);

  // The backend only ever answers with JSON, so lock the CSP down completely.
  // The SPA's own CSP is set by Caddy (see Caddyfile).
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
    }),
  );
  // Same-origin by default (Caddy / Vite proxy). Cross-origin callers must be
  // listed explicitly in CORS_ORIGINS; credentials are never reflected blindly.
  app.use(cors({ origin: wiring.config.CORS_ORIGINS, credentials: true }));
  app.use(compression());
  // Compose edits carry whole files and use their own, larger parser (see
  // projects.routes.ts, after auth). Skip the small global one for them, or
  // it rejects the body before the route-level parser ever sees it.
  const jsonBody = express.json({ limit: '256kb' });
  app.use((req, res, next) =>
    req.method === 'PUT' && COMPOSE_WRITE_PATH.test(req.path) ? next() : jsonBody(req, res, next),
  );
  app.use(cookieParser());
  app.use(
    pinoHttp({
      level: wiring.config.LOG_LEVEL,
      autoLogging: { ignore: (req) => req.url === '/health' },
      // The session JWT travels in a cookie; never write it to the logs.
      redact: {
        paths: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
        censor: '[redacted]',
      },
    }),
  );

  app.get('/health', (_req, res) => {
    res.json({ ok: true, ts: Date.now() });
  });

  app.use('/api/auth', authRoutes(wiring));
  app.use('/api/containers', containerRoutes(wiring));
  app.use('/api/system', systemRoutes(wiring));
  app.use('/api/projects', projectRoutes(wiring));

  app.use(errorHandler);
  return app;
}
