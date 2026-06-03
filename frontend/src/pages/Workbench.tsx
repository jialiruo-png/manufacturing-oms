import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Skeleton } from 'antd';
import {
  AlertOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  ExclamationCircleOutlined,
  FileDoneOutlined,
  FileTextOutlined,
  InboxOutlined,
  ShoppingOutlined,
  ToolOutlined,
  TruckOutlined,
} from '@ant-design/icons';
import { notificationsApi, ordersApi } from '../api';
import type { NotificationItem, Order, Role, User } from '../types';
import dayjs from 'dayjs';
import { formatWanCurrency, getDaysLeft, getOrderStatusLabel } from '../utils/order';
import { displayRole, canApproveOrder, canManageUsers } from '../utils/permissions';
import './workbench.css';

type NavTarget = Role | 'user-review';
type MetricTone = 'red' | 'blue' | 'amber' | 'green' | 'sky' | 'slate';
type WorkbenchMetric = {
  label: string;
  value: string | number;
  desc: string;
  tone: MetricTone;
  icon: ReactNode;
};

const isThisMonth = (date: string) => dayjs(date).isSame(dayjs(), 'month');

const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];

function getEntryDays(user: User): number | null {
  const raw = user as unknown as Record<string, string>;
  const entryDate = raw.entryDate || raw.hireDate || raw.joinDate;
  if (!entryDate) return null;
  const parsed = dayjs(entryDate);
  if (!parsed.isValid()) return null;
  return Math.max(1, dayjs().diff(parsed, 'day') + 1);
}

function OrderDaysLeft({ date }: { date: string }) {
  const days = getDaysLeft(date);
  let cls: string;
  let label: string;
  if (days < 0) {
    cls = 'overdue';
    label = `逾期${Math.abs(days)}天`;
  } else if (days === 0) {
    cls = 'urgent';
    label = '今天到期';
  } else if (days <= 5) {
    cls = 'urgent';
    label = `还剩${days}天`;
  } else {
    cls = 'normal';
    label = `${days}天后`;
  }
  return <span className={`wb-days ${cls}`}>{label}</span>;
}

