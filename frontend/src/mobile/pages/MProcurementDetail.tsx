import { useEffect, useState } from 'react';
import { Checkbox, DatePicker, Drawer, Form, Input, InputNumber, Modal, Select, Switch, message } from 'antd';
import dayjs from 'dayjs';
import {
  CheckCircleOutlined,
  CloudUploadOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  RocketOutlined,
  ThunderboltFilled,
} from '@ant-design/icons';
import { getApiErrorMessage, materialsApi, ordersApi, type AISuggestionGroup } from '../../api';
import type { Material, MaterialStatus, Order, User } from '../../types';
import { back } from '../router';
import { formatShortDate, formatWanCurrency, getDaysLeft } from '../../utils/order';
import MobileLayout from '../MobileLayout';
import MLoading from '../components/MLoading';
import MEmpty from '../components/MEmpty';
import MStatusTag from '../components/MStatusTag';

interface Props { orderId: number; user: User; }

const STATUS_LABEL: Record<MaterialStatus, string> = {
  pending: '待备料',
  in_progress: '备料中',
  ready: '已备齐',
};

export default function MProcurementDetail({ orderId, user }: Props) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<number | null>(null);
  const [editMat, setEditMat] = useState<Material | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiGroups, setAiGroups] = useState<AISuggestionGroup[]>([]);
  const [aiSelected, setAiSelected] = useState<Record<string, boolean>>({});
  const [aiSaving, setAiSaving] = useState(false);
  const [editForm] = Form.useForm();
  const [addForm] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const o = await ordersApi.get(orderId);
      setOrder(o);
    } catch (e) {
      message.error(getApiErrorMessage(e, '加载失败'));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [orderId]);

  if (loading || !order) {
    return (
      <MobileLayout title="采购详情" showBack user={user} activeModule="procurement" showTabBar={false}>
        {loading ? <MLoading /> : <MEmpty text="订单不存在" />}
      </MobileLayout>
    );
  }

  const totalMat = order.materialSummary?.total ?? order.materials.length;
  const readyMat = order.materialSummary?.ready ?? order.materials.filter((m) => m.status === 'ready').length;
  const allReady = totalMat > 0 && readyMat === totalMat;
  const daysLeft = getDaysLeft(order.deliveryDate);

  const updateMatStatus = async (mat: Material, status: MaterialStatus) => {
    setActing(mat.id);
    try {
      await materialsApi.update(mat.id, { status });
      const o = await ordersApi.get(orderId);
      setOrder(o);
    } catch (e) {
      message.error(getApiErrorMessage(e, '更新失败'));
    } finally {
      setActing(null);
    }
  };

  const toggleUrgent = async (mat: Material) => {
    setActing(mat.id);
    try {
      await materialsApi.update(mat.id, { urgent: !mat.urgent });
      const o = await ordersApi.get(orderId);
      setOrder(o);
    } catch (e) {
      message.error(getApiErrorMessage(e, '更新失败'));
    } finally {
      setActing(null);
    }
  };

  const removeMat = (mat: Material) => {
    Modal.confirm({
      title: `删除物料「${mat.name}」？`,
      okText: '删除', okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await materialsApi.delete(mat.id);
          message.success('已删除');
          void load();
        } catch (e) { message.error(getApiErrorMessage(e, '删除失败')); }
      },
    });
  };

  const openEdit = (mat: Material) => {
    editForm.setFieldsValue({
      name: mat.name,
      spec: mat.spec,
      unit: mat.unit,
      required: mat.required,
      expectedDate: mat.expectedDate ? dayjs(mat.expectedDate) : null,
      notes: mat.notes,
    });
    setEditMat(mat);
  };

  const saveEdit = async () => {
    if (!editMat) return;
    try {
      const values = await editForm.validateFields();
      const payload = {
        name: values.name,
        spec: values.spec,
        unit: values.unit,
        required: values.required,
        notes: values.notes,
        expectedDate: values.expectedDate ? values.expectedDate.format('YYYY-MM-DD') : null,
      };
      await materialsApi.update(editMat.id, payload);
      message.success('已更新');
      setEditMat(null);
      editForm.resetFields();
      void load();
    } catch (e) {
      const err = e as { errorFields?: unknown };
      if (err.errorFields) return;
      message.error(getApiErrorMessage(e, '更新失败'));
    }
  };

  const submitAdd = async () => {
    try {
      const values = await addForm.validateFields();
      await materialsApi.create({
        orderId: order.id,
        name: values.name,
        spec: values.spec,
        unit: values.unit,
        required: values.required,
        notes: values.notes,
      });
      message.success('已新增物料');
      setAddOpen(false);
      addForm.resetFields();
      void load();
    } catch (e) {
      const err = e as { errorFields?: unknown };
      if (err.errorFields) return;
      message.error(getApiErrorMessage(e, '新增失败'));
    }
  };

  const openAi = async () => {
    setAiOpen(true);
    setAiLoading(true);
    try {
      const { groups } = await materialsApi.aiSuggest(order.id);
      setAiGroups(groups);
      const init: Record<string, boolean> = {};
      groups.forEach((g) => g.materials.forEach((m, i) => { init[`${g.orderItemId}-${i}`] = true; }));
      setAiSelected(init);
    } catch (e) {
      message.error(getApiErrorMessage(e, 'AI 补全失败'));
      setAiOpen(false);
    } finally {
      setAiLoading(false);
    }
  };

  const applyAi = async () => {
    setAiSaving(true);
    try {
      const toCreate: Array<{ orderItemId: number; name: string; spec?: string; unit?: string; required: number; notes?: string }> = [];
      aiGroups.forEach((g) => g.materials.forEach((m, i) => {
        if (aiSelected[`${g.orderItemId}-${i}`] && m.name && m.estimatedQty != null) {
          toCreate.push({
            orderItemId: g.orderItemId,
            name: m.name,
            spec: m.spec,
            unit: m.unit,
            required: m.estimatedQty,
            notes: m.notes ? `[AI 建议] ${m.notes}` : '[AI 建议]',
          });
        }
      }));
      if (toCreate.length === 0) {
        message.warning('请至少勾选一项');
        setAiSaving(false);
        return;
      }
      for (const item of toCreate) {
        await materialsApi.create({ orderId: order.id, ...item });
      }
      message.success(`已新增 ${toCreate.length} 项物料`);
      setAiOpen(false);
      void load();
    } catch (e) {
      message.error(getApiErrorMessage(e, '保存失败'));
    } finally {
      setAiSaving(false);
    }
  };

  const queueProduction = () => {
    Modal.confirm({
      title: '排入生产',
      content: `「${order.contractNo || `#${order.id}`}」物料齐备，是否排入生产队列？`,
      okText: '排入',
      onOk: async () => {
        try {
          await ordersApi.action(order.id, 'queue_production');
          message.success('已排入生产');
          back('procurement');
        } catch (e) { message.error(getApiErrorMessage(e, '操作失败')); }
      },
    });
  };

  return (
    <MobileLayout title="采购详情" showBack user={user} activeModule="procurement" showTabBar={false}>
      {/* 头部 */}
      <div className="m-card">
        <div className="m-card-header" style={{ alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="m-order-code">{order.contractNo || order.contractRef || `#${order.id}`}</div>
            <div className="m-card-title" style={{ marginTop: 4 }}>{order.customer?.name}</div>
          </div>
          <MStatusTag status={order.status} />
        </div>
        <div className="m-card-divider" />
        <div className="m-card-row">
          <span className="m-card-label">物料进度</span>
          <span className="m-card-value m-num">{readyMat} / {totalMat}{allReady && ' ✓'}</span>
        </div>
        <div className="m-card-row">
          <span className="m-card-label">订单金额</span>
          <span className="m-amount">{formatWanCurrency(order.totalAmount)}</span>
        </div>
        <div className="m-card-row">
          <span className="m-card-label">交期</span>
          <span className={`m-card-value ${daysLeft < 0 ? 'm-order-due danger' : daysLeft <= 3 ? 'm-order-due warning' : ''}`}>
            {formatShortDate(order.deliveryDate)} · {daysLeft < 0 ? `逾期 ${Math.abs(daysLeft)} 天` : daysLeft === 0 ? '今日' : `${daysLeft} 天`}
          </span>
        </div>
      </div>

      {/* 操作按钮组 */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        <button type="button" className="m-ai-btn" onClick={openAi} style={{ flex: 1, height: 40 }}>
          <CloudUploadOutlined /> AI 智能补全物料
        </button>
        <button type="button" className="m-btn" onClick={() => setAddOpen(true)} style={{ minWidth: 80 }}>
          <PlusOutlined /> 新增
        </button>
      </div>

      {/* 物料卡片 */}
      <div className="m-section-head">
        <span className="m-section-head-title">物料明细 ({order.materials.length})</span>
      </div>
      {order.materials.length === 0 ? (
        <MEmpty text="暂无物料，点击 AI 智能补全或手动新增" />
      ) : (
        order.materials.map((mat) => (
          <div
            key={mat.id}
            className={`m-card ${mat.status === 'ready' ? 'm-card-rail-green' : mat.urgent ? 'm-card-rail-red' : ''}`}
          >
            <div className="m-card-header">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="m-card-title" style={{ fontSize: 15 }}>
                  {mat.name}
                  {mat.urgent && <ThunderboltFilled style={{ color: '#dc2626', marginLeft: 6 }} />}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                  {mat.orderItemDisplayName || ''}
                </div>
              </div>
              <span className={`m-tag ${mat.status === 'ready' ? 'success' : mat.urgent ? 'urgent' : 'warning'}`}>
                {STATUS_LABEL[mat.status]}
              </span>
            </div>
            <div className="m-card-row">
              <span className="m-card-label">规格</span>
              <span className="m-card-value">{mat.spec || '—'}</span>
            </div>
            <div className="m-card-row">
              <span className="m-card-label">需求量</span>
              <span className="m-card-value m-num">{mat.required} {mat.unit || ''}</span>
            </div>
            <div className="m-card-row">
              <span className="m-card-label">预计到货</span>
              <span className="m-card-value">{mat.expectedDate ? formatShortDate(mat.expectedDate) : '—'}</span>
            </div>
            {mat.notes && (
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 6, lineHeight: 1.5 }}>{mat.notes}</div>
            )}
            <div className="m-card-divider" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: '#475569' }}>已备齐</span>
              <Switch
                size="small"
                checked={mat.status === 'ready'}
                loading={acting === mat.id}
                onChange={(v) => updateMatStatus(mat, v ? 'ready' : 'in_progress')}
              />
              <span style={{ fontSize: 12, color: '#475569', marginLeft: 8 }}>紧急</span>
              <Switch
                size="small"
                checked={mat.urgent}
                loading={acting === mat.id}
                onChange={() => toggleUrgent(mat)}
              />
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                <button type="button" className="m-topbar-action" onClick={() => openEdit(mat)} aria-label="编辑"><EditOutlined /></button>
                <button type="button" className="m-topbar-action" onClick={() => removeMat(mat)} aria-label="删除"><DeleteOutlined /></button>
              </span>
            </div>
          </div>
        ))
      )}

      {/* 排入生产 */}
      {allReady && order.status === 'procurement' && (
        <button type="button" className="m-btn m-btn-primary" onClick={queueProduction} style={{ width: '100%', marginTop: 12 }}>
          <RocketOutlined /> 排入生产
        </button>
      )}

      {/* 编辑物料 Drawer */}
      <Drawer
        title="编辑物料"
        placement="bottom"
        height="auto"
        open={!!editMat}
        onClose={() => { setEditMat(null); editForm.resetFields(); }}
        styles={{ body: { padding: 16, paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' } }}
      >
        <Form form={editForm} layout="vertical" requiredMark={false}>
          <Form.Item name="name" label="物料名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input size="large" />
          </Form.Item>
          <Form.Item name="spec" label="规格"><Input size="large" /></Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Form.Item name="required" label="需求量" rules={[{ required: true, message: '请填写数量' }]}>
              <InputNumber size="large" style={{ width: '100%' }} min={0} />
            </Form.Item>
            <Form.Item name="unit" label="单位"><Input size="large" placeholder="个" /></Form.Item>
          </div>
          <Form.Item name="expectedDate" label="预计到货">
            <DatePicker size="large" style={{ width: '100%' }} inputReadOnly />
          </Form.Item>
          <Form.Item name="notes" label="备注"><Input.TextArea rows={2} /></Form.Item>
        </Form>
        <button type="button" className="m-btn m-btn-primary" onClick={saveEdit} style={{ width: '100%' }}>保存</button>
      </Drawer>

      {/* 新增物料 Drawer */}
      <Drawer
        title="新增物料"
        placement="bottom"
        height="auto"
        open={addOpen}
        onClose={() => { setAddOpen(false); addForm.resetFields(); }}
        styles={{ body: { padding: 16, paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' } }}
      >
        <Form form={addForm} layout="vertical" requiredMark={false}>
          <Form.Item name="name" label="物料名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input size="large" />
          </Form.Item>
          <Form.Item name="spec" label="规格"><Input size="large" /></Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Form.Item name="required" label="需求量" rules={[{ required: true, message: '请填写数量' }]}>
              <InputNumber size="large" style={{ width: '100%' }} min={0} />
            </Form.Item>
            <Form.Item name="unit" label="单位"><Input size="large" placeholder="个" /></Form.Item>
          </div>
          <Form.Item name="notes" label="备注"><Input.TextArea rows={2} /></Form.Item>
        </Form>
        <button type="button" className="m-btn m-btn-primary" onClick={submitAdd} style={{ width: '100%' }}>新增</button>
      </Drawer>

      {/* AI 智能补全 Drawer */}
      <Drawer
        title="AI 智能补全物料"
        placement="bottom"
        height="86%"
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        styles={{ body: { padding: 16, paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' } }}
      >
        {aiLoading ? <MLoading text="AI 解析中，请稍候…" /> : aiGroups.length === 0 ? (
          <MEmpty text="未生成建议" />
        ) : (
          <>
            {aiGroups.map((g) => (
              <div key={g.orderItemId} className="m-card">
                <div className="m-card-title" style={{ fontSize: 14 }}>{g.productName}</div>
                <div className="m-card-divider" />
                {g.materials.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>未识别出物料</div>
                ) : (
                  g.materials.map((m, i) => {
                    const key = `${g.orderItemId}-${i}`;
                    return (
                      <div key={key} style={{ display: 'flex', gap: 10, padding: '8px 0', borderTop: i > 0 ? '1px dashed #f1f5f9' : 0 }}>
                        <Checkbox
                          checked={!!aiSelected[key]}
                          onChange={(e) => setAiSelected({ ...aiSelected, [key]: e.target.checked })}
                          style={{ marginTop: 4 }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>{m.name}</div>
                          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                            {m.spec ? `${m.spec} · ` : ''}{m.estimatedQty ?? '?'} {m.unit || ''}
                          </div>
                          {m.notes && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{m.notes}</div>}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            ))}
            <button type="button" className="m-btn m-btn-primary" disabled={aiSaving} onClick={applyAi} style={{ width: '100%', marginTop: 12 }}>
              <CheckCircleOutlined /> {aiSaving ? '保存中…' : '应用所选'}
            </button>
          </>
        )}
      </Drawer>
    </MobileLayout>
  );
}
