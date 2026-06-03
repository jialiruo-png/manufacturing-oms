import type { ApprovalLog, OrderItem, Prisma } from '@prisma/client';

const ORDER_ITEM_PREVIEW_LIMIT = 3;

export const ORDER_LIST_INCLUDE = {
  salesperson: { select: { id: true, name: true } },
  customer: { select: { id: true, name: true, contact: true, phone: true, salespersonId: true, salespersonName: true } },
  product: { select: { id: true, name: true, code: true } },
  approvalLog: {
    take: 1,
    orderBy: { createdAt: 'desc' as const },
  },
  orderItems: {
    take: ORDER_ITEM_PREVIEW_LIMIT,
    orderBy: { id: 'asc' as const },
    select: {
      id: true,
      orderId: true,
      productId: true,
      productName: true,
      spec: true,
      customerBrand: true,
      unit: true,
      quantity: true,
      unitPrice: true,
      subtotal: true,
      remark: true,
      createdAt: true,
      updatedAt: true,
    },
  },
} satisfies Prisma.OrderInclude;

export const ORDER_DETAIL_INCLUDE = {
  salesperson: { select: { id: true, name: true } },
  customer: { select: { id: true, name: true, contact: true, phone: true, salespersonId: true, salespersonName: true } },
  product: { select: { id: true, name: true, code: true } },
  materials: { orderBy: { id: 'asc' as const } },
  approvalLog: { orderBy: { createdAt: 'asc' as const } },
  orderItems: { orderBy: { id: 'asc' as const } },
} satisfies Prisma.OrderInclude;

export type OrderDetailWithRelations = Prisma.OrderGetPayload<{ include: typeof ORDER_DETAIL_INCLUDE }>;
type OrderListWithRelations = Prisma.OrderGetPayload<{ include: typeof ORDER_LIST_INCLUDE }>;

export type MaterialSummary = {
  total: number;
  ready: number;
  unready: number;
  urgentUnready: number;
};

type OrderForSummary = OrderListWithRelations & {
  materials?: { status: string; urgent: boolean }[];
  approvalLog: ApprovalLog[];
};

function withDisplayNames<T extends { productName: string }>(items: T[]) {
  const totalByName = new Map<string, number>();
  const seenByName = new Map<string, number>();
  for (const item of items) {
    totalByName.set(item.productName, (totalByName.get(item.productName) || 0) + 1);
  }
  return items.map((item) => {
    const total = totalByName.get(item.productName) || 0;
    const next = (seenByName.get(item.productName) || 0) + 1;
    seenByName.set(item.productName, next);
    return {
      ...item,
      displayName: total > 1 ? `${item.productName}${next}` : item.productName,
    };
  });
}

export function enrichOrder(o: OrderDetailWithRelations) {
  const orderItems = withDisplayNames(o.orderItems);
  const displayNameByItemId = new Map(orderItems.map((item) => [item.id, item.displayName]));
  const product = o.product ?? {
    id: 0,
    name: orderItems[0]?.productName || '—',
    code: '',
  };
  return {
    ...o,
    product,
    orderItems,
    materials: o.materials.map((material) => ({
      ...material,
      orderItemDisplayName: material.orderItemId ? displayNameByItemId.get(material.orderItemId) || '' : '',
    })),
  };
}

export function toOrderListSummary(o: OrderForSummary, materialSummary?: MaterialSummary) {
  const latestApprovalLog = o.approvalLog
    .slice()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 1)
    .reverse();
  const orderItems = o.orderItems;
  const product = o.product ?? {
    id: 0,
    name: orderItems[0]?.productName || '—',
    code: '',
  };
  const materials = o.materials ?? [];
  const ready = materials.filter((m) => m.status === 'ready').length;
  const urgentUnready = materials.filter((m) => m.urgent && m.status !== 'ready').length;
  const summary = materialSummary ?? {
    total: materials.length,
    ready,
    unready: materials.length - ready,
    urgentUnready,
  };

  return {
    ...o,
    product,
    materials: [],
    approvalLog: latestApprovalLog,
    orderItems,
    materialSummary: summary,
  };
}
