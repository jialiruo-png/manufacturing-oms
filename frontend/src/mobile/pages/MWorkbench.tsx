import { useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import {
  AlertOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  ExclamationCircleOutlined,
  FileDoneOutlined,
  FileTextOutlined,
  InboxOutlined,
  LoadingOutlined,
  ShoppingOutlined,
  ToolOutlined,
  TruckOutlined,
} from '@ant-design/icons';
import { notificationsApi, ordersApi } from '../../api';
import type { NotificationItem, Order, User } from '../../types';
import { canApproveOrder, canManageUsers, displayRole } from '../../utils/permissions';
import { formatWanCurrency, getDaysLeft, getOrderStatusLabel } from '../../utils/order';
import { defaultModuleForUser, push, type MobileModule } from '../router';
import MobileLayout from '../MobileLayout';
import MLoading from '../components/MLoading';
import MEmpty from '../components/MEmpty';
import { usePullRefresh } from '../hooks/usePullRefresh';

interface MWorkbenchProps {
  user: User;
  onUserChange?: (user: User) => void;
}

type Tone = 'blue' | 'green' | 'amber' | 'red' | 'sky' | 'slate';
interface KpiItem { label: string; value: string | number; sub: string; tone: Tone; icon: JSX.Element; }

const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];

function isThisMonth(d: string) { return dayjs(d).isSame(dayjs(), 'month'); }

