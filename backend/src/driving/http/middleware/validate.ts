import type { Request, Response, NextFunction } from 'express';
import { z, type ZodTypeAny } from 'zod';

type Source = 'body' | 'query' | 'params';

export function validate(source: Source, schema: ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const data = source === 'body' ? req.body : source === 'query' ? req.query : req.params;
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      }));
      next({ status: 400, code: 'validation_error', issues });
      return;
    }
    if (source === 'body') req.body = parsed.data;
    else if (source === 'query') (req as Request & { validatedQuery: unknown }).validatedQuery = parsed.data;
    else req.params = parsed.data as Request['params'];
    next();
  };
}

export { z };
