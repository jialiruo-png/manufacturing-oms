import { useEffect, useState } from 'react';
import { Modal, message } from 'antd';
import { PlayCircleOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { getApiErrorMessage, ordersApi } from '../../api';
import type { Order, User } from '../../types';
import { back } from '../router';
import { formatCurrency, formatShortDate, formatWanCurrency, getDaysLeft } from '../../utils/order';
import MobileLayout from '../MobileLayout';
import MLoading from '../components/MLoading';
import MEmpty from '../components/MEmpty';
import MStatusTag from '../components/MStatusTag';

export default function MProductionDetail({ orderId, user }: { orderId: number; user: User }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setOrder(await ordersApi.get(orderId)); }
    catch (e) { message.error(getApiErrorMessage(e, '加载失败')); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [orderId]);

  if (loading || !order) {
    return (
      <MobileLayout title="生产详情" showBack user={user} activeModule="production" showTabBar={false}>
        {loading ? <MLoading /> : <MEmpty text="订单不存在" />}
      </MobileLayout>
    );
  }

  const daysLeft = getDaysLeft(order.deliveryDate);
  const dueClass = daysLeft < 0 ? 'danger' : daysLeft <= 3 ? 'warning' : '';

  const action = (act: 'start_production' | 'finish_production', label: string) => {
    Modal.confirm({
      title: label,
      content: `${label}「${order.contractNo || `#${order.id}`}」?`,
      okText: '确认',
      onOk: async () => {
        try {
          await ordersApi.action(order.id, act);
          message.success(`${label}成功`);
          back('production');
        } catch (e) { message.error(getApiErrorMessage(e, `${label}失败`)); }
      },
    });
  };

  return (
    <MobileLayout title="生产详情" showBack user={user} activeModule="production" showTabBar={false}>
      <div className="m-card">
        <div className="m-card-header" style={{ alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="m-order-code">{order.contractNo || order.contractRef || `#${order.id}`}</div>
            <div className="m-card-title" style={{ marginTop: 4 }}>{order.customer?.name}</div>
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
        {order.purchaserName && <div className="m-card-row"><span className="m-card-label">采购员</span><span className="m-card-value">{order.purchaserName}</span></div>}
        {order.notes && (<>
          <div className="m-card-divider" />
          <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>{order.notes}</div>
        </>)}
      </div>

      <div className="m-section-head"><span className="m-section-head-title">产品明细 ({order.orderItems.length})</span></div>
      {order.orderItems.map((it) => (
        <div key={it.id} className="m-card">
          <div className="m-card-header">
            <div className="m-card-title" style={{ fontSize: 15 }}>{it.displayName || it.productName}</div>
            <span className="m-amount">{formatCurrency(it.subtotal)}</span>
          </div>
          <div className="m-card-row"><span className="m-card-label">规格</span><span className="m-card-value">{it.spec || '—'}</span></div>
          <div className="m-card-row"><span className="m-card-label">数量</span><span className="m-card-value m-num">{it.quantity} {it.unit || ''}</span></div>
          {it.remark && <div style={{ fontSize: 12, color: '#64748b', marginTop: 6, lineHeight: 1.5 }}>{it.remark}</div>}
        </div>
      ))}

      {order.materials && order.materials.length > 0 && (
        <>
          <div className="m-section-head"><span className="m-section-head-title">物料状态 ({order.materials.length})</span></div>
          {order.materials.map((m) => (
            <div key={m.id} className="m-card">
              <div className="m-card-header">
                <div className="m-card-title" style={{ fontSize: 14 }}>{m.name}</div>
                <span className={`m-tag ${m.status === 'ready' ? 'success' : 'warning'}`}>
                  {m.status === 'ready' ? '已备齐' : m.status === 'in_progress' ? '备料中' : '待备料'}
                </span>
              </div>
              <div className="m-card-row"><span className="m-card-label">需求量</span><span className="m-card-value m-num">{m.required} {m.unit || ''}</span></div>
            </div>
          ))}
        </>
      )}

      <div className="m-form-actions">
        {order.status === 'pending_production' && (
          <button type="button" className="m-btn m-btn-primary" onClick={() => action('start_production', '开始生产')} style={{ flex: 1 }}>
            <PlayCircleOutlined /> 开始生产
          </button>
        )}
        {order.status === 'production' && (
          <button type="button" className="m-btn m-btn-primary" onClick={() => action('finish_production', '完成生产')} style={{ flex: 1 }}>
            <CheckCircleOutlined /> 完成生产
          </button>
        )}
        {(order.status !== 'pending_production' && order.status !== 'production') && (
          <button type="button" className="m-btn" onClick={() => back('production')} style={{ flex: 1 }}>返回</button>
        )}
      </div>
    </MobileLayout>
  );
}
