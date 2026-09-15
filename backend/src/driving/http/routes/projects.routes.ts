import { Router } from 'express';
import { z } from 'zod';
import type { AppWiring } from '../../../composition/container.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const idParam = z.object({ id: z.string().min(1) });
const envVarSchema = z.object({
  key: z.string().min(1).max(256),
  value: z.string().max(8192),
});
const cloneBody = z.object({
  cloneUrl: z.string().url().or(z.string().regex(/^[\w-]+@[\w.-]+:[\w./-]+$/)),
  envVars: z.array(envVarSchema).optional().default([]),
});
const updateEnvBody = z.object({
  envVars: z.array(envVarSchema),
});
const deployQuery = z.object({}).optional();

export function projectRoutes(wiring: AppWiring): Router {
  const router = Router();
  router.use(requireAuth(wiring));

  router.get('/', async (_req, res, next) => {
    try {
      const { projects } = await wiring.useCases.listProjects.execute();
      res.json({ projects });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', validate('body', cloneBody), async (req, res, next) => {
    try {
      const { cloneUrl, envVars } = req.body as z.infer<typeof cloneBody>;
      const { project } = await wiring.useCases.cloneProject.execute({ cloneUrl, envVars });
      res.status(201).json({ project });
    } catch (err) {
      next(err);
    }
  });

  router.put('/:id/env', validate('params', idParam), validate('body', updateEnvBody), async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParam>;
      const { envVars } = req.body as z.infer<typeof updateEnvBody>;
      await wiring.useCases.updateProjectEnv.execute({ id, envVars });
      res.json({ ok: true, id });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', validate('params', idParam), async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParam>;
      await wiring.useCases.deleteProject.execute({ id });
      res.json({ ok: true, id });
    } catch (err) {
      next(err);
    }
  });

  router.get(
    '/:id/deployments',
    validate('params', idParam),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof idParam>;
        const { deployments } = await wiring.useCases.listDeployments.execute({
          projectId: id,
        });
        res.json({ deployments });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/:id/deploy',
    validate('params', idParam),
    validate('query', deployQuery),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof idParam>;
        const { deploymentId } = await wiring.useCases.triggerDeploy.execute({ id });
        res.status(202).json({ deploymentId });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
