import { useEffect, useState } from 'react';
import { Drawer, Form, Input, Select, message } from 'antd';
import { CarOutlined, SendOutlined } from '@ant-design/icons';
import { getApiErrorMessage, ordersApi } from '../../api';
import type { Order, User } from '../../types';
import { back } from '../router';
import { formatCurrency, formatDate, formatShortDate, formatWanCurrency, getDaysLeft } from '../../utils/order';
import MobileLayout from '../MobileLayout';
import MLoading from '../components/MLoading';
import MEmpty from '../components/MEmpty';
import MStatusTag from '../components/MStatusTag';

const CARRIERS = [
  { value: '顺丰', label: '顺丰快递' },
  { value: '京东', label: '京东物流' },
  { value: '中通', label: '中通快递' },
  { value: '德邦', label: '德邦物流' },
  { value: '其他', label: '其他' },
];

function parseShipInfo(order: Order) {
  const log = order.approvalLog?.slice().reverse().find((l) => l.action === 'ship');
  if (!log?.reason) return { carrier: '', trackingNo: '', note: '', date: '' };
  const parts = log.reason.split('|').map((p) => p.trim());
  const carrier = parts.find((p) => p.startsWith('承运商:'))?.slice(4).trim() ?? '';
  const trackingNo = parts.find((p) => p.startsWith('运单号:'))?.slice(4).trim() ?? '';
  const note = parts.find((p) => !p.startsWith('承运商:') && !p.startsWith('运单号:')) ?? '';
  return { carrier, trackingNo, note, date: log.createdAt };
}

export default function MLogisticsDetail({ orderId, user }: { orderId: number; user: User }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [shipOpen, setShipOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try { setOrder(await ordersApi.get(orderId)); }
    catch (e) { message.error(getApiErrorMessage(e, '加载失败')); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [orderId]);

  if (loading || !order) {
    return (
      <MobileLayout title="物流详情" showBack user={user} activeModule="logistics" showTabBar={false}>
        {loading ? <MLoading /> : <MEmpty text="订单不存在" />}
      </MobileLayout>
    );
  }

  const info = parseShipInfo(order);
  const daysLeft = getDaysLeft(order.deliveryDate);
  const dueClass = daysLeft < 0 ? 'danger' : daysLeft <= 3 ? 'warning' : '';

  const submitShip = async () => {
    try {
      const values = await form.validateFields();
      const noteParts = [
        values.carrier && `承运商: ${values.carrier}`,
        values.trackingNo && `运单号: ${values.trackingNo}`,
        values.note,
      ].filter(Boolean);
      setSaving(true);
      await ordersApi.action(order.id, 'ship', noteParts.join(' | '));
      message.success('已提交发货');
      setShipOpen(false);
      back('logistics');
    } catch (e) {
      const err = e as { errorFields?: unknown };
      if (err.errorFields) return;
      message.error(getApiErrorMessage(e, '发货失败'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <MobileLayout title="物流详情" showBack user={user} activeModule="logistics" showTabBar={false}>
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
        <div className="m-card-row"><span className="m-card-label">收货地址</span>
          <span className="m-card-value" style={{ whiteSpace: 'normal', textAlign: 'right' }}>{order.customer?.contact || '—'}</span>
        </div>
      </div>

      {/* 已发货：显示物流信息 */}
      {(info.carrier || info.trackingNo) && (
        <div className="m-card">
          <div className="m-card-title" style={{ fontSize: 14, marginBottom: 10 }}>物流信息</div>
          <div className="m-card-row"><span className="m-card-label">承运商</span><span className="m-card-value">{info.carrier || '—'}</span></div>
          <div className="m-card-row">
            <span className="m-card-label">运单号</span>
            <span className="m-card-value" style={{ color: '#2f66ff', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}>{info.trackingNo || '—'}</span>
          </div>
          {info.note && (
            <div className="m-card-row"><span className="m-card-label">备注</span><span className="m-card-value">{info.note}</span></div>
          )}
          {info.date && (
            <div className="m-card-row"><span className="m-card-label">发货时间</span><span className="m-card-value">{formatDate(info.date)}</span></div>
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
        </div>
      ))}

      <div className="m-form-actions">
        {order.status === 'ready_ship' && (
          <button type="button" className="m-btn m-btn-primary" onClick={() => setShipOpen(true)} style={{ flex: 1 }}>
            <SendOutlined /> 安排发货
          </button>
        )}
        {order.status !== 'ready_ship' && (
          <button type="button" className="m-btn" onClick={() => back('logistics')} style={{ flex: 1 }}>返回</button>
        )}
      </div>

      {/* 发货 Drawer */}
      <Drawer
        title="安排发货"
        placement="bottom"
        height="auto"
        open={shipOpen}
        onClose={() => setShipOpen(false)}
        styles={{ body: { padding: 16, paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' } }}
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item name="carrier" label="承运商" rules={[{ required: true, message: '请选择承运商' }]}>
            <Select size="large" options={CARRIERS} placeholder="选择承运商" />
          </Form.Item>
          <Form.Item name="trackingNo" label="运单号" rules={[{ required: true, message: '请输入运单号' }]}>
            <Input size="large" placeholder="例如 SF12345678" />
          </Form.Item>
          <Form.Item name="note" label="备注">
            <Input.TextArea rows={2} placeholder="可填写发货说明（可选）" />
          </Form.Item>
        </Form>
        <button type="button" className="m-btn m-btn-primary" onClick={submitShip} disabled={saving} style={{ width: '100%' }}>
          <CarOutlined /> {saving ? '提交中…' : '确认发货'}
        </button>
      </Drawer>
    </MobileLayout>
  );
}
