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

    const isDemoUser = user.role === 'demo';

    // Demo accounts are read-only super-viewers: we grant view-side flags so they
    // can see every role's pages, but we block every non-GET request below so they
    // cannot mutate anything regardless of UI state.
    req.user = {
      userId: user.id,
      role: user.role,
      managerSubRole: isDemoUser ? '' : user.managerSubRole,
      canApproveOrder: isDemoUser ? true : user.canApproveOrder,
      canManageUsers: isDemoUser ? true : user.canManageUsers,
      isClerk: isDemoUser ? true : user.isClerk,
      canCreateOrderForSales: isDemoUser ? true : user.canCreateOrderForSales,
      isAdmin: isDemoUser ? true : user.isAdmin,
      name: user.name,
      tokenVersion: user.tokenVersion,
      mustChangePassword: user.mustChangePassword,
    };

    if (isDemoUser) {
      const method = req.method.toUpperCase();
      if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
        return next(httpError(403, '试用账号为只读模式，无法执行写入操作', 'DEMO_READ_ONLY'));
      }
    }

    next();
  } catch {
    return next(httpError(401, '登录状态无效或已过期', 'UNAUTHORIZED'));
  }
}
