import { z } from 'zod';
import { config as loadDotenv } from 'dotenv';

loadDotenv();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  ADMIN_USERNAME: z.string().min(1),
  ADMIN_PASSWORD_HASH: z.string().min(1),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
  JWT_TTL_SECONDS: z.coerce.number().int().positive().default(86400),

  COOKIE_SECURE: z
    .union([z.literal('true'), z.literal('false')])
    .default('false')
    .transform((v) => v === 'true'),
  COOKIE_SAMESITE: z.enum(['strict', 'lax', 'none']).default('strict'),

  DOCKER_SOCKET_PATH: z.string().min(1).default('/var/run/docker.sock'),

  STATS_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  LOG_BUFFER: z.coerce.number().int().positive().default(2000),

  PROJECTS_DIR: z.string().min(1).default('/projects'),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(): AppConfig {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
