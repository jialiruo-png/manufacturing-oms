import { useEffect, useState } from 'react';
import { Drawer, Form, Input, Switch, message } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, ThunderboltFilled } from '@ant-design/icons';
import { getApiErrorMessage, ordersApi } from '../../api';
import type { Order, User } from '../../types';
import { back } from '../router';
import { formatCurrency, formatDate, formatShortDate, formatWanCurrency, getDaysLeft, getOrderStatusLabel } from '../../utils/order';
import MobileLayout from '../MobileLayout';
import MLoading from '../components/MLoading';
import MEmpty from '../components/MEmpty';
import MStatusTag from '../components/MStatusTag';

export default function MGMApprovalDetail({ orderId, user }: { orderId: number; user: User }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [urgent, setUrgent] = useState(false);
  const [urgentReason, setUrgentReason] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionType, setActionType] = useState<'order' | 'ship'>('order');

  const load = async () => {
    setLoading(true);
    try {
      const o = await ordersApi.get(orderId);
      setOrder(o);
      setUrgent(!!o.urgent);
      setUrgentReason(o.urgentReason || '');
      setActionType(o.status === 'pending_ship_approval' ? 'ship' : 'order');
    } catch (e) {
      message.error(getApiErrorMessage(e, '加载失败'));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [orderId]);

  if (loading || !order) {
    return (
      <MobileLayout title="审批详情" showBack user={user} activeModule="gm" showTabBar={false}>
        {loading ? <MLoading /> : <MEmpty text="订单不存在" />}
      </MobileLayout>
    );
  }

  const daysLeft = getDaysLeft(order.deliveryDate);
  const dueClass = daysLeft < 0 ? 'danger' : daysLeft <= 3 ? 'warning' : '';

  const handleApprove = async () => {
    setSaving(true);
    try {
      if (actionType === 'ship') {
        await ordersApi.action(order.id, 'approve_ship');
      } else {
        await ordersApi.action(order.id, 'approve', '', { urgent, urgentReason: urgent ? urgentReason : '' });
      }
      message.success('已批准');
      back('gm');
    } catch (e) { message.error(getApiErrorMessage(e, '批准失败')); }
    finally { setSaving(false); }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) { message.warning('请填写退回原因'); return; }
    setSaving(true);
    try {
      await ordersApi.action(order.id, actionType === 'ship' ? 'reject_ship' : 'reject', rejectReason.trim());
      message.success('已退回');
      back('gm');
    } catch (e) { message.error(getApiErrorMessage(e, '退回失败')); }
    finally {
      setSaving(false);
      setRejectOpen(false);
      setRejectReason('');
    }
  };

  const isPending = order.status === 'pending_approval' || order.status === 'pending_ship_approval';

  return (
    <MobileLayout title="审批详情" showBack user={user} activeModule="gm" showTabBar={false}>
      {/* 顶部 */}
      <div className="m-card">
        <div className="m-card-header" style={{ alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="m-order-code">{order.contractNo || order.contractRef || `#${order.id}`}</div>
            <div className="m-card-title" style={{ marginTop: 4 }}>{order.customer?.name}</div>
            {order.urgent && <span className="m-tag urgent" style={{ marginTop: 6 }}><ThunderboltFilled /> 加急 {order.urgentReason ? `· ${order.urgentReason}` : ''}</span>}
          </div>
          <MStatusTag status={order.status} />
        </div>
        <div className="m-card-divider" />
        <div className="m-card-row"><span className="m-card-label">订单金额</span><span className="m-amount">{formatWanCurrency(order.totalAmount)}</span></div>
        <div className="m-card-row">
          <span className="m-card-label">交期</span>
          <span className={`m-card-value ${dueClass ? `m-order-due ${dueClass}` : ''}`}>
            {formatShortDate(order.deliveryDate)} · {daysLeft < 0 ? `逾期 ${Math.abs(daysLeft)} 天` : daysLeft === 0 ? '今日' : `${daysLeft} 天`}
          </span>
        </div>
        <div className="m-card-row"><span className="m-card-label">业务员</span><span className="m-card-value">{order.salespersonName || order.createdBy || '—'}</span></div>
        <div className="m-card-row"><span className="m-card-label">下单时间</span><span className="m-card-value">{formatDate(order.createdAt)}</span></div>
        {order.notes && (<>
          <div className="m-card-divider" />
          <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>{order.notes}</div>
        </>)}
      </div>

      {/* 加急开关（仅订单审批） */}
      {isPending && actionType === 'order' && (
        <div className="m-card">
          <div className="m-card-title" style={{ fontSize: 14, marginBottom: 10 }}>加急标记（批准时一起提交）</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 14 }}>是否加急</span>
            <Switch checked={urgent} onChange={setUrgent} />
          </div>
          {urgent && (
            <input className="m-form-input" placeholder="加急原因" value={urgentReason} onChange={(e) => setUrgentReason(e.target.value)} />
          )}
        </div>
      )}

      {/* 产品明细 */}
      <div className="m-section-head"><span className="m-section-head-title">产品明细 ({order.orderItems.length})</span></div>
      {order.orderItems.map((it) => (
        <div key={it.id} className="m-card">
          <div className="m-card-header">
            <div className="m-card-title" style={{ fontSize: 14 }}>{it.displayName || it.productName}</div>
            <span className="m-amount">{formatCurrency(it.subtotal)}</span>
          </div>
          <div className="m-card-row"><span className="m-card-label">规格</span><span className="m-card-value">{it.spec || '—'}</span></div>
          <div className="m-card-row"><span className="m-card-label">数量</span><span className="m-card-value m-num">{it.quantity} {it.unit || ''}</span></div>
          <div className="m-card-row"><span className="m-card-label">单价</span><span className="m-card-value m-num">{formatCurrency(it.unitPrice)}</span></div>
        </div>
      ))}

      {/* 物料 */}
      {actionType === 'ship' && order.materials && order.materials.length > 0 && (
        <>
          <div className="m-section-head"><span className="m-section-head-title">物料备齐情况</span></div>
          {order.materials.map((m) => (
            <div key={m.id} className="m-card">
              <div className="m-card-header">
                <div className="m-card-title" style={{ fontSize: 14 }}>{m.name}</div>
                <span className={`m-tag ${m.status === 'ready' ? 'success' : 'warning'}`}>
                  {m.status === 'ready' ? '已备齐' : '未齐套'}
                </span>
              </div>
            </div>
          ))}
        </>
      )}

      {/* 审批历史 */}
      {order.approvalLog && order.approvalLog.length > 0 && (
        <>
          <div className="m-section-head"><span className="m-section-head-title">审批历史</span></div>
          <div className="m-card">
            {order.approvalLog.slice().reverse().slice(0, 10).map((log, i, arr) => (
              <div key={log.id} style={{ display: 'flex', gap: 10, paddingBottom: 12, borderBottom: i < arr.length - 1 ? '1px dashed #f1f5f9' : 0, marginBottom: i < arr.length - 1 ? 10 : 0 }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: log.action.includes('reject') ? '#dc2626' : '#22c55e', flexShrink: 0, marginTop: 6 }} />
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
        {isPending ? (
          <>
            <button type="button" className="m-btn m-btn-danger" disabled={saving} onClick={() => setRejectOpen(true)}>
              <CloseCircleOutlined /> 退回
            </button>
            <button type="button" className="m-btn m-btn-primary" disabled={saving} onClick={handleApprove}>
              <CheckCircleOutlined /> {saving ? '处理中…' : '批准'}
            </button>
          </>
        ) : (
          <button type="button" className="m-btn" onClick={() => back('gm')} style={{ flex: 1 }}>返回</button>
        )}
      </div>

      {/* 退回原因 Drawer */}
      <Drawer
        title="退回订单"
        placement="bottom"
        height="auto"
        open={rejectOpen}
        onClose={() => { setRejectOpen(false); setRejectReason(''); }}
        styles={{ body: { padding: 16, paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' } }}
      >
        <Form layout="vertical" requiredMark={false}>
          <Form.Item label="退回原因" required>
            <Input.TextArea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="请填写需要业务员修改的内容"
            />
          </Form.Item>
        </Form>
        <button type="button" className="m-btn m-btn-danger" onClick={handleReject} disabled={saving} style={{ width: '100%' }}>
          {saving ? '提交中…' : '确认退回'}
        </button>
      </Drawer>
    </MobileLayout>
  );
}
