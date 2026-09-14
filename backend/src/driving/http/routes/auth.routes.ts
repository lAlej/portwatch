import { Router } from 'express';
import { z } from 'zod';
import type { AppWiring } from '../../../composition/container.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export function authRoutes(wiring: AppWiring): Router {
  const router = Router();

  router.post('/login', validate('body', loginSchema), async (req, res, next) => {
    try {
      const { username, password } = req.body as z.infer<typeof loginSchema>;
      const result = await wiring.useCases.login.execute(username, password, wiring.config.JWT_TTL_SECONDS);
      res.cookie('token', result.token, {
        httpOnly: true,
        sameSite: wiring.config.COOKIE_SAMESITE,
        secure: wiring.config.COOKIE_SECURE,
        maxAge: wiring.config.JWT_TTL_SECONDS * 1000,
        path: '/',
      });
      res.json({ user: result.user });
    } catch (err) {
      next(err);
    }
  });

  router.post('/logout', (_req, res) => {
    res.clearCookie('token', { path: '/' });
    res.json({ ok: true });
  });

  router.get('/me', requireAuth(wiring), (req, res) => {
    res.json({ user: wiring.useCases.getCurrentUser.execute(req.user!) });
  });

  return router;
}
