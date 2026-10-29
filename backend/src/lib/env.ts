import { z } from 'zod';
import { config as loadDotenv } from 'dotenv';

loadDotenv();

// Matches the sample values shipped in .env.example so a copy-pasted config
// can never boot with a publicly known signing key.
const PLACEHOLDER_SECRET = /change-me|replace-with/i;

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  ADMIN_USERNAME: z.string().min(1),
  ADMIN_PASSWORD_HASH: z
    .string()
    .regex(/^\$2[aby]\$\d{2}\$.{53}$/, 'ADMIN_PASSWORD_HASH must be a bcrypt hash (pnpm hash-password)'),

  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 chars')
    .refine((v) => !PLACEHOLDER_SECRET.test(v), 'JWT_SECRET is still the .env.example placeholder'),
  JWT_TTL_SECONDS: z.coerce.number().int().positive().default(86400),

  COOKIE_SECURE: z
    .union([z.literal('true'), z.literal('false')])
    .default('false')
    .transform((v) => v === 'true'),
  COOKIE_SAMESITE: z.enum(['strict', 'lax', 'none']).default('strict'),

  // Comma-separated browser origins allowed to call the API cross-origin.
  // Empty (default) = same-origin only, which is how Caddy + Vite proxy serve it.
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((o) => o.trim())
        .filter((o) => o.length > 0),
    ),
  // Number of reverse proxies in front of the backend (Caddy = 1). Needed so
  // rate limiting keys on the real client IP instead of the proxy's.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(1),

  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  LOGIN_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),

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