export default function Workbench({
  refreshKey = 0,
  role,
  user,
  onNavigate,
  onProfileChange: _onProfileChange,
}: {
  refreshKey?: number;
  role: Role;
  user: User;
  onNavigate: (target: NavTarget) => void;
  onProfileChange?: () => void;
}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const canLoadOrders = user.isAdmin || user.role !== 'manager' || user.canApproveOrder || user.canManageUsers || user.isClerk;

  useEffect(() => {
    setLoading(true);
    const statusByRole: Partial<Record<Role, string>> = {
      sales: 'draft,pending_approval',
      gm: 'pending_approval,pending_ship_approval',
      procurement: 'procurement',
      production: 'production,pending_approval,pending_ship_approval,ready_ship,shipped',
      logistics: 'ready_ship,shipped',
    };
    const ordersReq = canLoadOrders
      ? ordersApi.listPaged({ status: statusByRole[role], page: 1, pageSize: 50 })
      : Promise.resolve({ data: [] as Order[] });

    Promise.all([notificationsApi.list(), ordersReq])
      .then(([notifData, orderData]) => {
        setNotifications(notifData.items);
        setOrders(orderData.data);
      })
      .catch(() => {
        setNotifications([]);
        setOrders([]);
      })
      .finally(() => setLoading(false));
  }, [role, user.id, refreshKey]);

  const mine = useMemo(() => {
    if (role === 'gm') return orders;
    if (role === 'sales') {
      return orders.filter((o) => (o.salespersonName || o.createdBy) === user.name);
    }
    if (role === 'procurement') {
      return orders.filter((o) => !o.purchaserName || o.purchaserName === user.name || o.status === 'procurement');
    }
    return orders;
  }, [orders, role, user.name]);

  const monthOrders = mine.filter((o) => isThisMonth(o.createdAt));
  const monthAmount = monthOrders.reduce((sum, o) => sum + o.totalAmount, 0);
  const riskOrders = orders.filter((o) => o.status !== 'shipped' && getDaysLeft(o.deliveryDate) <= 7);

  const metrics: WorkbenchMetric[] = useMemo(() => {
    if (role === 'sales') return [
      { label: '本月订单金额', value: formatWanCurrency(monthAmount), desc: '按当前业务归属统计', tone: 'blue', icon: <DollarOutlined /> },
      { label: '本月订单数', value: monthOrders.length, desc: '本月已录入订单', tone: 'green', icon: <FileTextOutlined /> },
      { label: '待审批订单', value: mine.filter((o) => o.status === 'pending_approval').length, desc: '等待审批管理处理', tone: 'amber', icon: <ClockCircleOutlined /> },
      { label: '被退回订单', value: mine.filter((o) => o.approvalLog.some((l) => l.action.includes('reject'))).length, desc: '需要补充或修改', tone: 'red', icon: <ExclamationCircleOutlined /> },
    ];
    if (role === 'procurement') return [
      { label: '备料中订单', value: orders.filter((o) => o.status === 'procurement').length, desc: '当前采购处理队列', tone: 'amber', icon: <ShoppingOutlined /> },
      { label: '缺料订单', value: orders.filter((o) => o.status === 'procurement' && (o.materialSummary ? o.materialSummary.unready > 0 : o.materials.some((m) => m.status !== 'ready'))).length, desc: '物料未全部齐套', tone: 'red', icon: <AlertOutlined /> },
      { label: '已完成备料', value: orders.filter((o) => o.materialSummary ? o.materialSummary.total > 0 && o.materialSummary.unready === 0 : o.materials.length > 0 && o.materials.every((m) => m.status === 'ready')).length, desc: '可进入后续生产', tone: 'green', icon: <CheckCircleOutlined /> },
      { label: '加急订单', value: orders.filter((o) => o.urgent).length, desc: '优先关注交付风险', tone: 'red', icon: <ExclamationCircleOutlined /> },
    ];
    if (role === 'production') return [
      { label: '待排产订单', value: orders.filter((o) => o.status === 'pending_production').length, desc: '采购已排入生产队列', tone: 'green', icon: <ClockCircleOutlined /> },
      { label: '在产订单', value: orders.filter((o) => o.status === 'production').length, desc: '当前在制订单', tone: 'sky', icon: <ToolOutlined /> },
      { label: '延期订单', value: orders.filter((o) => o.status !== 'shipped' && getDaysLeft(o.deliveryDate) < 0).length, desc: '交期已超出计划', tone: 'red', icon: <AlertOutlined /> },
      { label: '待复审订单', value: orders.filter((o) => o.status === 'pending_approval' && o.prevStatus).length, desc: '退回审批等待处理', tone: 'amber', icon: <ClockCircleOutlined /> },
    ];
    if (role === 'logistics') return [
      { label: '待发货', value: orders.filter((o) => o.status === 'ready_ship').length, desc: '等待物流登记', tone: 'amber', icon: <TruckOutlined /> },
      { label: '今日发货', value: orders.filter((o) => o.status === 'shipped' && dayjs(o.updatedAt).isSame(dayjs(), 'day')).length, desc: '今天已完成发货', tone: 'blue', icon: <FileDoneOutlined /> },
      { label: '已发货', value: orders.filter((o) => o.status === 'shipped').length, desc: '历史发货记录', tone: 'green', icon: <CheckCircleOutlined /> },
      { label: '逾期未发货', value: orders.filter((o) => o.status === 'ready_ship' && getDaysLeft(o.deliveryDate) < 0).length, desc: '需要优先处理', tone: 'red', icon: <AlertOutlined /> },
    ];
    // 发货审批指标仅 admin / 经理层-内勤跟单 可见
    const canSeeShipApproval = !!user && (user.isAdmin || user.isClerk);
    const shipApprovalMetric: WorkbenchMetric = {
      label: '待发货审批',
      value: orders.filter((o) => o.status === 'pending_ship_approval').length,
      desc: '等待确认可发货',
      tone: 'amber',
      icon: <TruckOutlined />,
    };
    if (canManageUsers(user) && !canApproveOrder(user)) return [
      { label: '待处理通知', value: notifications.reduce((s, n) => s + n.count, 0), desc: '用户与系统待办', tone: 'red', icon: <InboxOutlined /> },
      { label: '等待审批', value: orders.filter((o) => o.status === 'pending_approval').length, desc: '订单审批排队中', tone: 'blue', icon: <ClockCircleOutlined /> },
      ...(canSeeShipApproval ? [shipApprovalMetric] : [{ label: '系统待办', value: notifications.length, desc: '按待办类型汇总', tone: 'slate' as const, icon: <InboxOutlined /> }]),
      { label: '风险订单', value: riskOrders.length, desc: '交期临近或逾期', tone: 'red', icon: <AlertOutlined /> },
    ];
    return [
      { label: '等待审批中', value: orders.filter((o) => o.status === 'pending_approval').length, desc: '业务提交待处理', tone: 'blue', icon: <ClockCircleOutlined /> },
      ...(canSeeShipApproval ? [shipApprovalMetric] : [{ label: '待处理通知', value: notifications.reduce((s, n) => s + n.count, 0), desc: '当前账号待办汇总', tone: 'slate' as const, icon: <InboxOutlined /> }]),
      { label: '本月订单金额', value: formatWanCurrency(orders.filter((o) => isThisMonth(o.createdAt)).reduce((sum, o) => sum + o.totalAmount, 0)), desc: '全局经营金额', tone: 'green', icon: <DollarOutlined /> },
      { label: '风险订单', value: riskOrders.length, desc: '交期临近或逾期', tone: 'red', icon: <AlertOutlined /> },
    ];
  }, [role, orders, monthAmount, monthOrders.length, mine, riskOrders.length, notifications, user]);

  const actionOrders = useMemo(() => {
    return mine
      .filter((o) => !['shipped', 'draft'].includes(o.status))
      .sort((a, b) => getDaysLeft(a.deliveryDate) - getDaysLeft(b.deliveryDate))
      .slice(0, 7);
  }, [mine]);

  const primaryTab: NavTarget = role === 'gm' ? 'gm' : role;

  const entryDays = getEntryDays(user);
  const today = dayjs().format('YYYY年MM月DD日');
  const weekday = WEEKDAY[dayjs().day()];
  const totalNotifCount = notifications.reduce((s, n) => s + n.count, 0);

  if (loading) {
    return <Skeleton active paragraph={{ rows: 14 }} className="wb-loading" />;
  }

  return (
    <div className="wb-page">
      {/* Welcome Banner */}
      <div className="wb-banner">
        <div className="wb-avatar">{user.name.slice(0, 1)}</div>
        <div className="wb-user-info">
          <div className="wb-user-name">
            {user.name}
            <span className="wb-role-tag">{displayRole(user)}</span>
          </div>
          <div className="wb-user-meta">
            <span>{user.department || 'YMT'}</span>
            <span className="wb-user-meta-sep" />
            <span>{user.phone}</span>
          </div>
        </div>
        <div className="wb-date-block">
          <div className="wb-date-main">{today} 周{weekday}</div>
          <div className="wb-date-sub">欢迎回来，祝工作顺利</div>
          {entryDays !== null && (
            <div className="wb-entry-badge">入职第 {entryDays} 天</div>
          )}
        </div>
      </div>

      {/* KPI Metrics */}
      <div className="wb-kpi-grid">
        {metrics.map((metric) => (
          <div key={metric.label} className={`wb-kpi-card tone-${metric.tone}`}>
            <div className="wb-kpi-top">
              <span className="wb-kpi-label">{metric.label}</span>
              <span className="wb-kpi-icon">{metric.icon}</span>
            </div>
            <div className="wb-kpi-value">{metric.value}</div>
            <div className="wb-kpi-desc">{metric.desc}</div>
          </div>
        ))}
      </div>

      {/* Bottom: Notifications + Orders */}
      <div className="wb-bottom-grid">

        {/* Notifications / Todos */}
        <div className="wb-card">
          <div className="wb-card-header">
            <div className="wb-card-title">
              <span className="wb-title-dot" />
              我的待办任务
            </div>
            <span className={`wb-card-badge ${totalNotifCount > 0 ? 'active' : ''}`}>
              {totalNotifCount > 0 ? `${totalNotifCount} 项待处理` : '暂无待办'}
            </span>
          </div>
          {notifications.length === 0 ? (
            <div className="wb-empty">当前没有待办任务，一切顺利！</div>
          ) : (
            <div className="wb-todo-list">
              {notifications.map((item) => (
                <div key={item.id} className="wb-todo-row" onClick={() => onNavigate(item.target)}>
                  <span className={`wb-todo-count ${item.level}`}>{item.count}</span>
                  <div className="wb-todo-body">
                    <span className="wb-todo-title">{item.title}</span>
                    <span className="wb-todo-desc">{item.content}</span>
                  </div>
                  <span className="wb-todo-go">前往 →</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action Orders */}
        <div className="wb-card">
          <div className="wb-card-header">
            <div className="wb-card-title">
              <span className="wb-title-dot" />
              需关注的订单
            </div>
            <span className={`wb-card-badge ${actionOrders.length > 0 ? 'active' : ''}`}>
              {actionOrders.length} 单
            </span>
          </div>
          {actionOrders.length === 0 ? (
            <div className="wb-empty">暂无进行中的订单</div>
          ) : (
            <>
              <div className="wb-order-list">
                {actionOrders.map((order) => (
                  <div key={order.id} className="wb-order-row">
                    <span className="wb-order-customer">{order.customer.name}</span>
                    <span className={`wb-order-status s-${order.status}`}>
                      {getOrderStatusLabel(order.status)}
                    </span>
                    <OrderDaysLeft date={order.deliveryDate} />
                  </div>
                ))}
              </div>
              <div className="wb-card-footer" onClick={() => onNavigate(primaryTab)}>
                查看全部订单 →
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
