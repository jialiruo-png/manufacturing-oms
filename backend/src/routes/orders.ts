import { Router } from 'express';
import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { requirePermission, requireRoles } from '../middleware/authorize';
import { generateContractNumber, isContractNumberConflict, withContractNumberRetry } from '../lib/contractNumbers';
import { ORDER_DETAIL_INCLUDE, ORDER_LIST_INCLUDE, type MaterialSummary, enrichOrder, toOrderListSummary } from '../lib/orderSummary';
import { startDateForRange } from '../lib/dateRange';
import { canSalesAccessOrderByOwner, salesOrderWhere } from '../lib/salesAccess';
import { clearDashboardCache } from '../lib/dashboardCache';
import { resolveOrderSalesperson } from '../lib/orderSalesperson';
import { buildProductionPlanMaterials } from '../lib/productionPlanMaterials';
import { canApproveOrder, canApproveShipment, canCreateOrderForSales, canHandleLogistics, canHandleProcurement, canHandleProduction, canViewOrders } from '../lib/userPermissions';
import { validate } from '../middleware/validate';
import { createOrderSchema, idParamsSchema, orderActionSchema, orderListQuerySchema, orderProgressSchema, updateOrderSchema } from '../validation/schemas';

const router = Router();

interface ItemInput {
  productId?: number | string | null;
  productName: string;
  spec?: string;
  customerBrand?: string;
  unit?: string;
  quantity: number | string;
  unitPrice: number | string;
  remark?: string;
  detailRequirement?: string;
  sourceRowNo?: string;
  ctnCount?: number | string | null;
  qtyPerCtn?: number | string | null;
  ctnVolume?: number | string | null;
  totalVolume?: number | string | null;
  ctnWeight?: number | string | null;
  totalWeight?: number | string | null;
}

const TRANSITIONS: Record<string, { from: string[]; to: string; check: (user: NonNullable<Request['user']>) => boolean }> = {
  submit: { from: ['draft'], to: 'pending_approval', check: canCreateOrderForSales },
  approve: { from: ['pending_approval'], to: 'procurement', check: canApproveOrder },
  reject: { from: ['pending_approval'], to: 'draft', check: canApproveOrder },
  // 采购：物料全部备齐后将订单排入生产排产队列
  queue_production: { from: ['procurement'], to: 'pending_production', check: canHandleProcurement },
  // 生产：从排产队列领单进入生产中
  start_production: { from: ['pending_production'], to: 'production', check: canHandleProduction },
  // 生产完成后直接进入物流待发货，无需审批
  finish_production: { from: ['production'], to: 'ready_ship', check: canHandleProduction },
  // 物流"安排发货"后提交审批
  ship: { from: ['ready_ship'], to: 'pending_ship_approval', check: canHandleLogistics },
  // 发货审批仅经理层-内勤跟单（或管理员）可处理
  approve_ship: { from: ['pending_ship_approval'], to: 'shipped', check: canApproveShipment },
  reject_ship: { from: ['pending_ship_approval'], to: 'ready_ship', check: canApproveShipment },
  request_review: { from: ['production'], to: 'pending_approval', check: canHandleProduction },
  withdraw: { from: ['pending_approval'], to: 'draft', check: canCreateOrderForSales },
};

function boolValue(value: unknown) {
  return value === true || value === 'true';
}

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function optionalInt(value: unknown) {
  const n = optionalNumber(value);
  return n === undefined ? undefined : Math.round(n);
}

