import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';

// Brute-force guard for the login endpoint. Only failed attempts count, so a
// legitimate admin who signs in correctly never burns through the budget.
export function loginRateLimiter(opts: { max: number; windowMs: number }): RateLimitRequestHandler {
  return rateLimit({
    windowMs: opts.windowMs,
    limit: opts.max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: {
      error: 'too_many_requests',
      message: 'Too many failed login attempts. Try again later.',
    },
  });
}
