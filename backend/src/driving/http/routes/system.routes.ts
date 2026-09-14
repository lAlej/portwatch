import { Router } from 'express';
import type { AppWiring } from '../../../composition/container.js';
import { requireAuth } from '../middleware/auth.js';

export function systemRoutes(wiring: AppWiring): Router {
  const router = Router();
  router.use(requireAuth(wiring));

  router.get('/snapshot', async (_req, res, next) => {
    try {
      const snapshot = await wiring.useCases.systemSnapshot.execute();
      res.json({ snapshot });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
