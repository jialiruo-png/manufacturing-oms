import { Router } from 'express';
import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { requirePermission } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { startDateForRange } from '../lib/dateRange';
import { canCreateOrderForSales, canViewCustomers } from '../lib/userPermissions';
import { commLogSchema, customerSchema, idParamsSchema, updateCustomerSchema } from '../validation/schemas';

const router = Router();

function firstQueryString(value: unknown) {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : '';
  return typeof value === 'string' ? value : '';
}

export function publicCustomerSearchSelectForTest() {
  return {
    id: true,
    name: true,
    contact: true,
    phone: true,
  } satisfies Prisma.CustomerSelect;
}

function customerBaseSelect() {
  return {
    ...publicCustomerSearchSelectForTest(),
    email: true,
    address: true,
    rating: true,
    notes: true,
    salespersonId: true,
    salespersonName: true,
    createdAt: true,
  } satisfies Prisma.CustomerSelect;
}

function salesCustomerWhere(req: Request) {
  if (req.user?.role !== 'sales' || req.user.isAdmin) return {};
  return { salespersonId: req.user.userId };
}

function canSalesAccessCustomer(req: Request, customer: { salespersonId: number | null }) {
  if (req.user?.isAdmin) return true;
  if (req.user?.isClerk || req.user?.canCreateOrderForSales) return true;
  if (req.user?.role !== 'sales') return true;
  return customer.salespersonId === req.user.userId;
}

function baseCustomerSearchWhere(query: string): Prisma.CustomerWhereInput {
  return {
    OR: [
      { name: { contains: query, mode: 'insensitive' } },
      { contact: { contains: query, mode: 'insensitive' } },
      { phone: { contains: query, mode: 'insensitive' } },
    ],
  };
}

export function relatedOrderOwnerWhereForTest(req: Pick<Request, 'user'>): Prisma.OrderWhereInput {
  if (req.user?.role !== 'sales' || req.user.isAdmin) return {};
  return {
    OR: [
      { salespersonId: req.user.userId },
      {
        salespersonId: null,
        OR: [
          { salespersonName: req.user.name },
          { createdBy: req.user.name },
        ],
      },
    ],
  };
}

async function resolveCustomerOwner(req: Request, salespersonId: unknown, salespersonName: unknown) {
  if (req.user?.role === 'sales' && !req.user.isAdmin) {
    return { salespersonId: req.user.userId, salespersonName: req.user.name };
  }

  const requestedName = String(salespersonName || '').trim();
  const requestedId = salespersonId !== undefined && salespersonId !== null && String(salespersonId).trim() !== ''
    ? Number(salespersonId)
    : null;

  if (requestedId !== null) {
    if (!Number.isInteger(requestedId)) {
      return { error: '业务员ID不合法' };
    }
    const owner = await prisma.user.findFirst({
      where: { id: requestedId, role: 'sales', status: 'enabled', deletedAt: null },
      select: { id: true, name: true },
    });
    if (!owner) return { error: '只能分配给已启用的业务员账号' };
    return { salespersonId: owner.id, salespersonName: owner.name };
  }

  if (requestedName) {
    const owners = await prisma.user.findMany({
      where: { name: requestedName, role: 'sales', status: 'enabled', deletedAt: null },
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    });
    if (owners.length === 0) return { error: '只能分配给已启用的业务员账号' };
    if (owners.length > 1) return { error: '业务员姓名重名，请使用业务员ID分配' };
    return { salespersonId: owners[0].id, salespersonName: owners[0].name };
  }

  return {
    salespersonId: null,
    salespersonName: req.user?.name || '业务员',
  };
}

