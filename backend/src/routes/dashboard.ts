import { Router } from 'express';
import { prisma } from '../prisma';
import { requirePermission } from '../middleware/authorize';
import { dashboardCacheKey, getDashboardCache, setDashboardCache } from '../lib/dashboardCache';

const router = Router();

router.use(requirePermission((user) => user.isAdmin || user.canApproveOrder || user.canManageUsers || user.isClerk));

const RISK_ORDER_CANDIDATE_LIMIT = 100;
const RISK_ORDER_RESULT_LIMIT = 50;

type MonthlyAggregateRow = {
  month: Date;
  revenue: number | null;
  count: bigint | number | string;
};

type SalesAggregateRow = {
  salesKey: string;
  name: string;
  amount: number | null;
  count: bigint | number | string;
};

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function numberFromDb(value: number | bigint | string | null | undefined) {
  const numeric = typeof value === 'bigint' || typeof value === 'string'
    ? Number(value)
    : value;
  return typeof numeric === 'number' && Number.isFinite(numeric) ? numeric : 0;
}

router.get('/', async (req, res) => {
  try {
    const cacheKey = dashboardCacheKey();
    const cached = getDashboardCache(cacheKey);
    res.setHeader('Cache-Control', 'no-store');
    if (cached) {
      res.setHeader('X-Dashboard-Cache', 'HIT');
      return res.json(cached);
    }
    res.setHeader('X-Dashboard-Cache', 'MISS');

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonthStart = new Date(currentYear, now.getMonth(), 1);
    const nextMonthStart = new Date(currentYear, now.getMonth() + 1, 1);
    const yearStart = new Date(currentYear, 0, 1);
    const nextYearStart = new Date(currentYear + 1, 0, 1);
    const prevYearStart = new Date(currentYear - 1, 0, 1);
    const prevMonthStart = new Date(currentYear, now.getMonth() - 1, 1);
    const last30DaysStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixMonthsAgo = new Date(currentYear, now.getMonth() - 5, 1);

    const [
      totalOrders,
      pendingApproval,
      inProduction,
      readyShip,
      totalRevenue,
      currentMonthStats,
      previousMonthStats,
      currentYearStats,
      previousYearStats,
      currentYearMonthlyRows,
      currentMonthSalesStats,
      previousMonthSalesStats,
      pipelineStats,
      pipelineLast30DaysStats,
      pipelineCurrentMonthStats,
      recentOrders,
      riskOrders,
      recentMonthlyRows,
    ] = await Promise.all([
      // KPI counts
      prisma.order.count(),
      prisma.order.count({ where: { status: 'pending_approval' } }),
      prisma.order.count({ where: { status: 'production' } }),
      prisma.order.count({ where: { status: 'ready_ship' } }),

      // Total revenue (shipped + ready_ship)
      prisma.order.aggregate({
        _sum: { totalAmount: true },
        where: { status: { in: ['shipped', 'ready_ship', 'production', 'pending_production', 'procurement'] } },
      }),
      prisma.order.aggregate({
        _sum: { totalAmount: true },
        _count: { _all: true },
        where: { createdAt: { gte: currentMonthStart, lt: nextMonthStart } },
      }),
      prisma.order.aggregate({
        _sum: { totalAmount: true },
        _count: { _all: true },
        where: { createdAt: { gte: prevMonthStart, lt: currentMonthStart } },
      }),
      prisma.order.aggregate({
        _sum: { totalAmount: true },
        _count: { _all: true },
        where: { createdAt: { gte: yearStart, lt: nextYearStart } },
      }),
      prisma.order.aggregate({
        _sum: { totalAmount: true },
        _count: { _all: true },
        where: { createdAt: { gte: prevYearStart, lt: yearStart } },
      }),
      prisma.$queryRaw<MonthlyAggregateRow[]>`
        SELECT
          date_trunc('month', "createdAt") AS month,
          COALESCE(SUM("totalAmount"), 0) AS revenue,
          COUNT(*) AS count
        FROM "Order"
        WHERE "createdAt" >= ${yearStart}
          AND "createdAt" < ${nextYearStart}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      prisma.$queryRaw<SalesAggregateRow[]>`
        SELECT
          COALESCE('id:' || o."salespersonId"::text, 'name:' || NULLIF(o."salespersonName", ''), 'name:' || NULLIF(o."createdBy", ''), 'unassigned') AS "salesKey",
          COALESCE(u."name", NULLIF(o."salespersonName", ''), NULLIF(o."createdBy", ''), '未分配') AS name,
          COALESCE(SUM(o."totalAmount"), 0) AS amount,
          COUNT(*) AS count
        FROM "Order" o
        LEFT JOIN "User" u ON u."id" = o."salespersonId"
        WHERE o."createdAt" >= ${currentMonthStart}
          AND o."createdAt" < ${nextMonthStart}
        GROUP BY 1, 2
      `,
      prisma.$queryRaw<SalesAggregateRow[]>`
        SELECT
          COALESCE('id:' || o."salespersonId"::text, 'name:' || NULLIF(o."salespersonName", ''), 'name:' || NULLIF(o."createdBy", ''), 'unassigned') AS "salesKey",
          COALESCE(u."name", NULLIF(o."salespersonName", ''), NULLIF(o."createdBy", ''), '未分配') AS name,
          COALESCE(SUM(o."totalAmount"), 0) AS amount,
          COUNT(*) AS count
        FROM "Order" o
        LEFT JOIN "User" u ON u."id" = o."salespersonId"
        WHERE o."createdAt" >= ${prevMonthStart}
          AND o."createdAt" < ${currentMonthStart}
        GROUP BY 1, 2
      `,
      prisma.order.groupBy({
        by: ['status'],
        where: { status: { not: 'draft' } },
        _count: { _all: true },
      }),
      prisma.order.groupBy({
        by: ['status'],
        where: {
          status: { not: 'draft' },
          createdAt: { gte: last30DaysStart, lte: now },
        },
        _count: { _all: true },
      }),
      prisma.order.groupBy({
        by: ['status'],
        where: {
          status: { not: 'draft' },
          createdAt: { gte: currentMonthStart, lt: nextMonthStart },
        },
        _count: { _all: true },
      }),

      // Recent 10 orders
      prisma.order.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { name: true } },
          product: { select: { name: true, code: true } },
          orderItems: true,
        },
      }),

      // Keep the dashboard bounded by checking the earliest-due active orders first.
      prisma.order.findMany({
        where: {
          status: { notIn: ['shipped', 'draft'] },
        },
        take: RISK_ORDER_CANDIDATE_LIMIT,
        orderBy: [
          { deliveryDate: 'asc' },
          { createdAt: 'desc' },
        ],
        include: {
          customer: { select: { name: true } },
          product: { select: { name: true } },
          orderItems: true,
          _count: {
            select: {
              materials: { where: { status: { not: 'ready' } } },
            },
          },
        },
      }),
      prisma.$queryRaw<MonthlyAggregateRow[]>`
        SELECT
          date_trunc('month', "createdAt") AS month,
          COALESCE(SUM("totalAmount"), 0) AS revenue,
          COUNT(*) AS count
        FROM "Order"
        WHERE "createdAt" >= ${sixMonthsAgo}
          AND "status" <> 'draft'
        GROUP BY 1
        ORDER BY 1 ASC
      `,
    ]);

    const [urgentMaterialCounts, allSalesUsers] = await Promise.all([
      riskOrders.length > 0
        ? prisma.material.groupBy({
          by: ['orderId'],
          where: {
            orderId: { in: riskOrders.map((order) => order.id) },
            urgent: true,
            status: { not: 'ready' },
          },
          _count: { _all: true },
        })
        : Promise.resolve([]),
      // All enabled sales-role users, so zero-order reps still appear in ranking
      prisma.user.findMany({
        where: { status: 'enabled', role: 'sales' },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    const urgentMaterialCountByOrder = new Map(
      urgentMaterialCounts.map((item) => [item.orderId, item._count._all]),
    );

    const currentYearMonthlyMap = new Map(
      currentYearMonthlyRows.map((row) => [
        monthKey(row.month),
        { revenue: numberFromDb(row.revenue), count: numberFromDb(row.count) },
      ]),
    );

    const annualMonthlyStats = Array.from({ length: 12 }, (_, index) => {
      const key = `${currentYear}-${String(index + 1).padStart(2, '0')}`;
      return {
        month: `${index + 1}月`,
        key,
        ...(currentYearMonthlyMap.get(key) || { revenue: 0, count: 0 }),
      };
    });

    const previousSalesMap = new Map(
      previousMonthSalesStats.map((item) => [item.salesKey, numberFromDb(item.amount)]),
    );
    const activeKeys = new Set(currentMonthSalesStats.map((item) => item.salesKey));
    const zeroOrderEntries = allSalesUsers
      .filter((u) => !activeKeys.has(`id:${u.id}`))
      .map((u) => ({
        name: u.name,
        amount: 0,
        count: 0,
        prevAmount: previousSalesMap.get(`id:${u.id}`) || 0,
        diff: null as number | null,
      }));
    const salesRanking = [
      ...currentMonthSalesStats.map((item) => {
        const amount = numberFromDb(item.amount);
        const prevAmount = previousSalesMap.get(item.salesKey) || 0;
        return {
          name: item.name,
          amount,
          count: numberFromDb(item.count),
          prevAmount,
          diff: prevAmount > 0 ? Math.round(((amount - prevAmount) / prevAmount) * 100) : null,
        };
      }),
      ...zeroOrderEntries,
    ].sort((a, b) => b.amount - a.amount);

    const pipelineCounts = Object.fromEntries(pipelineStats.map((item) => [item.status, item._count._all]));
    const pipelineCountsByRange = {
      last30Days: Object.fromEntries(pipelineLast30DaysStats.map((item) => [item.status, item._count._all])),
      currentMonth: Object.fromEntries(pipelineCurrentMonthStats.map((item) => [item.status, item._count._all])),
    };

    // Classify risk orders
    const risks = riskOrders.map((o) => {
      const reasons: string[] = [];
      const daysLeft = Math.ceil((o.deliveryDate.getTime() - now.getTime()) / 86400000);

      if (daysLeft < 0) reasons.push('已逾期');
      else if (daysLeft <= 5) reasons.push(`仅剩${daysLeft}天`);

      const unreadyMaterialsCount = o._count.materials;
      const urgentMaterialsCount = urgentMaterialCountByOrder.get(o.id) || 0;
      if (urgentMaterialsCount > 0) {
        reasons.push(`${urgentMaterialsCount}项缺料风险`);
      }
      if (
        ['pending_production', 'production', 'ready_ship'].includes(o.status) &&
        unreadyMaterialsCount > 0
      )
        reasons.push('备料未齐仍排产');

      const { _count, ...order } = o;
      return { ...order, daysLeft, riskReasons: reasons };
    }).filter((o) => o.riskReasons.length > 0).slice(0, RISK_ORDER_RESULT_LIMIT);

    // Monthly revenue (last 6 months)
    const monthlyMap: Record<string, { revenue: number; count: number }> = {};
    for (let i = 0; i < 6; i++) {
      const d = new Date(now);
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyMap[key] = { revenue: 0, count: 0 };
    }
    for (const row of recentMonthlyRows) {
      const key = monthKey(row.month);
      if (monthlyMap[key]) {
        // SQL groups by month, so each key is assigned once rather than accumulated.
        monthlyMap[key].revenue = numberFromDb(row.revenue);
        monthlyMap[key].count = numberFromDb(row.count);
      }
    }

    const dashboardData = {
      kpis: {
        totalOrders,
        pendingApproval,
        inProduction,
        readyShip,
        totalRevenue: totalRevenue._sum.totalAmount || 0,
      },
      performance: {
        currentMonth: {
          amount: currentMonthStats._sum.totalAmount || 0,
          count: currentMonthStats._count._all,
        },
        previousMonth: {
          amount: previousMonthStats._sum.totalAmount || 0,
          count: previousMonthStats._count._all,
        },
        currentYear: {
          amount: currentYearStats._sum.totalAmount || 0,
          count: currentYearStats._count._all,
        },
        previousYear: {
          amount: previousYearStats._sum.totalAmount || 0,
          count: previousYearStats._count._all,
        },
        annualMonthlyStats,
        salesRanking,
        pipelineCounts,
        pipelineCountsByRange,
      },
      recentOrders,
      riskOrders: risks,
      monthlyStats: Object.entries(monthlyMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, data]) => ({ month, ...data })),
    };

    setDashboardCache(cacheKey, dashboardData);
    res.json(dashboardData);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

export default router;
