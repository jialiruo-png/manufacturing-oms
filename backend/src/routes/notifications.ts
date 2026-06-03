import { Router } from 'express';
import { prisma } from '../prisma';
import { salesOrderWhere } from '../lib/salesAccess';

const router = Router();

type NotificationTarget = 'dashboard' | 'sales' | 'gm' | 'procurement' | 'production' | 'logistics' | 'user-review';

type NotificationItem = {
  id: string;
  title: string;
  content: string;
  count: number;
  target: NotificationTarget;
  level: 'info' | 'warning' | 'urgent';
};

function makeItem(item: NotificationItem): NotificationItem | null {
  return item.count > 0 ? item : null;
}

function compact(items: Array<NotificationItem | null>) {
  return items.filter((item): item is NotificationItem => Boolean(item));
}

async function salesNotifications(user: Express.Request['user']) {
  const where = salesOrderWhere(user);
  const [statusCounts, rejectedDrafts] = await Promise.all([
    prisma.order.groupBy({
      by: ['status'],
      where: { ...where, status: { in: ['draft', 'pending_approval'] } },
      _count: { _all: true },
    }),
    prisma.order.count({
      where: {
        ...where,
        status: 'draft',
        approvalLog: { some: { action: { contains: 'reject' } } },
      },
    }),
  ]);
  const countByStatus = Object.fromEntries(statusCounts.map((item) => [item.status, item._count._all]));
  const drafts = countByStatus.draft || 0;
  const pendingApproval = countByStatus.pending_approval || 0;

  return compact([
    makeItem({
      id: 'sales-rejected-drafts',
      title: '被退回订单',
      content: `有 ${rejectedDrafts} 个订单被退回，请修改后重新提交审批`,
      count: rejectedDrafts,
      target: 'sales',
      level: 'warning',
    }),
    makeItem({
      id: 'sales-drafts',
      title: '草稿订单',
      content: `有 ${drafts} 个草稿订单尚未提交审批`,
      count: drafts,
      target: 'sales',
      level: 'info',
    }),
    makeItem({
      id: 'sales-pending-approval',
      title: '待审批订单',
      content: `有 ${pendingApproval} 个订单正在等待经理层审批`,
      count: pendingApproval,
      target: 'sales',
      level: 'info',
    }),
  ]);
}

async function approvalNotifications() {
  const now = new Date();
  const in5Days = new Date(now.getTime() + 5 * 86400000);
  const [pendingApproval, riskOrders] = await Promise.all([
    prisma.order.count({ where: { status: 'pending_approval' } }),
    prisma.order.count({
      where: {
        status: { notIn: ['draft', 'shipped'] },
        deliveryDate: { lte: in5Days },
      },
    }),
  ]);

  return compact([
    makeItem({
      id: 'manager-pending-approval',
      title: '等待审批中',
      content: `有 ${pendingApproval} 个订单等待审批`,
      count: pendingApproval,
      target: 'gm',
      level: 'warning',
    }),
    makeItem({
      id: 'manager-risk-orders',
      title: '风险订单',
      content: `有 ${riskOrders} 个订单交期临近或已逾期`,
      count: riskOrders,
      target: 'dashboard',
      level: 'urgent',
    }),
  ]);
}

// 发货审批通知：仅推送给经理层-内勤跟单 / 管理员，不打扰其他经理层
async function shipApprovalNotifications() {
  const pendingShipApproval = await prisma.order.count({ where: { status: 'pending_ship_approval' } });
  return compact([
    makeItem({
      id: 'manager-pending-ship-approval',
      title: '待发货审批',
      content: `有 ${pendingShipApproval} 个订单等待发货审批`,
      count: pendingShipApproval,
      target: 'gm',
      level: 'warning',
    }),
  ]);
}

async function userReviewNotifications() {
  const [pendingUsers, passwordResetRequests] = await Promise.all([
    prisma.user.count({ where: { status: 'pending', deletedAt: null } }),
    prisma.passwordResetRequest.count({ where: { status: 'pending' } }),
  ]);

  return compact([
    makeItem({
      id: 'manager-pending-users',
      title: '待审核用户',
      content: `有 ${pendingUsers} 个用户注册申请待审核`,
      count: pendingUsers,
      target: 'user-review',
      level: 'info',
    }),
    makeItem({
      id: 'manager-password-reset-requests',
      title: '密码重置申请',
      content: `有 ${passwordResetRequests} 个用户申请重置密码`,
      count: passwordResetRequests,
      target: 'user-review',
      level: 'warning',
    }),
  ]);
}