// List customers
router.get('/', requirePermission(canViewCustomers), async (req, res) => {
  try {
    const { salespersonId, salespersonName, salesperson, salesName, createdBy, communicatedWithin } = req.query;
    const communicatedStart = startDateForRange(communicatedWithin);
    if (communicatedStart === undefined) {
      return res.status(400).json({ error: '沟通时间范围参数不合法' });
    }

    const ownerName = firstQueryString(salespersonName || salesperson || salesName || createdBy);
    const where: Prisma.CustomerWhereInput = { ...salesCustomerWhere(req) };
    if (req.user?.role === 'sales' && !req.user.isAdmin) {
      // Server-side ownership is already applied by salesCustomerWhere.
    } else {
      if (salespersonId) where.salespersonId = parseInt(salespersonId as string);
      if (ownerName) where.salespersonName = ownerName;
    }
    if (communicatedStart) {
      where.commLogs = {
        some: {
          createdAt: { gte: communicatedStart },
          ...(req.user?.role === 'sales' && !req.user.isAdmin ? { createdBy: req.user.name } : {}),
        },
      };
    }

    const customers = await prisma.customer.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { orders: true, commLogs: true } },
      },
    });
    res.json(customers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.get('/recent', requirePermission(canViewCustomers), async (req, res) => {
  try {
    const where: Prisma.CustomerWhereInput = req.user?.role === 'sales' && !req.user.isAdmin
      ? {
          orders: { some: relatedOrderOwnerWhereForTest(req) },
        }
      : {};
    const customers = await prisma.customer.findMany({
      where,
      take: 20,
      orderBy: { updatedAt: 'desc' },
      select: customerBaseSelect(),
    });
    res.json(customers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.get('/search', requirePermission(canViewCustomers), async (req, res) => {
  try {
    const q = firstQueryString(req.query.q).trim();
    if (q.length < 2) return res.json([]);

    const customers = await prisma.customer.findMany({
      where: baseCustomerSearchWhere(q),
      take: 20,
      orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
      select: publicCustomerSearchSelectForTest(),
    });
    res.json(customers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// Get single customer with orders and logs
router.get('/:id', requirePermission(canViewCustomers), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        _count: { select: { orders: true, commLogs: true } },
        orders: {
          take: 50,
          orderBy: { createdAt: 'desc' },
          include: { product: { select: { name: true, code: true } } },
        },
        commLogs: {
          take: 50,
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!customer) return res.status(404).json({ error: '客户不存在' });
    if (!canSalesAccessCustomer(req, customer)) {
      return res.status(403).json({ error: '无权查看该客户' });
    }
    res.json(customer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// Create customer
router.post('/', requirePermission(canCreateOrderForSales), validate('body', customerSchema), async (req, res) => {
  try {
    const { name, contact, phone, email, address, rating, notes, salespersonId, salespersonName } = req.body;
    if (!name) {
      return res.status(400).json({ error: '客户名称为必填项' });
    }
    const owner = await resolveCustomerOwner(req, salespersonId, salespersonName);
    if ('error' in owner) return res.status(400).json({ error: owner.error });
    const customer = await prisma.customer.create({
      data: {
        name,
        contact: contact || '',
        phone: phone || '',
        email: email || '',
        address: address || '',
        rating: rating || 'B',
        notes: notes || '',
        salespersonId: owner.salespersonId,
        salespersonName: owner.salespersonName,
      },
    });
    res.status(201).json(customer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// Update customer
router.put('/:id', requirePermission(canCreateOrderForSales), validate('params', idParamsSchema), validate('body', updateCustomerSchema), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, contact, phone, email, address, rating, notes, salespersonId, salespersonName } = req.body;
    const existing = await prisma.customer.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: '客户不存在' });
    if (!canSalesAccessCustomer(req, existing)) {
      return res.status(403).json({ error: '无权编辑该客户' });
    }
    const owner = (req.user?.role === 'sales' && !req.user.isAdmin) || salespersonId !== undefined || salespersonName !== undefined
      ? await resolveCustomerOwner(req, salespersonId, salespersonName)
      : null;
    if (owner && 'error' in owner) return res.status(400).json({ error: owner.error });

    const customer = await prisma.customer.update({
      where: { id },
      data: {
        name,
        contact,
        phone,
        email,
        address,
        rating,
        notes,
        salespersonId: owner ? owner.salespersonId : undefined,
        salespersonName: owner ? owner.salespersonName : undefined,
      },
    });
    res.json(customer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// Delete customer. Existing orders keep customer history intact, so customers with orders cannot be deleted.
router.delete('/:id', requirePermission(canCreateOrderForSales), validate('params', idParamsSchema), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await prisma.customer.findUnique({
      where: { id },
      include: { _count: { select: { orders: true } } },
    });
    if (!existing) return res.status(404).json({ error: '客户不存在' });
    if (!canSalesAccessCustomer(req, existing)) {
      return res.status(403).json({ error: '无权删除该客户' });
    }
    if (existing._count.orders > 0) {
      return res.status(400).json({ error: '该客户已有订单记录，不能删除' });
    }

    await prisma.$transaction([
      prisma.commLog.deleteMany({ where: { customerId: id } }),
      prisma.customer.delete({ where: { id } }),
    ]);
    res.json({ message: '客户已删除' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// Add communication log
router.post('/:id/logs', requirePermission(canCreateOrderForSales), validate('params', idParamsSchema), validate('body', commLogSchema), async (req, res) => {
  try {
    const customerId = parseInt(req.params.id);
    const { type, outcome, content } = req.body;
    if (!type || !outcome || !content) {
      return res.status(400).json({ error: '沟通类型、结果、内容为必填项' });
    }
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) return res.status(404).json({ error: '客户不存在' });
    if (!canSalesAccessCustomer(req, customer)) {
      return res.status(403).json({ error: '无权维护该客户' });
    }
    const log = await prisma.commLog.create({
      data: { customerId, type, outcome, content, createdBy: req.user?.name || '系统' },
    });
    res.status(201).json(log);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

export default router;