export default function MWorkbench({ user }: MWorkbenchProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const moduleKey: MobileModule = defaultModuleForUser(user);

  const canLoadOrders =
    user.isAdmin || user.role !== 'manager' || user.canApproveOrder || user.canManageUsers || user.isClerk;

  const role = useMemo(() => {
    if (user.isAdmin) return 'admin';
    if (user.isClerk) return 'clerk';
    if (canManageUsers(user) && !canApproveOrder(user)) return 'clerk';
    if (canApproveOrder(user)) return 'gm';
    if (user.role === 'sales') return 'sales';
    if (user.role === 'purchase') return 'procurement';
    if (user.role === 'production') return 'production';
    if (user.role === 'logistics') return 'logistics';
    return 'gm';
  }, [user]);

  const statusFilter = useMemo<string | undefined>(() => {
    const map: Record<string, string> = {
      sales: 'draft,pending_approval',
      gm: 'pending_approval,pending_ship_approval',
      procurement: 'procurement',
      production: 'production,pending_approval,pending_ship_approval,ready_ship,shipped',
      logistics: 'ready_ship,shipped',
    };
    return map[role];
  }, [role]);

  const load = async () => {
    setLoading(true);
    try {
      const [notifData, orderData] = await Promise.all([
        notificationsApi.list(),
        canLoadOrders
          ? ordersApi.listPaged({ status: statusFilter, page: 1, pageSize: 50 })
          : Promise.resolve({ data: [] as Order[], total: 0, page: 1, pageSize: 50 }),
      ]);
      setNotifications(notifData.items);
      setOrders(orderData.data);
    } catch {
      setNotifications([]);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [role, user.id]);

  const { refreshing, pullDistance, bindProps } = usePullRefresh(scrollRef, load);

  const mine = useMemo(() => {
    if (role === 'gm') return orders;
    if (role === 'sales') return orders.filter((o) => (o.salespersonName || o.createdBy) === user.name);
    if (role === 'procurement') return orders.filter((o) => !o.purchaserName || o.purchaserName === user.name || o.status === 'procurement');
    return orders;
  }, [orders, role, user.name]);

  const monthOrders = mine.filter((o) => isThisMonth(o.createdAt));
  const monthAmount = monthOrders.reduce((s, o) => s + o.totalAmount, 0);
  const riskOrders = orders.filter((o) => o.status !== 'shipped' && getDaysLeft(o.deliveryDate) <= 7);
  const totalNotif = notifications.reduce((s, n) => s + n.count, 0);

  const kpis: KpiItem[] = useMemo(() => {
    if (role === 'sales') return [
      { label: '本月订单金额', value: formatWanCurrency(monthAmount), sub: '按当前业务归属', tone: 'blue', icon: <DollarOutlined /> },
      { label: '本月订单数', value: monthOrders.length, sub: '已录入订单', tone: 'green', icon: <FileTextOutlined /> },
      { label: '待审批', value: mine.filter((o) => o.status === 'pending_approval').length, sub: '等待经理处理', tone: 'amber', icon: <ClockCircleOutlined /> },
      { label: '被退回', value: mine.filter((o) => o.approvalLog?.some((l) => l.action.includes('reject'))).length, sub: '需补充修改', tone: 'red', icon: <ExclamationCircleOutlined /> },
    ];
    if (role === 'procurement') return [
      { label: '备料中', value: orders.filter((o) => o.status === 'procurement').length, sub: '当前队列', tone: 'amber', icon: <ShoppingOutlined /> },
      { label: '缺料订单', value: orders.filter((o) => o.status === 'procurement' && (o.materialSummary ? o.materialSummary.unready > 0 : o.materials.some((m) => m.status !== 'ready'))).length, sub: '物料未齐套', tone: 'red', icon: <AlertOutlined /> },
      { label: '已齐套', value: orders.filter((o) => o.materialSummary ? o.materialSummary.total > 0 && o.materialSummary.unready === 0 : o.materials.length > 0 && o.materials.every((m) => m.status === 'ready')).length, sub: '可进入生产', tone: 'green', icon: <CheckCircleOutlined /> },
      { label: '加急订单', value: orders.filter((o) => o.urgent).length, sub: '优先处理', tone: 'red', icon: <ExclamationCircleOutlined /> },
    ];
    if (role === 'production') return [
      { label: '待排产', value: orders.filter((o) => o.status === 'pending_production').length, sub: '可开始生产', tone: 'green', icon: <ClockCircleOutlined /> },
      { label: '在产订单', value: orders.filter((o) => o.status === 'production').length, sub: '当前在制', tone: 'sky', icon: <ToolOutlined /> },
      { label: '延期订单', value: orders.filter((o) => o.status !== 'shipped' && getDaysLeft(o.deliveryDate) < 0).length, sub: '已超交期', tone: 'red', icon: <AlertOutlined /> },
      { label: '待复审', value: orders.filter((o) => o.status === 'pending_approval' && o.prevStatus).length, sub: '退回待处理', tone: 'amber', icon: <ClockCircleOutlined /> },
    ];
    if (role === 'logistics') return [
      { label: '待发货', value: orders.filter((o) => o.status === 'ready_ship').length, sub: '等待登记', tone: 'amber', icon: <TruckOutlined /> },
      { label: '今日发货', value: orders.filter((o) => o.status === 'shipped' && dayjs(o.updatedAt).isSame(dayjs(), 'day')).length, sub: '今天已完成', tone: 'blue', icon: <FileDoneOutlined /> },
      { label: '已发货', value: orders.filter((o) => o.status === 'shipped').length, sub: '历史记录', tone: 'green', icon: <CheckCircleOutlined /> },
      { label: '逾期未发', value: orders.filter((o) => o.status === 'ready_ship' && getDaysLeft(o.deliveryDate) < 0).length, sub: '需优先处理', tone: 'red', icon: <AlertOutlined /> },
    ];
    // gm / admin / clerk
    const canSeeShipApproval = user.isAdmin || user.isClerk;
    const shipApproval: KpiItem = {
      label: '待发货审批',
      value: orders.filter((o) => o.status === 'pending_ship_approval').length,
      sub: '等待确认',
      tone: 'amber',
      icon: <TruckOutlined />,
    };
    if (canManageUsers(user) && !canApproveOrder(user)) return [
      { label: '待处理通知', value: totalNotif, sub: '用户与系统', tone: 'red', icon: <InboxOutlined /> },
      { label: '等待审批', value: orders.filter((o) => o.status === 'pending_approval').length, sub: '审批排队', tone: 'blue', icon: <ClockCircleOutlined /> },
      canSeeShipApproval ? shipApproval : { label: '系统待办', value: notifications.length, sub: '按类型汇总', tone: 'slate' as const, icon: <InboxOutlined /> },
      { label: '风险订单', value: riskOrders.length, sub: '交期临近', tone: 'red', icon: <AlertOutlined /> },
    ];
    return [
      { label: '等待审批中', value: orders.filter((o) => o.status === 'pending_approval').length, sub: '待处理', tone: 'blue', icon: <ClockCircleOutlined /> },
      canSeeShipApproval ? shipApproval : { label: '待处理通知', value: totalNotif, sub: '当前账号', tone: 'slate' as const, icon: <InboxOutlined /> },
      { label: '本月金额', value: formatWanCurrency(orders.filter((o) => isThisMonth(o.createdAt)).reduce((s, o) => s + o.totalAmount, 0)), sub: '经营金额', tone: 'green', icon: <DollarOutlined /> },
      { label: '风险订单', value: riskOrders.length, sub: '交期临近', tone: 'red', icon: <AlertOutlined /> },
    ];
  }, [role, monthAmount, monthOrders.length, mine, orders, riskOrders.length, notifications, totalNotif, user]);

  const actionOrders = useMemo(() => {
    return mine
      .filter((o) => !['shipped', 'draft'].includes(o.status))
      .sort((a, b) => getDaysLeft(a.deliveryDate) - getDaysLeft(b.deliveryDate))
      .slice(0, 6);
  }, [mine]);

  return (
    <MobileLayout
      brand
      user={user}
      activeModule="workbench"
      scrollRef={scrollRef}
    >
      <div {...bindProps}>
        <div className="m-pull-indicator" style={{ height: refreshing ? 32 : pullDistance }}>
          {refreshing ? (<><LoadingOutlined spin /> <span style={{ marginLeft: 6 }}>刷新中…</span></>) : pullDistance > 0 ? (pullDistance >= 60 ? '松开刷新' : '下拉刷新') : null}
        </div>

        {/* Welcome */}
        <div className="m-welcome">
          <div className="m-avatar">{user.name.slice(0, 1)}</div>
          <div className="m-welcome-info">
            <div className="m-welcome-name">{user.name}</div>
            <div className="m-welcome-meta">
              <span>{displayRole(user)}</span>
              <span> · </span>
              <span>{dayjs().format('MM月DD日')} 周{WEEKDAY[dayjs().day()]}</span>
            </div>
          </div>
        </div>

        {/* KPI Grid */}
        {loading ? <MLoading /> : (
          <div className="m-kpi-grid">
            {kpis.map((k) => (
              <div key={k.label} className="m-kpi">
                <div className="m-kpi-label">{k.label}</div>
                <div className="m-kpi-value">{k.value}</div>
                <div className="m-kpi-sub">{k.sub}</div>
              </div>
            ))}
          </div>
        )}

        {/* 我的待办通知 */}
        <div className="m-card">
          <div className="m-card-header">
            <div className="m-card-title">我的待办</div>
            <span style={{ fontSize: 12, color: totalNotif > 0 ? '#dc2626' : '#94a3b8' }}>
              {totalNotif > 0 ? `${totalNotif} 项待处理` : '暂无待办'}
            </span>
          </div>
          {notifications.length === 0 ? (
            <div style={{ padding: '12px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              暂无新待办通知
            </div>
          ) : (
            notifications.slice(0, 5).map((n) => (
              <div
                key={n.id}
                onClick={() => push(n.target as MobileModule)}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '10px 0', borderTop: '1px dashed #f1f5f9', cursor: 'pointer',
                }}
              >
                <span style={{
                  width: 6, height: 6, borderRadius: 999,
                  background: n.level === 'urgent' ? '#dc2626' : n.level === 'warning' ? '#f59e0b' : '#3b82f6',
                  marginTop: 8,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1d23' }}>{n.title}</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{n.content}</div>
                </div>
                <span className="m-badge-count" style={{ position: 'static', border: 0, marginTop: 2 }}>{n.count}</span>
              </div>
            ))
          )}
        </div>

        {/* 最近待处理订单 */}
        <div className="m-section-head">
          <span className="m-section-head-title">最近待处理</span>
          <a className="m-section-head-link" onClick={() => push(moduleKey)}>查看全部</a>
        </div>
        {actionOrders.length === 0 ? (
          <MEmpty text="暂无待处理订单" />
        ) : (
          actionOrders.map((o) => {
            const daysLeft = getDaysLeft(o.deliveryDate);
            const dueClass = daysLeft < 0 ? 'danger' : daysLeft <= 3 ? 'warning' : '';
            return (
              <div
                key={o.id}
                className={`m-order-card${o.urgent ? ' m-card-rail-red' : ''}`}
                onClick={() => push('sales', { id: o.id })}
              >
                <div className="m-order-card-head">
                  <div style={{ minWidth: 0 }}>
                    <div className="m-order-code">{o.contractNo || o.contractRef || `#${o.id}`}</div>
                    <div className="m-order-customer">{o.customer?.name || '未知客户'}</div>
                  </div>
                  <span className={`m-status ${o.status}`}>{getOrderStatusLabel(o.status)}</span>
                </div>
                <div className="m-order-summary">
                  {o.orderItems?.[0]?.displayName || o.orderItems?.[0]?.productName || o.product?.name || '产品未指定'}
                  {o.orderItems && o.orderItems.length > 1 ? ` 等 ${o.orderItems.length} 项` : ''}
                </div>
                <div className="m-order-meta">
                  <span className="m-order-amount">{formatWanCurrency(o.totalAmount)}</span>
                  <span className={`m-order-due ${dueClass}`}>
                    {daysLeft < 0 ? `逾期 ${Math.abs(daysLeft)} 天` : `${daysLeft} 天交付`}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </MobileLayout>
  );
}
