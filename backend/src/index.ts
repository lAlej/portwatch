import http from 'node:http';
import { buildFromEnv, setDeployPublisher } from './composition/container.js';
import { buildHttpServer } from './driving/http/server.js';
import { attachSocketServer } from './driving/ws/socketServer.js';
import { SocketIoDeployPublisher } from './adapters/projects/SocketIoDeployPublisher.js';
import { fixSshKeyPermissions } from './adapters/projects/HostGit.js';

async function main(): Promise<void> {
  const wiring = buildFromEnv();
  await fixSshKeyPermissions(wiring.logger);
  const app = buildHttpServer(wiring);
  const server = http.createServer(app);
  const io = attachSocketServer(server, wiring);
  setDeployPublisher(wiring, new SocketIoDeployPublisher(io));

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
