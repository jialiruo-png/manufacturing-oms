import { useEffect, useState } from 'react';
import { Drawer, Form, Input, Select, Timeline, message } from 'antd';
import { CommentOutlined, EditOutlined, PhoneOutlined, SaveOutlined } from '@ant-design/icons';
import { customersApi, getApiErrorMessage } from '../../api';
import type { CommLog, Customer, Order, User } from '../../types';
import { formatDate, formatShortDate, formatWanCurrency } from '../../utils/order';
import { back, push } from '../router';
import MobileLayout from '../MobileLayout';
import MLoading from '../components/MLoading';
import MEmpty from '../components/MEmpty';
import MStatusTag from '../components/MStatusTag';

interface MCustomerDetailProps {
  mode: 'view' | 'new';
  customerId?: number;
  user: User;
}

const RATING_OPTIONS = [
  { value: 'A', label: 'A 优质' },
  { value: 'B', label: 'B 良好' },
  { value: 'C', label: 'C 一般' },
  { value: 'D', label: 'D 关注' },
];

export default function MCustomerDetail({ mode, customerId, user }: MCustomerDetailProps) {
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [logs, setLogs] = useState<CommLog[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [form] = Form.useForm<Partial<Customer>>();
  const [logForm] = Form.useForm<Partial<CommLog>>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (mode === 'new') {
      setCustomer(null);
      setLoading(false);
      setEditOpen(true);
      return;
    }
    if (!customerId) return;
    const load = async () => {
      setLoading(true);
      try {
        const res = await customersApi.get(customerId);
        setCustomer(res);
        setOrders(res.orders || []);
        setLogs(res.commLogs || []);
      } catch (e) {
        message.error(getApiErrorMessage(e, '加载客户失败'));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [mode, customerId]);

  const openEdit = () => {
    if (customer) form.setFieldsValue(customer);
    else form.resetFields();
    setEditOpen(true);
  };

  const saveCustomer = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      if (mode === 'new' || !customer) {
        const created = await customersApi.create(values);
        message.success('客户已创建');
        setEditOpen(false);
        push('customers', { id: created.id });
      } else {
        const updated = await customersApi.update(customer.id, values);
        setCustomer({ ...customer, ...updated });
        message.success('客户已更新');
        setEditOpen(false);
      }
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      message.error(msg || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const addLog = async () => {
    if (!customer) return;
    try {
      const values = await logForm.validateFields();
      setSaving(true);
      await customersApi.addLog(customer.id, values);
      const refreshed = await customersApi.get(customer.id);
      setLogs(refreshed.commLogs || []);
      message.success('沟通记录已添加');
      logForm.resetFields();
      setLogOpen(false);
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      message.error(msg || '添加失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <MobileLayout title="客户详情" showBack user={user} activeModule="customers" showTabBar={false}>
        <MLoading />
      </MobileLayout>
    );
  }

  if (mode === 'new' && !customer) {
    return (
      <MobileLayout title="新建客户" showBack user={user} activeModule="customers" showTabBar={false}>
        <Drawer
          title="新建客户"
          placement="bottom"
          height="86%"
          open
          onClose={() => back('customers')}
          styles={{ body: { padding: 16, paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' } }}
        >
          <CustomerForm form={form} />
          <button type="button" className="m-btn m-btn-primary" onClick={saveCustomer} disabled={saving} style={{ width: '100%', marginTop: 12 }}>
            {saving ? '保存中…' : '创建客户'}
          </button>
        </Drawer>
      </MobileLayout>
    );
  }

  if (!customer) {
    return (
      <MobileLayout title="客户详情" showBack user={user} activeModule="customers" showTabBar={false}>
        <MEmpty text="客户不存在" />
      </MobileLayout>
    );
  }

  return (
    <MobileLayout
      title={customer.name}
      showBack
      user={user}
      activeModule="customers"
      showTabBar={false}
      topRight={
        <button type="button" className="m-topbar-action" onClick={openEdit} aria-label="编辑">
          <EditOutlined />
        </button>
      }
    >
      <div className="m-card">
        <div className="m-card-header">
          <div className="m-card-title">基本信息</div>
          <span className={`m-tag ${customer.rating === 'A' ? 'success' : customer.rating === 'C' ? 'warning' : customer.rating === 'D' ? 'urgent' : ''}`}>
            {customer.rating ? `${customer.rating} 级` : '未评级'}
          </span>
        </div>
        <div className="m-card-row"><span className="m-card-label">联系人</span><span className="m-card-value">{customer.contact || '—'}</span></div>
        <div className="m-card-row">
          <span className="m-card-label"><PhoneOutlined /> 手机</span>
          <span className="m-card-value m-num">
            {customer.phone ? <a href={`tel:${customer.phone}`}>{customer.phone}</a> : '—'}
          </span>
        </div>
        <div className="m-card-row"><span className="m-card-label">业务员</span><span className="m-card-value">{customer.salespersonName || '未指派'}</span></div>
        {customer.address && (
          <div className="m-card-row"><span className="m-card-label">地址</span><span className="m-card-value" style={{ whiteSpace: 'normal', textAlign: 'right' }}>{customer.address}</span></div>
        )}
        {customer.notes && (
          <>
            <div className="m-card-divider" />
            <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>{customer.notes}</div>
          </>
        )}
      </div>

      <div className="m-section-head">
        <span className="m-section-head-title">历史订单 ({orders.length})</span>
      </div>
      {orders.length === 0 ? (
        <MEmpty text="暂无订单" />
      ) : (
        orders.slice(0, 10).map((o) => (
          <div key={o.id} className="m-card" onClick={() => push('sales', { id: o.id })}>
            <div className="m-card-header">
              <div style={{ minWidth: 0 }}>
                <div className="m-order-code">{o.contractNo || o.contractRef || `#${o.id}`}</div>
                <div style={{ fontSize: 13, color: '#475569', marginTop: 2 }}>
                  {formatShortDate(o.deliveryDate)}
                </div>
              </div>
              <MStatusTag status={o.status} />
            </div>
            <div className="m-card-footer">
              <span>{o.orderItems?.[0]?.displayName || o.orderItems?.[0]?.productName || '—'}</span>
              <span className="m-amount">{formatWanCurrency(o.totalAmount)}</span>
            </div>
          </div>
        ))
      )}

      <div className="m-section-head">
        <span className="m-section-head-title">沟通记录 ({logs.length})</span>
        <a className="m-section-head-link" onClick={() => setLogOpen(true)}>+ 新增</a>
      </div>
      {logs.length === 0 ? (
        <MEmpty text="暂无沟通记录" />
      ) : (
        <div className="m-card">
          <Timeline
            items={logs.slice().reverse().slice(0, 30).map((log) => ({
              children: (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {log.type || '沟通'} {log.outcome ? `· ${log.outcome}` : ''}
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                    {log.createdBy} · {formatDate(log.createdAt)}
                  </div>
                  {log.content && (
                    <div style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>{log.content}</div>
                  )}
                </div>
              ),
            }))}
          />
        </div>
      )}

      {/* 编辑客户 Drawer */}
      <Drawer
        title="编辑客户"
        placement="bottom"
        height="86%"
        open={editOpen}
        onClose={() => setEditOpen(false)}
        styles={{ body: { padding: 16, paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' } }}
      >
        <CustomerForm form={form} />
        <button type="button" className="m-btn m-btn-primary" onClick={saveCustomer} disabled={saving} style={{ width: '100%', marginTop: 12 }}>
          <SaveOutlined /> {saving ? '保存中…' : '保存'}
        </button>
      </Drawer>

      {/* 新增沟通记录 Drawer */}
      <Drawer
        title="新增沟通记录"
        placement="bottom"
        height="80%"
        open={logOpen}
        onClose={() => setLogOpen(false)}
        styles={{ body: { padding: 16, paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' } }}
      >
        <Form form={logForm} layout="vertical" requiredMark={false}>
          <Form.Item name="type" label="沟通方式" rules={[{ required: true, message: '请选择沟通方式' }]}>
            <Select size="large" options={[
              { value: '电话', label: '电话' },
              { value: '微信', label: '微信' },
              { value: '邮件', label: '邮件' },
              { value: '面谈', label: '面谈' },
              { value: '其他', label: '其他' },
            ]} placeholder="选择" />
          </Form.Item>
          <Form.Item name="outcome" label="沟通结果">
            <Select size="large" options={[
              { value: '已确认', label: '已确认' },
              { value: '待跟进', label: '待跟进' },
              { value: '无回应', label: '无回应' },
              { value: '其他', label: '其他' },
            ]} placeholder="选择（可选）" />
          </Form.Item>
          <Form.Item name="content" label="沟通内容" rules={[{ required: true, message: '请填写沟通内容' }]}>
            <Input.TextArea rows={4} placeholder="记录沟通详情" />
          </Form.Item>
        </Form>
        <button type="button" className="m-btn m-btn-primary" onClick={addLog} disabled={saving} style={{ width: '100%' }}>
          <CommentOutlined /> {saving ? '提交中…' : '提交记录'}
        </button>
      </Drawer>
    </MobileLayout>
  );
}

function CustomerForm({ form }: { form: import('antd').FormInstance<Partial<Customer>> }) {
  return (
    <Form form={form} layout="vertical" requiredMark={false}>
      <Form.Item name="name" label="客户名称" rules={[{ required: true, message: '请输入客户名' }]}>
        <Input size="large" />
      </Form.Item>
      <Form.Item name="contact" label="联系人">
        <Input size="large" />
      </Form.Item>
      <Form.Item name="phone" label="手机号">
        <Input size="large" inputMode="tel" />
      </Form.Item>
      <Form.Item name="email" label="邮箱">
        <Input size="large" inputMode="email" />
      </Form.Item>
      <Form.Item name="rating" label="客户评级">
        <Select size="large" options={RATING_OPTIONS} placeholder="选择" allowClear />
      </Form.Item>
      <Form.Item name="address" label="地址">
        <Input.TextArea rows={2} />
      </Form.Item>
      <Form.Item name="notes" label="备注">
        <Input.TextArea rows={2} />
      </Form.Item>
    </Form>
  );
}
