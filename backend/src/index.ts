import http from 'node:http';
import { buildFromEnv } from './composition/container.js';
import { buildHttpServer } from './driving/http/server.js';
import { attachSocketServer } from './driving/ws/socketServer.js';

async function main(): Promise<void> {
  const wiring = buildFromEnv();
  const app = buildHttpServer(wiring);
  const server = http.createServer(app);
  attachSocketServer(server, wiring);

  const port = wiring.config.PORT;
  server.listen(port, () => {
    wiring.logger.info(`backend listening`, { port });
  });

  const shutdown = (sig: string) => {
    wiring.logger.info('shutdown initiated', { sig });
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('fatal startup error', err);
  process.exit(1);
});
