import type { Prisma } from '@prisma/client';

export function salesOrderWhere(user: Express.Request['user']): Prisma.OrderWhereInput {
  if (user?.role === 'sales' && !user.isAdmin) {
    return {
      OR: [
        { salespersonId: user.userId },
        {
          salespersonId: null,
          OR: [
            { salespersonName: user.name },
            { createdBy: user.name },
          ],
        },
      ],
    };
  }
  return {};
}

export function canSalesAccessOrderByOwner(
  user: Express.Request['user'],
  order: { salespersonId: number | null; salespersonName?: string | null; createdBy?: string | null },
) {
  if (user?.role !== 'sales' || user.isAdmin) return true;
  if (order.salespersonId !== null) return order.salespersonId === user.userId;
  return order.salespersonName === user.name || order.createdBy === user.name;
}
