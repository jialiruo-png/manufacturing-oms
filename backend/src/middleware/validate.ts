import type { RequestHandler } from 'express';
import type { ZodTypeAny, z } from 'zod';
import { ZodError } from 'zod';
import { httpError } from '../lib/httpError';

type ValidationTarget = 'body' | 'query' | 'params';

export function validate(target: ValidationTarget, schema: ZodTypeAny): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      return next(validationError(result.error));
    }

    req[target] = result.data;
    next();
  };
}

function validationError(error: ZodError) {
  const details = error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
  return httpError(400, details[0]?.message || '请求参数不合法', 'VALIDATION_ERROR', details);
}

export type InferValidated<T extends ZodTypeAny> = z.infer<T>;
