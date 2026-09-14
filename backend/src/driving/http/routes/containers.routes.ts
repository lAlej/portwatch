import { Router } from 'express';
import { z } from 'zod';
import type { AppWiring } from '../../../composition/container.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const idParam = z.object({ id: z.string().min(1) });

export function containerRoutes(wiring: AppWiring): Router {
  const router = Router();
  router.use(requireAuth(wiring));

  router.get('/', async (_req, res, next) => {
    try {
      const containers = await wiring.useCases.listContainers.execute();
      res.json({ containers });
    } catch (err) {
      next(err);
    }
  });

  const action =
    (useCase: (id: string) => Promise<void>) =>
    async (req: unknown extends import('express').Request ? never : import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
      try {
        const { id } = (req as import('express').Request).params as z.infer<typeof idParam>;
        await useCase(id);
        res.json({ ok: true, id });
      } catch (err) {
        next(err);
      }
    };

  router.post('/:id/start', validate('params', idParam), (req, res, next) => action(wiring.useCases.start.execute)(req, res, next));
  router.post('/:id/pause', validate('params', idParam), (req, res, next) => action(wiring.useCases.pause.execute)(req, res, next));
  router.post('/:id/unpause', validate('params', idParam), (req, res, next) => action(wiring.useCases.unpause.execute)(req, res, next));
  router.post('/:id/restart', validate('params', idParam), (req, res, next) => action(wiring.useCases.restart.execute)(req, res, next));
  router.post('/:id/kill', validate('params', idParam), (req, res, next) => action(wiring.useCases.kill.execute)(req, res, next));

  router.get('/:id/inspect', validate('params', idParam), async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParam>;
      const data = await wiring.useCases.inspect.execute(id);
      res.json({ inspect: data });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
