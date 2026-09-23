import { Router } from 'express';
import express from 'express';
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
const composeContentBody = z.object({
  content: z.string().max(524288),
  relPath: z.string().min(1).max(512).optional(),
});
const composeQuery = z.object({
  relPath: z.string().min(1).max(512).optional(),
});
const deployQuery = z.object({}).optional();
const adHocBody = z.object({
  name: z.string().min(1).max(128),
  composeContent: z.string().min(1).max(524288),
  envVars: z.array(envVarSchema).optional().default([]),
});

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

  router.get(
    '/:id/compose',
    validate('params', idParam),
    validate('query', composeQuery),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof idParam>;
        const { relPath } = req.query as unknown as z.infer<typeof composeQuery>;
        const compose = await wiring.useCases.getProjectCompose.execute({
          id,
          relPath,
        });
        res.json({ compose });
      } catch (err) {
        next(err);
      }
    },
  );

  router.put(
    '/:id/compose',
    // Per-route parser: 1mb beats the global 256kb for big inline env.
    validate('params', idParam),
    express.json({ limit: '1mb' }),
    validate('body', composeContentBody),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof idParam>;
        const { content, relPath } = req.body as z.infer<typeof composeContentBody>;
        const result = await wiring.useCases.updateProjectCompose.execute({
          id,
          content,
          relPath,
        });
        res.json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  // Creates an ad-hoc project (paste compose, no repo). The resulting container
  // carries the com.docker.compose.project label, which the existing UI
  // already resolves to a Project to show "Edit compose".
  router.post(
    '/ad-hoc',
    validate('body', adHocBody),
    async (req, res, next) => {
      try {
        const { name, composeContent, envVars } = req.body as z.infer<typeof adHocBody>;
        const { project } = await wiring.useCases.createAdHocComposeProject.execute({
          name,
          composeContent,
          envVars,
        });
        res.status(201).json({ project });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
