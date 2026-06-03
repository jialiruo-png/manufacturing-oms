import type { NextFunction, Request, Response } from 'express';
import { httpError } from '../lib/httpError';

export function requireRoles(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return next(httpError(401, '请先登录', 'UNAUTHORIZED'));
    if (req.user.isAdmin || roles.includes(req.user.role)) return next();
    return next(httpError(403, '无权执行该操作', 'FORBIDDEN'));
  };
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return next(httpError(401, '请先登录', 'UNAUTHORIZED'));
  if (req.user.isAdmin) return next();
  return next(httpError(403, '仅管理员可以执行该操作', 'FORBIDDEN'));
}

export function requirePermission(check: (user: NonNullable<Request['user']>) => boolean) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return next(httpError(401, '请先登录', 'UNAUTHORIZED'));
    if (check(req.user)) return next();
    return next(httpError(403, '无权执行该操作', 'FORBIDDEN'));
  };
}
