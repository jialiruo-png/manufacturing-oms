import { useEffect, useMemo, useRef, useState } from 'react';
import { Drawer, Form, Input, InputNumber, Modal, Radio, message } from 'antd';
import { EditOutlined, LoadingOutlined, PlusOutlined, SearchOutlined, SwapOutlined, DeleteOutlined } from '@ant-design/icons';
import { getApiErrorMessage, inventoryApi } from '../../api';
import type { InventoryItem, User } from '../../types';
import MobileLayout from '../MobileLayout';
import MEmpty from '../components/MEmpty';
import MLoading from '../components/MLoading';
import { usePullRefresh } from '../hooks/usePullRefresh';
import { formatDate } from '../../utils/order';

export default function MInventory({ user }: { user: User }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [list, setList] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [adjusting, setAdjusting] = useState<InventoryItem | null>(null);
  const [form] = Form.useForm();
  const [adjustForm] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      setList(await inventoryApi.list());
    } catch (e) {
      message.error(getApiErrorMessage(e, '加载库存失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);
  const { refreshing, pullDistance, bindProps } = usePullRefresh(scrollRef, load);

  const visible = useMemo(() => {
    const kw = search.trim().toLowerCase();
    if (!kw) return list;
    return list.filter((i) =>
      i.name.toLowerCase().includes(kw)
      || (i.spec || '').toLowerCase().includes(kw)
    );
  }, [list, search]);

  const openEdit = (it: InventoryItem) => {
    form.setFieldsValue(it);
    setEditing(it);
  };
  const openAdd = () => {
    form.resetFields();
    setAddOpen(true);
  };
  const save = async () => {
    try {
      const v = await form.validateFields();
      if (editing) {
        await inventoryApi.update(editing.id, v);
        message.success('已更新');
        setEditing(null);
      } else {
        await inventoryApi.create(v);
        message.success('已新增');
        setAddOpen(false);
      }
      form.resetFields();
      void load();
    } catch (e) {
      const err = e as { errorFields?: unknown };
      if (err.errorFields) return;
      message.error(getApiErrorMessage(e, '保存失败'));
    }
  };

  const openAdjust = (it: InventoryItem) => {
    adjustForm.setFieldsValue({ dir: 'in', delta: 0 });
    setAdjusting(it);
  };
  const submitAdjust = async () => {
    if (!adjusting) return;
    try {
      const { dir, delta } = await adjustForm.validateFields();
      const n = Math.abs(Number(delta) || 0);
      if (n <= 0) { message.warning('请输入大于 0 的数量'); return; }
      await inventoryApi.adjust(adjusting.id, dir === 'in' ? n : -n);
      message.success('已调整');
      setAdjusting(null);
      adjustForm.resetFields();
      void load();
    } catch (e) {
      const err = e as { errorFields?: unknown };
      if (err.errorFields) return;
      message.error(getApiErrorMessage(e, '调整失败'));
    }
  };

  const remove = (it: InventoryItem) => {
    Modal.confirm({
      title: `删除「${it.name}」？`,
      okText: '删除', okButtonProps: { danger: true },
      onOk: async () => {
        try { await inventoryApi.delete(it.id); message.success('已删除'); void load(); }
        catch (e) { message.error(getApiErrorMessage(e, '删除失败')); }
      },
    });
  };

  return (
    <MobileLayout title="库存台账" user={user} activeModule="inventory">
      <div {...bindProps}>
        <div className="m-pull-indicator" style={{ height: refreshing ? 32 : pullDistance }}>
          {refreshing ? <><LoadingOutlined spin /> <span style={{ marginLeft: 6 }}>刷新中…</span></> : pullDistance > 0 ? (pullDistance >= 60 ? '松开刷新' : '下拉刷新') : null}
        </div>
        <div className="m-search-bar">
          <SearchOutlined />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="物料名 / 规格" inputMode="search" />
          {search && <a onClick={() => setSearch('')} style={{ fontSize: 12, color: '#94a3b8' }}>清除</a>}
        </div>
        {loading ? <MLoading /> : visible.length === 0 ? <MEmpty text="暂无库存数据" /> : (
          <>
            {visible.map((it) => {
              const low = it.quantity <= it.safetyStock;
              return (
                <div key={it.id} className={`m-card ${low ? 'm-card-rail-amber' : ''}`}>
                  <div className="m-card-header">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="m-card-title" style={{ fontSize: 15 }}>{it.name}</div>
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{it.spec || '—'}</div>
                    </div>
                    <span className={`m-tag ${low ? 'warning' : 'success'}`}>{low ? '低于安全' : '充足'}</span>
                  </div>
                  <div className="m-card-row">
                    <span className="m-card-label">当前库存</span>
                    <span className="m-amount m-num">{it.quantity} {it.unit || ''}</span>
                  </div>
                  <div className="m-card-row">
                    <span className="m-card-label">安全库存</span>
                    <span className="m-card-value m-num">{it.safetyStock} {it.unit || ''}</span>
                  </div>
                  <div className="m-card-row">
                    <span className="m-card-label">最近更新</span>
                    <span className="m-card-value">{formatDate(it.updatedAt)}</span>
                  </div>
                  {it.notes && (
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>{it.notes}</div>
                  )}
                  <div className="m-card-divider" />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="m-btn" style={{ flex: 1, minHeight: 40 }} onClick={() => openAdjust(it)}>
                      <SwapOutlined /> 入库 / 出库
                    </button>
                    <button type="button" className="m-btn" style={{ minWidth: 56, minHeight: 40 }} onClick={() => openEdit(it)}><EditOutlined /></button>
                    <button type="button" className="m-btn m-btn-danger" style={{ minWidth: 56, minHeight: 40 }} onClick={() => remove(it)}><DeleteOutlined /></button>
                  </div>
                </div>
              );
            })}
            <div className="m-list-end">共 {visible.length} 项</div>
          </>
        )}
      </div>

      <button type="button" className="m-fab" onClick={openAdd} aria-label="新增物料">
        <PlusOutlined />
      </button>

      {/* 新增 / 编辑 */}
      <Drawer
        title={editing ? '编辑物料' : '新增物料'}
        placement="bottom"
        height="auto"
        open={!!editing || addOpen}
        onClose={() => { setEditing(null); setAddOpen(false); form.resetFields(); }}
        styles={{ body: { padding: 16, paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' } }}
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item name="name" label="物料名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input size="large" />
          </Form.Item>
          <Form.Item name="spec" label="规格"><Input size="large" /></Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <Form.Item name="quantity" label="库存" rules={[{ required: true, message: '请填写' }]}>
              <InputNumber size="large" style={{ width: '100%' }} min={0} />
            </Form.Item>
            <Form.Item name="safetyStock" label="安全库存">
              <InputNumber size="large" style={{ width: '100%' }} min={0} />
            </Form.Item>
            <Form.Item name="unit" label="单位"><Input size="large" /></Form.Item>
          </div>
          <Form.Item name="notes" label="备注"><Input.TextArea rows={2} /></Form.Item>
        </Form>
        <button type="button" className="m-btn m-btn-primary" onClick={save} style={{ width: '100%' }}>
          {editing ? '保存' : '新增'}
        </button>
      </Drawer>

      {/* 入库/出库 */}
      <Drawer
        title={adjusting ? `${adjusting.name} · 调整库存` : '调整库存'}
        placement="bottom"
        height="auto"
        open={!!adjusting}
        onClose={() => { setAdjusting(null); adjustForm.resetFields(); }}
        styles={{ body: { padding: 16, paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' } }}
      >
        <Form form={adjustForm} layout="vertical" requiredMark={false} initialValues={{ dir: 'in' }}>
          <Form.Item name="dir" label="方向" rules={[{ required: true }]}>
            <Radio.Group size="large" buttonStyle="solid">
              <Radio.Button value="in">入库 (+)</Radio.Button>
              <Radio.Button value="out">出库 (-)</Radio.Button>
            </Radio.Group>
          </Form.Item>
          <Form.Item name="delta" label="数量" rules={[{ required: true, message: '请输入数量' }]}>
            <InputNumber size="large" style={{ width: '100%' }} min={1} />
          </Form.Item>
        </Form>
        <button type="button" className="m-btn m-btn-primary" onClick={submitAdjust} style={{ width: '100%' }}>
          确认调整
        </button>
      </Drawer>
    </MobileLayout>
  );
}
