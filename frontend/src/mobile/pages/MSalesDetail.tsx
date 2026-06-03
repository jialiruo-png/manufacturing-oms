import { useEffect, useState } from 'react';
import { Modal, message } from 'antd';
import {
  EditOutlined,
  DeleteOutlined,
  RollbackOutlined,
  SendOutlined,
  ThunderboltFilled,
} from '@ant-design/icons';
import { ordersApi, getApiErrorMessage } from '../../api';
import type { Order, User } from '../../types';
import { canApproveOrder, canCreateOrder } from '../../utils/permissions';
import { back, push } from '../router';
import { formatCurrency, formatWanCurrency, formatDate, formatShortDate, getDaysLeft, getOrderStatusLabel } from '../../utils/order';
import MobileLayout from '../MobileLayout';
import MLoading from '../components/MLoading';
import MStatusTag from '../components/MStatusTag';
import MEmpty from '../components/MEmpty';

interface MSalesDetailProps {
  orderId: number;
  user: User;
}

export default function MSalesDetail({ orderId, user }: MSalesDetailProps) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await ordersApi.get(orderId);
      setOrder(res);
    } catch (e) {
      message.error(getApiErrorMessage(e, '加载订单详情失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [orderId]);

  if (loading || !order) {
    return (
      <MobileLayout title="订单详情" showBack user={user} activeModule="sales" showTabBar={false}>
        {loading ? <MLoading /> : <MEmpty text="订单不存在或已删除" />}
      </MobileLayout>
    );
  }

  const daysLeft = getDaysLeft(order.deliveryDate);
  const dueClass = daysLeft < 0 ? 'danger' : daysLeft <= 3 ? 'warning' : '';
  const isOwner = (order.salespersonName || order.createdBy) === user.name;
  const canEditOwn = canCreateOrder(user) && (isOwner || user.isAdmin || user.canManageUsers);
  const isSubmittable = order.status === 'draft' && canEditOwn;
  const isWithdrawable = order.status === 'pending_approval' && canEditOwn;
  const isApprover = canApproveOrder(user);

  const handleSubmit = () => {
    Modal.confirm({
      title: '提交审批',
      content: `订单 ${order.contractNo || order.contractRef || `#${order.id}`} 将提交至审批管理`,
      okText: '提交',
      cancelText: '取消',
      onOk: async () => {
        try { await ordersApi.action(order.id, 'submit'); message.success('已提交'); void load(); }
        catch (e) { message.error(getApiErrorMessage(e, '提交失败')); }
      },
    });
  };

  const handleWithdraw = () => {
    Modal.confirm({
      title: '撤回审批',
      content: '撤回后可重新编辑订单',
      okText: '撤回',
      cancelText: '取消',
      onOk: async () => {
        try { await ordersApi.action(order.id, 'withdraw', '业务员撤回'); message.success('已撤回'); void load(); }
        catch (e) { message.error(getApiErrorMessage(e, '撤回失败')); }
      },
    });
  };

  const handleApprove = () => {
    Modal.confirm({
      title: '批准下单',
      content: '订单将进入备料环节',
      okText: '批准',
      onOk: async () => {
        try { await ordersApi.action(order.id, 'approve', '', { urgent: order.urgent, urgentReason: order.urgentReason || '' }); message.success('已批准'); void load(); }
        catch (e) { message.error(getApiErrorMessage(e, '批准失败')); }
      },
    });
  };

  const handleReject = () => {
    let reason = '';
    Modal.confirm({
      title: '退回订单',
      content: (
        <textarea
          className="m-form-textarea"
          placeholder="请输入退回原因"
          onChange={(e) => { reason = e.target.value; }}
          rows={3}
          style={{ marginTop: 8 }}
        />
      ),
      okText: '退回',
      okButtonProps: { danger: true },
      onOk: async () => {
        if (!reason.trim()) { message.warning('请输入退回原因'); throw new Error('no reason'); }
        try { await ordersApi.action(order.id, 'reject', reason); message.success('已退回'); void load(); }
        catch (e) { message.error(getApiErrorMessage(e, '退回失败')); throw e; }
      },
    });
  };

  const handleDelete = () => {
    Modal.confirm({
      title: '删除订单',
      content: '删除后无法恢复',
      okText: '删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        try { await ordersApi.delete(order.id); message.success('已删除'); back('sales'); }
        catch (e) { message.error(getApiErrorMessage(e, '删除失败')); }
      },
    });
  };

  return (
    <MobileLayout
      title="订单详情"
      showBack
      user={user}
      activeModule="sales"
      showTabBar={false}
    >
      {/* 顶部摘要 */}
      <div className="m-card">
        <div className="m-card-header" style={{ alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="m-order-code" style={{ fontSize: 13 }}>{order.contractNo || order.contractRef || `#${order.id}`}</div>
            <div className="m-card-title" style={{ marginTop: 4 }}>{order.customer?.name || '未知客户'}</div>
            {order.urgent && <span className="m-tag urgent" style={{ marginTop: 6 }}><ThunderboltFilled /> 加急 {order.urgentReason ? `· ${order.urgentReason}` : ''}</span>}
          </div>
          <MStatusTag status={order.status} />
        </div>
        <div className="m-card-divider" />
        <div className="m-card-row">
          <span className="m-card-label">订单金额</span>
          <span className="m-amount">{formatWanCurrency(order.totalAmount)}</span>
        </div>
        <div className="m-card-row">
          <span className="m-card-label">交货日期</span>
          <span className={`m-card-value m-num ${dueClass === 'danger' ? '' : ''}`}>
            {formatShortDate(order.deliveryDate)}
            <span className={`m-order-due ${dueClass}`} style={{ marginLeft: 8 }}>
              {daysLeft < 0 ? `逾期 ${Math.abs(daysLeft)} 天` : daysLeft === 0 ? '今日' : `${daysLeft} 天`}
            </span>
          </span>
        </div>
        <div className="m-card-row">
          <span className="m-card-label">业务员</span>
          <span className="m-card-value">{order.salespersonName || order.createdBy || '—'}</span>
        </div>
        {order.purchaserName && (
          <div className="m-card-row">
            <span className="m-card-label">采购员</span>
            <span className="m-card-value">{order.purchaserName}</span>
          </div>
        )}
        <div className="m-card-row">
          <span className="m-card-label">下单时间</span>
          <span className="m-card-value">{formatDate(order.createdAt)}</span>
        </div>
        {order.notes && (
          <>
            <div className="m-card-divider" />
            <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>{order.notes}</div>
          </>
        )}
      </div>

      {/* 产品明细 */}
      <div className="m-section-head"><span className="m-section-head-title">产品明细 ({order.orderItems.length} 款)</span></div>
      {order.orderItems.map((item) => (
        <div key={item.id} className="m-card">
          <div className="m-card-header">
            <div className="m-card-title" style={{ fontSize: 15 }}>{item.displayName || item.productName}</div>
            <span className="m-amount">{formatCurrency(item.subtotal)}</span>
          </div>
          <div className="m-card-row">
            <span className="m-card-label">规格</span>
            <span className="m-card-value">{item.spec || '—'}</span>
          </div>
          <div className="m-card-row">
            <span className="m-card-label">数量</span>
            <span className="m-card-value m-num">{item.quantity} {item.unit || ''}</span>
          </div>
          <div className="m-card-row">
            <span className="m-card-label">单价</span>
            <span className="m-card-value m-num">{formatCurrency(item.unitPrice)}</span>
          </div>
          {item.remark && (
            <div className="m-card-row">
              <span className="m-card-label">备注</span>
              <span className="m-card-value" style={{ whiteSpace: 'normal', textAlign: 'right' }}>{item.remark}</span>
            </div>
          )}
        </div>
      ))}

      {/* 物料 */}
      {order.materials && order.materials.length > 0 && (
        <>
          <div className="m-section-head"><span className="m-section-head-title">物料 ({order.materials.length})</span></div>
          {order.materials.map((m) => (
            <div key={m.id} className="m-card">
              <div className="m-card-header">
                <div className="m-card-title" style={{ fontSize: 15 }}>{m.name}</div>
                <span className={`m-tag ${m.status === 'ready' ? 'success' : m.urgent ? 'urgent' : 'warning'}`}>
                  {m.status === 'ready' ? '已备齐' : m.status === 'in_progress' ? '备料中' : '待备料'}
                </span>
              </div>
              <div className="m-card-row">
                <span className="m-card-label">规格</span>
                <span className="m-card-value">{m.spec || '—'}</span>
              </div>
              <div className="m-card-row">
                <span className="m-card-label">需求量</span>
                <span className="m-card-value m-num">{m.required} {m.unit || ''}</span>
              </div>
              {m.expectedDate && (
                <div className="m-card-row">
                  <span className="m-card-label">预计到货</span>
                  <span className="m-card-value">{formatShortDate(m.expectedDate)}</span>
                </div>
              )}
              {m.notes && (
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>{m.notes}</div>
              )}
            </div>
          ))}
        </>
      )}

      {/* 审批记录 */}
      {order.approvalLog && order.approvalLog.length > 0 && (
        <>
          <div className="m-section-head"><span className="m-section-head-title">操作记录</span></div>
          <div className="m-card">
            {order.approvalLog.slice().reverse().map((log, i, arr) => (
              <div key={log.id} style={{ display: 'flex', gap: 10, paddingBottom: 12, borderBottom: i < arr.length - 1 ? '1px dashed #f1f5f9' : 0, marginBottom: i < arr.length - 1 ? 10 : 0 }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: '#2f66ff', flexShrink: 0, marginTop: 6 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1d23' }}>
                    {log.fromStage && log.toStage ? `${getOrderStatusLabel(log.fromStage)} → ${getOrderStatusLabel(log.toStage)}` : log.action}
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                    {log.operator} · {formatDate(log.createdAt, 'YYYY-MM-DD HH:mm')}
                  </div>
                  {log.reason && (
                    <div style={{ fontSize: 12, color: '#475569', marginTop: 4, lineHeight: 1.5 }}>{log.reason}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 操作 */}
      <div className="m-form-actions">
        {isSubmittable && (
          <>
            <button type="button" className="m-btn" onClick={() => push('sales', { action: 'edit', id: order.id })}><EditOutlined /> 编辑</button>
            <button type="button" className="m-btn m-btn-primary" onClick={handleSubmit}><SendOutlined /> 提交审批</button>
          </>
        )}
        {isWithdrawable && (
          <button type="button" className="m-btn" onClick={handleWithdraw}><RollbackOutlined /> 撤回审批</button>
        )}
        {order.status === 'pending_approval' && isApprover && (
          <>
            <button type="button" className="m-btn m-btn-danger" onClick={handleReject}>退回</button>
            <button type="button" className="m-btn m-btn-primary" onClick={handleApprove}>批准</button>
          </>
        )}
        {order.status === 'draft' && canEditOwn && (
          <button type="button" className="m-btn m-btn-danger" onClick={handleDelete}><DeleteOutlined /></button>
        )}
        {!isSubmittable && !isWithdrawable && order.status !== 'pending_approval' && (
          <button type="button" className="m-btn" onClick={() => back('sales')} style={{ flex: 1 }}>返回</button>
        )}
      </div>
    </MobileLayout>
  );
}