function parseOptionalDate(value: unknown) {
  if (typeof value !== 'string' || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function dateUpperBound(date: Date, rawValue: unknown) {
  return typeof rawValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawValue)
    ? endOfDay(date)
    : date;
}

function containsText(term: string) {
  return { contains: term, mode: 'insensitive' as const };
}

function orderSearchFilter(term: string, searchField?: unknown): Prisma.OrderWhereInput {
  const numericTerm = Number(term);
  const canSearchId = Number.isInteger(numericTerm) && numericTerm > 0;
  const contractFilter: Prisma.OrderWhereInput = {
    contractNo: containsText(term),
  };
  const customerFilter: Prisma.OrderWhereInput = {
    customer: { name: containsText(term) },
  };
  const salespersonFilter: Prisma.OrderWhereInput = {
    OR: [
      { salespersonName: containsText(term) },
      { createdBy: containsText(term) },
      { salesperson: { is: { name: containsText(term) } } },
      ...(canSearchId ? [{ salespersonId: numericTerm }] : []),
    ],
  };
  const productFilter: Prisma.OrderWhereInput = {
    OR: [
      { product: { is: { name: containsText(term) } } },
      {
        orderItems: {
          some: {
            OR: [
              { productName: containsText(term) },
              { spec: containsText(term) },
              { customerBrand: containsText(term) },
            ],
          },
        },
      },
    ],
  };

  if (searchField === 'contract') return contractFilter;
  if (searchField === 'customer') return customerFilter;
  if (searchField === 'salesperson') return salespersonFilter;
  if (searchField === 'tracking') {
    return { approvalLog: { some: { action: 'ship', reason: { contains: term } } } };
  }
  return {
    OR: [
      contractFilter,
      customerFilter,
      salespersonFilter,
      productFilter,
    ],
  };
}

// List orders with optional status filter
router.get('/', requirePermission(canViewOrders), validate('query', orderListQuerySchema), async (req, res) => {
  try {
    const {
      status,
      customerId,
      range,
      sort,
      page,
      pageSize,
      search,
      searchField,
      deliveryDateFrom,
      deliveryDateTo,
      shipDateFrom,
      shipDateTo,
    } = req.query;
    const rangeStart = startDateForRange(range);
    if (rangeStart === undefined) {
      return res.status(400).json({ error: '时间范围参数不合法' });
    }
    const deliveryDateStart = parseOptionalDate(deliveryDateFrom);
    const deliveryDateEnd = parseOptionalDate(deliveryDateTo);
    const shipDateStart = parseOptionalDate(shipDateFrom);
    const shipDateEnd = parseOptionalDate(shipDateTo);
    if (deliveryDateStart === undefined || deliveryDateEnd === undefined) {
      return res.status(400).json({ error: '交付日期参数不合法' });
    }
    if (shipDateStart === undefined || shipDateEnd === undefined) {
      return res.status(400).json({ error: '发货时间参数不合法' });
    }

    const where: Prisma.OrderWhereInput = { ...salesOrderWhere(req.user) };
    const andFilters: Prisma.OrderWhereInput[] = [];
    if (typeof status === 'string' && status) {
      where.status = status.includes(',')
        ? { in: status.split(',') }
        : status;
    }
    if (typeof customerId === 'number') where.customerId = customerId;
    if (rangeStart) where.createdAt = { gte: rangeStart };
    if (typeof search === 'string' && search.trim()) {
      const terms = search.split(/[,，\s]+/).map((term) => term.trim()).filter(Boolean);
      for (const term of terms) {
        andFilters.push(orderSearchFilter(term, searchField));
      }
    }
    if (deliveryDateStart || deliveryDateEnd) {
      andFilters.push({
        deliveryDate: {
          ...(deliveryDateStart ? { gte: deliveryDateStart } : {}),
          ...(deliveryDateEnd ? { lte: dateUpperBound(deliveryDateEnd, deliveryDateTo) } : {}),
        },
      });
    }
    if (shipDateStart || shipDateEnd) {
      andFilters.push({
        approvalLog: {
          some: {
            action: 'ship',
            createdAt: {
              ...(shipDateStart ? { gte: shipDateStart } : {}),
              ...(shipDateEnd ? { lte: dateUpperBound(shipDateEnd, shipDateTo) } : {}),
            },
          },
        },
      });
    }
    if (andFilters.length > 0) where.AND = andFilters;

    const orderBy: Prisma.OrderOrderByWithRelationInput[] = sort === 'createdAt_desc'
      ? [{ createdAt: 'desc' }, { id: 'desc' }]
      : [{ deliveryDate: 'asc' }, { createdAt: 'desc' }];
    const take = typeof pageSize === 'number' ? pageSize : 50;
    const currentPage = typeof page === 'number' ? page : 1;
    const skip = (currentPage - 1) * take;
    const [total, orders] = await prisma.$transaction([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        orderBy,
        skip,
        take,
        include: ORDER_LIST_INCLUDE,
      }),
    ]);
    const orderIds = orders.map((order) => order.id);
    const [materialTotals, readyMaterialTotals, urgentMaterialTotals] = orderIds.length > 0
      ? await Promise.all([
        prisma.material.groupBy({
          by: ['orderId'],
          where: { orderId: { in: orderIds } },
          _count: { _all: true },
        }),
        prisma.material.groupBy({
          by: ['orderId'],
          where: { orderId: { in: orderIds }, status: 'ready' },
          _count: { _all: true },
        }),
        prisma.material.groupBy({
          by: ['orderId'],
          where: { orderId: { in: orderIds }, urgent: true, status: { not: 'ready' } },
          _count: { _all: true },
        }),
      ])
      : [[], [], []] as const;
    const materialSummaryByOrder = new Map<number, MaterialSummary>();
    for (const orderId of orderIds) {
      const totalCount = materialTotals.find((item) => item.orderId === orderId)?._count._all ?? 0;
      const readyCount = readyMaterialTotals.find((item) => item.orderId === orderId)?._count._all ?? 0;
      const urgentUnreadyCount = urgentMaterialTotals.find((item) => item.orderId === orderId)?._count._all ?? 0;
      materialSummaryByOrder.set(orderId, {
        total: totalCount,
        ready: readyCount,
        unready: totalCount - readyCount,
        urgentUnready: urgentUnreadyCount,
      });
    }
    return res.json({
      data: orders.map((order) => toOrderListSummary(order, materialSummaryByOrder.get(order.id))),
      total,
      page: currentPage,
      pageSize: take,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// Get single order
router.get('/:id', requirePermission(canViewOrders), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const order = await prisma.order.findUnique({ where: { id }, include: ORDER_DETAIL_INCLUDE });
    if (!order) return res.status(404).json({ error: '订单不存在' });
    if (!canSalesAccessOrderByOwner(req.user, order)) {
      return res.status(403).json({ error: '无权查看该订单' });
    }
    res.json(enrichOrder(order));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// Create order — supports both new multi-item mode (items[]) and legacy single-product mode
router.post('/', requirePermission(canCreateOrderForSales), validate('body', createOrderSchema), async (req, res) => {
  try {
    const {
      customerId,
      salespersonId,
      deliveryDate,
      notes,
      contractRef,
      urgent,
      urgentReason,
      items,       // new: array of OrderItem inputs
      // legacy single-product fields (backward compat)
      productId,
      quantity,
      unitPrice,
      totalAmount: legacyTotal,
      materials,
    } = req.body;

    if (!customerId || !deliveryDate) {
      return res.status(400).json({ error: '客户和交期为必填项' });
    }

    let finalProductId: number | null = productId ? parseInt(productId) : null;
    let finalQuantity = parseInt(quantity) || 0;
    let finalUnitPrice = parseFloat(unitPrice) || 0;
    let finalTotalAmount = 0;
    type ItemData = {
      productId?: number;
      productName: string;
      spec: string;
      customerBrand: string;
      quantity: number;
      unitPrice: number;
      subtotal: number;
      remark: string;
      detailRequirement: string;
      sourceRowNo: string;
      unit: string;
      ctnCount?: number;
      qtyPerCtn?: number;
      ctnVolume?: number;
      totalVolume?: number;
      ctnWeight?: number;
      totalWeight?: number;
    };
    let itemsData: ItemData[] = [];

    if (Array.isArray(items) && items.length > 0) {
      // ── Multi-item mode ──
      itemsData = items.map((item: ItemInput) => ({
        productId: item.productId ? parseInt(String(item.productId)) : undefined,
        productName: String(item.productName || ''),
        spec: String(item.spec || ''),
        customerBrand: String(item.customerBrand || ''),
        unit: String(item.unit || '件'),
        quantity: parseInt(String(item.quantity)) || 1,
        unitPrice: parseFloat(String(item.unitPrice)) || 0,
        subtotal: (parseInt(String(item.quantity)) || 1) * (parseFloat(String(item.unitPrice)) || 0),
        remark: String(item.remark || ''),
        detailRequirement: String(item.detailRequirement || ''),
        sourceRowNo: String(item.sourceRowNo || ''),
        ctnCount: optionalInt(item.ctnCount),
        qtyPerCtn: optionalInt(item.qtyPerCtn),
        ctnVolume: optionalNumber(item.ctnVolume),
        totalVolume: optionalNumber(item.totalVolume),
        ctnWeight: optionalNumber(item.ctnWeight),
        totalWeight: optionalNumber(item.totalWeight),
      }));

      finalTotalAmount = itemsData.reduce((s, i) => s + i.subtotal, 0);
      finalQuantity = itemsData.reduce((s, i) => s + (parseInt(String(i.quantity)) || 0), 0);
      finalUnitPrice = parseFloat(String(itemsData[0]?.unitPrice)) || 0;
    } else {
      // ── Legacy single-product mode ──
      if (!productId || !quantity || !unitPrice) {
        return res.status(400).json({ error: '客户、产品、数量、单价、交期为必填项' });
      }
      finalProductId = parseInt(productId);
      finalTotalAmount = parseFloat(legacyTotal) || finalQuantity * finalUnitPrice;
    }

    const order = await withContractNumberRetry(() => prisma.$transaction(async (tx) => {
      if (!req.user) throw new Error('请先登录');
      const contractNo = await generateContractNumber(tx);
      const owner = await resolveOrderSalesperson(tx, req.user, salespersonId);

      const order = await tx.order.create({
        data: {
          contractNo,
          customerId: parseInt(customerId),
          productId: finalProductId,
          quantity: finalQuantity,
          unitPrice: finalUnitPrice,
          totalAmount: finalTotalAmount,
          totalQuantity: finalQuantity,
          itemCount: itemsData.length,
          urgent: boolValue(urgent),
          urgentSource: boolValue(urgent) ? '业务员标记' : '',
          urgentReason: boolValue(urgent) ? urgentReason || '' : '',
          urgentConfirmed: false,
          deliveryDate: new Date(deliveryDate),
          notes: notes || '',
          contractRef: contractRef || '',
          createdBy: req.user.name,
          salespersonId: owner.salespersonId,
          salespersonName: owner.salespersonName,
          status: 'draft',
          materials: !itemsData.length && materials?.length
              ? {
                  create: (materials as Record<string, unknown>[]).map((m) => ({
                    name: String(m.name || ''),
                    spec: String(m.spec || ''),
                    unit: String(m.unit || '个'),
                    required: parseFloat(m.required as string) || 0,
                    status: 'pending',
                  })),
                }
              : undefined,
          approvalLog: {
            create: {
              action: 'contract_generated',
              fromStage: 'draft',
              toStage: 'draft',
              operator: '系统',
              reason: `系统生成合同编号：${contractNo}`,
            },
          },
        },
        include: ORDER_DETAIL_INCLUDE,
      });

      if (itemsData.length === 0) return order;

      await Promise.all(itemsData.map((item) => tx.orderItem.create({
        data: {
          orderId: order.id,
          productId: item.productId ?? null,
          productName: item.productName,
          spec: item.spec,
          customerBrand: item.customerBrand,
          unit: item.unit,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: item.subtotal,
          remark: item.remark,
          detailRequirement: item.detailRequirement,
          sourceRowNo: item.sourceRowNo,
          ctnCount: item.ctnCount,
          qtyPerCtn: item.qtyPerCtn,
          ctnVolume: item.ctnVolume,
          totalVolume: item.totalVolume,
          ctnWeight: item.ctnWeight,
          totalWeight: item.totalWeight,
        },
      })));

      return tx.order.findUniqueOrThrow({ where: { id: order.id }, include: ORDER_DETAIL_INCLUDE });
    }));
    clearDashboardCache();
    res.status(201).json(enrichOrder(order));
  } catch (err) {
    console.error(err);
    if (isContractNumberConflict(err)) {
      return res.status(409).json({ error: '合同编号生成冲突，请重试' });
    }
    if (err instanceof Error && ['请选择订单业务员', '无权指定订单业务员', '业务员ID不合法', '只能指定已启用的业务员账号'].includes(err.message)) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: '服务器错误' });
  }
});

// Workflow action: submit / approve / reject / request_review / advance
router.post('/:id/action', requirePermission(canViewOrders), validate('params', idParamsSchema), validate('body', orderActionSchema), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { action, reason, urgent, urgentReason } = req.body;

    const order = await prisma.order.findUnique({
      where: { id },
      select: { id: true, status: true, prevStatus: true, urgent: true, urgentReason: true, salespersonId: true, salespersonName: true, createdBy: true },
    });
    if (!order) return res.status(404).json({ error: '订单不存在' });
    if (!canSalesAccessOrderByOwner(req.user, order)) {
      return res.status(403).json({ error: '无权操作该订单' });
    }

    const transition = TRANSITIONS[String(action)];
    if (!transition) return res.status(400).json({ error: `未知操作: ${action}` });
    if (!transition.from.includes(order.status)) {
      return res.status(400).json({ error: `当前状态不能执行该操作: ${action}` });
    }
    if (action === 'withdraw' && order.prevStatus) {
      return res.status(400).json({ error: '复审中的订单不能撤回审批' });
    }
    if (!req.user || !transition.check(req.user)) {
      return res.status(403).json({ error: '无权执行该流程操作' });
    }

    const newStatus = transition.to;
    const fromStage = order.status;
    const operatorName = req.user?.name || '系统';
    const prevStatus = action === 'request_review' ? order.status : order.prevStatus;
    const urgentDecision = action === 'approve' && urgent !== undefined ? boolValue(urgent) : undefined;
    const progressPct = action === 'queue_production'
      ? 0
      : action === 'start_production'
        ? 0
        : action === 'finish_production'
          ? 100
          : action === 'reject_ship'
            ? 90
            : undefined;

    const updated = await prisma.order.update({
      where: { id },
      data: {
        status: newStatus,
        prevStatus,
        progressPct,
        urgent: urgentDecision !== undefined ? urgentDecision : undefined,
        urgentSource: urgentDecision === true
          ? (order.urgent ? '经理层确认' : '经理层标记')
          : urgentDecision === false
            ? ''
            : undefined,
        urgentReason: urgentDecision === true
          ? urgentReason || order.urgentReason || ''
          : urgentDecision === false
            ? ''
            : undefined,
        urgentConfirmed: urgentDecision !== undefined ? urgentDecision : undefined,
        purchaserName: action === 'queue_production' && req.user?.role === 'purchase' ? operatorName : undefined,
        updatedAt: new Date(),
        approvalLog: {
          create: {
            action,
            fromStage,
            toStage: newStatus,
            operator: operatorName,
            reason: reason || '',
          },
        },
      },
      include: ORDER_DETAIL_INCLUDE,
    });
    clearDashboardCache();
    res.json(enrichOrder(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// Update production progress for orders that are currently in production.
router.patch('/:id/progress', requirePermission(canHandleProduction), validate('params', idParamsSchema), validate('body', orderProgressSchema), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { progressPct } = req.body;

    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) return res.status(404).json({ error: '订单不存在' });
    if (order.status !== 'production') {
      return res.status(400).json({ error: '只有生产中的订单可以更新生产进度' });
    }

    const updated = await prisma.order.update({
      where: { id },
      data: {
        progressPct,
        updatedAt: new Date(),
      },
      include: ORDER_DETAIL_INCLUDE,
    });
    clearDashboardCache();
    res.json(enrichOrder(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// Update order (draft only) — supports updating items[]
router.put('/:id', requirePermission(canCreateOrderForSales), validate('params', idParamsSchema), validate('body', updateOrderSchema), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const order = await prisma.order.findUnique({
      where: { id },
      select: { id: true, status: true, salespersonId: true, salespersonName: true, createdBy: true },
    });
    if (!order) return res.status(404).json({ error: '订单不存在' });
    if (!canSalesAccessOrderByOwner(req.user, order)) {
      return res.status(403).json({ error: '无权编辑该订单' });
    }
    if (order.status !== 'draft') {
      return res.status(400).json({ error: '只有草稿状态的订单可以编辑' });
    }

    const { deliveryDate, notes, urgent, urgentReason, items, quantity, unitPrice, totalAmount } = req.body;
    const urgentUpdate = urgent !== undefined ? boolValue(urgent) : undefined;

    const baseUpdateData: Record<string, unknown> = {
      updatedAt: new Date(),
      deliveryDate: deliveryDate ? new Date(deliveryDate) : undefined,
      notes: notes !== undefined ? notes : undefined,
      urgent: urgentUpdate,
      urgentSource: urgentUpdate === true ? '业务员标记' : urgentUpdate === false ? '' : undefined,
      urgentReason: urgentUpdate === true ? urgentReason || '' : urgentUpdate === false ? '' : undefined,
      urgentConfirmed: urgentUpdate !== undefined ? false : undefined,
    };

    if (Array.isArray(items) && items.length > 0) {
      const itemsData = items.map((item: ItemInput) => ({
        productId: item.productId ? parseInt(String(item.productId)) : undefined,
        productName: String(item.productName || ''),
        spec: String(item.spec || ''),
        customerBrand: String(item.customerBrand || ''),
        unit: String(item.unit || '件'),
        quantity: parseInt(String(item.quantity)) || 1,
        unitPrice: parseFloat(String(item.unitPrice)) || 0,
        subtotal: (parseInt(String(item.quantity)) || 1) * (parseFloat(String(item.unitPrice)) || 0),
        remark: String(item.remark || ''),
        detailRequirement: String(item.detailRequirement || ''),
        sourceRowNo: String(item.sourceRowNo || ''),
        ctnCount: optionalInt(item.ctnCount),
        qtyPerCtn: optionalInt(item.qtyPerCtn),
        ctnVolume: optionalNumber(item.ctnVolume),
        totalVolume: optionalNumber(item.totalVolume),
        ctnWeight: optionalNumber(item.ctnWeight),
        totalWeight: optionalNumber(item.totalWeight),
      }));
      const newTotal = itemsData.reduce((s, i) => s + i.subtotal, 0);
      const newQty = itemsData.reduce((s, i) => s + i.quantity, 0);

      const updated = await prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id },
          data: {
            ...baseUpdateData,
            totalAmount: newTotal,
            totalQuantity: newQty,
            itemCount: itemsData.length,
            quantity: newQty,
            unitPrice: itemsData[0]?.unitPrice || 0,
            orderItems: {
              deleteMany: {},
            },
          },
        });

        await Promise.all(itemsData.map((item) => tx.orderItem.create({
          data: {
            orderId: id,
            productId: item.productId ?? null,
            productName: item.productName,
            spec: item.spec,
            customerBrand: item.customerBrand,
            unit: item.unit,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotal: item.subtotal,
            remark: item.remark,
            detailRequirement: item.detailRequirement,
            sourceRowNo: item.sourceRowNo,
            ctnCount: item.ctnCount,
            qtyPerCtn: item.qtyPerCtn,
            ctnVolume: item.ctnVolume,
            totalVolume: item.totalVolume,
            ctnWeight: item.ctnWeight,
            totalWeight: item.totalWeight,
          },
        })));

        return tx.order.findUniqueOrThrow({ where: { id }, include: ORDER_DETAIL_INCLUDE });
      });
      clearDashboardCache();
      return res.json(enrichOrder(updated));
    } else {
      // Legacy field update
      const updated = await prisma.order.update({
        where: { id },
        data: {
          ...baseUpdateData,
          quantity: quantity !== undefined ? parseInt(quantity) : undefined,
          unitPrice: unitPrice !== undefined ? parseFloat(unitPrice) : undefined,
          totalAmount: totalAmount !== undefined ? parseFloat(totalAmount) : undefined,
        },
        include: ORDER_DETAIL_INCLUDE,
      });
      clearDashboardCache();
      return res.json(enrichOrder(updated));
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.delete('/:id', requirePermission(canCreateOrderForSales), validate('params', idParamsSchema), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const order = await prisma.order.findUnique({
      where: { id },
      select: { id: true, status: true, prevStatus: true, salespersonId: true, salespersonName: true, createdBy: true },
    });
    if (!order) return res.status(404).json({ error: '订单不存在' });
    if (!canSalesAccessOrderByOwner(req.user, order)) {
      return res.status(403).json({ error: '无权删除该订单' });
    }
    if (!['draft', 'pending_approval'].includes(order.status)) {
      return res.status(400).json({ error: '只有草稿或等待审批中的订单可以删除' });
    }
    if (order.status === 'pending_approval' && order.prevStatus) {
      return res.status(400).json({ error: '复审中的订单不能删除' });
    }

    await prisma.order.delete({ where: { id } });
    clearDashboardCache();
    res.json({ message: '订单已删除' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 采购侧：按订单明细的 detailRequirement 文本解析出物料候选；
// 仅返回 JSON 数组，不写入数据库；采购员审核 / 编辑后再手动调用 POST /api/materials 录入。
router.post(
  '/:id/parse-requirements',
  requirePermission((user) => canHandleProcurement(user) || canHandleProduction(user)),
  validate('params', idParamsSchema),
  async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const order = await prisma.order.findUnique({
        where: { id },
        include: { orderItems: true },
      });
      if (!order) return res.status(404).json({ error: '订单不存在' });

      const candidates = buildProductionPlanMaterials(
        order.orderItems.map((item) => ({
          id: item.id,
          productName: item.productName,
          quantity: item.quantity,
          detailRequirement: item.detailRequirement || '',
        })),
      );

      res.json({
        candidates: candidates.map((c) => ({
          orderItemId: c.orderItemId,
          name: c.name,
          spec: c.spec,
          unit: c.unit,
          required: c.required,
          notes: c.notes || '',
        })),
      });
    } catch (err) {
      console.error('解析详细要求失败:', err);
      res.status(500).json({ error: '解析详细要求失败' });
    }
  },
);

export default router;
