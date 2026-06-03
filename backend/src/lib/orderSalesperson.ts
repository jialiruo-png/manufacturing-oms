import type { Prisma } from '@prisma/client';

type RequestUser = NonNullable<Express.Request['user']>;

export function canAssignOrderSalesperson(user?: Pick<RequestUser, 'isAdmin' | 'canCreateOrderForSales' | 'canManageUsers' | 'canApproveOrder'>) {
  return !!user && (
    user.isAdmin ||
    user.canCreateOrderForSales === true ||
    user.canManageUsers === true ||
    user.canApproveOrder === true
  );
}

export async function resolveOrderSalesperson(
  tx: Prisma.TransactionClient,
  user: RequestUser,
  requestedSalespersonId?: unknown,
) {
  if (user.role === 'sales' && !user.isAdmin) {
    return { salespersonId: user.userId, salespersonName: user.name };
  }

  const requested = requestedSalespersonId !== undefined && requestedSalespersonId !== null && String(requestedSalespersonId).trim() !== ''
    ? Number(requestedSalespersonId)
    : null;

  if (requested !== null) {
    if (!canAssignOrderSalesperson(user)) {
      throw new Error('无权指定订单业务员');
    }
    if (!Number.isInteger(requested)) {
      throw new Error('业务员ID不合法');
    }
    const salesperson = await tx.user.findFirst({
      // 经理层也会自己谈单子，允许把订单归属到经理层账号
      where: { id: requested, role: { in: ['sales', 'manager'] }, status: 'enabled', deletedAt: null },
      select: { id: true, name: true },
    });
    if (!salesperson) {
      throw new Error('只能指定已启用的业务员或经理层账号');
    }
    return { salespersonId: salesperson.id, salespersonName: salesperson.name };
  }

  throw new Error('请选择订单业务员');
}