async function purchaseNotifications() {
  const [procurementOrders, materialShortage, shortageRiskOrders, urgentOrders] = await Promise.all([
    prisma.order.count({ where: { status: 'procurement' } }),
    prisma.order.count({
      where: {
        status: 'procurement',
        materials: { some: { status: { not: 'ready' } } },
      },
    }),
    prisma.order.count({
      where: {
        status: 'procurement',
        materials: { some: { urgent: true, status: { not: 'ready' } } },
      },
    }),
    prisma.order.count({ where: { status: 'procurement', urgent: true } }),
  ]);

  return compact([
    makeItem({
      id: 'purchase-urgent-orders',
      title: '加急订单',
      content: `加急订单已进入采购阶段，请优先处理`,
      count: urgentOrders,
      target: 'procurement',
      level: 'urgent',
    }),
    makeItem({
      id: 'purchase-procurement-orders',
      title: '待备料订单',
      content: `有 ${procurementOrders} 个订单等待备料处理`,
      count: procurementOrders,
      target: 'procurement',
      level: 'info',
    }),
    makeItem({
      id: 'purchase-shortage-orders',
      title: '缺料订单',
      content: `有 ${materialShortage} 个订单存在未齐物料`,
      count: materialShortage,
      target: 'procurement',
      level: 'warning',
    }),
    makeItem({
      id: 'purchase-shortage-risk',
      title: '缺料风险',
      content: `有 ${shortageRiskOrders} 个订单存在缺料风险，需要关注交期影响`,
      count: shortageRiskOrders,
      target: 'procurement',
      level: 'urgent',
    }),
  ]);
}

async function productionNotifications() {
  const [pendingProductionOrders, productionOrders, overdueOrders, reviewOrders, urgentOrders] = await Promise.all([
    prisma.order.count({ where: { status: 'pending_production' } }),
    prisma.order.count({ where: { status: 'production' } }),
    prisma.order.count({ where: { status: 'production', deliveryDate: { lt: new Date() } } }),
    prisma.order.count({ where: { status: 'pending_approval', prevStatus: 'production' } }),
    prisma.order.count({ where: { status: { in: ['pending_production', 'production'] }, urgent: true } }),
  ]);

  return compact([
    makeItem({
      id: 'production-urgent-orders',
      title: '加急订单',
      content: `加急订单已进入生产环节，请优先排产`,
      count: urgentOrders,
      target: 'production',
      level: 'urgent',
    }),
    makeItem({
      id: 'production-pending-orders',
      title: '待排产订单',
      content: `有 ${pendingProductionOrders} 个订单已物料备齐，等待开始生产`,
      count: pendingProductionOrders,
      target: 'production',
      level: 'info',
    }),
    makeItem({
      id: 'production-orders',
      title: '在产订单',
      content: `有 ${productionOrders} 个订单正在生产中`,
      count: productionOrders,
      target: 'production',
      level: 'info',
    }),
    makeItem({
      id: 'production-overdue-orders',
      title: '延期生产订单',
      content: `有 ${overdueOrders} 个生产订单已超过交期`,
      count: overdueOrders,
      target: 'production',
      level: 'urgent',
    }),
    makeItem({
      id: 'production-review-orders',
      title: '待复审订单',
      content: `有 ${reviewOrders} 个生产退回订单等待经理层复审`,
      count: reviewOrders,
      target: 'production',
      level: 'warning',
    }),
  ]);
}

async function logisticsNotifications() {
  const now = new Date();
  const in3Days = new Date(now.getTime() + 3 * 86400000);
  const [readyShip, soonShip, overdueShip, urgentOrders] = await Promise.all([
    prisma.order.count({ where: { status: 'ready_ship' } }),
    prisma.order.count({ where: { status: 'ready_ship', deliveryDate: { gte: now, lte: in3Days } } }),
    prisma.order.count({ where: { status: 'ready_ship', deliveryDate: { lt: now } } }),
    prisma.order.count({ where: { status: 'ready_ship', urgent: true } }),
  ]);

  return compact([
    makeItem({
      id: 'logistics-urgent-orders',
      title: '加急订单',
      content: `加急订单已进入物流阶段，请优先发货`,
      count: urgentOrders,
      target: 'logistics',
      level: 'urgent',
    }),
    makeItem({
      id: 'logistics-ready-ship',
      title: '待发货订单',
      content: `有 ${readyShip} 个订单等待发货`,
      count: readyShip,
      target: 'logistics',
      level: 'info',
    }),
    makeItem({
      id: 'logistics-soon-ship',
      title: '交期临近',
      content: `有 ${soonShip} 个待发货订单 3 天内到期`,
      count: soonShip,
      target: 'logistics',
      level: 'warning',
    }),
    makeItem({
      id: 'logistics-overdue-ship',
      title: '逾期待发货',
      content: `有 ${overdueShip} 个待发货订单已超过交期`,
      count: overdueShip,
      target: 'logistics',
      level: 'urgent',
    }),
  ]);
}

router.get('/', async (req, res) => {
  try {
    let items: NotificationItem[] = [];
    const user = req.user;

    if (user?.isAdmin || user?.canApproveOrder || user?.isClerk) items.push(...await approvalNotifications());
    // 发货审批红点仅经理层-内勤跟单（或管理员）能收到
    if (user?.isAdmin || user?.isClerk) items.push(...await shipApprovalNotifications());
    if (user?.isAdmin || user?.canManageUsers) items.push(...await userReviewNotifications());
    if (user?.isAdmin || user?.role === 'sales' || user?.isClerk) items.push(...await salesNotifications(user));
    if (user?.isAdmin || user?.role === 'purchase' || user?.isClerk) items.push(...await purchaseNotifications());
    if (user?.isAdmin || user?.role === 'production' || user?.isClerk) items.push(...await productionNotifications());
    if (user?.isAdmin || user?.role === 'logistics' || user?.isClerk) items.push(...await logisticsNotifications());

    res.json({
      items,
      total: items.reduce((sum, item) => sum + item.count, 0),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '服务器错误' });
  }
});

export default router;
