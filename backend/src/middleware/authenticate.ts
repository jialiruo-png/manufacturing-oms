import type { NextFunction, Request, Response } from 'express';
import { verifyToken } from '../lib/jwt';
import { prisma } from '../prisma';
import { httpError } from '../lib/httpError';

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return next(httpError(401, '请先登录', 'UNAUTHORIZED'));
  }

  try {
    const payload = verifyToken(token);
    if (!payload) return next(httpError(401, '登录状态无效', 'UNAUTHORIZED'));

    const user = await prisma.user.findFirst({
      where: { id: payload.userId, status: 'enabled', deletedAt: null },
      select: {
        id: true,
        role: true,
        managerSubRole: true,
        canApproveOrder: true,
        canManageUsers: true,
        isClerk: true,
        canCreateOrderForSales: true,
        isAdmin: true,
        name: true,
        tokenVersion: true,
        mustChangePassword: true,
      },
    });
    if (!user) return next(httpError(401, '登录状态已失效', 'UNAUTHORIZED'));
    if (user.tokenVersion !== payload.tokenVersion) {
      return next(httpError(401, '登录状态已失效', 'UNAUTHORIZED'));
    }

    req.user = {
      userId: user.id,
      role: user.role,
      managerSubRole: user.managerSubRole,
      canApproveOrder: user.canApproveOrder,
      canManageUsers: user.canManageUsers,
      isClerk: user.isClerk,
      canCreateOrderForSales: user.canCreateOrderForSales,
      isAdmin: user.isAdmin,
      name: user.name,
      tokenVersion: user.tokenVersion,
      mustChangePassword: user.mustChangePassword,
    };
    next();
  } catch {
    return next(httpError(401, '登录状态无效或已过期', 'UNAUTHORIZED'));
  }
}
