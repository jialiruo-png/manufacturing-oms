import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { AutoComplete, DatePicker, Modal, Select, Switch, message } from 'antd';
import {
  CloudUploadOutlined,
  DeleteOutlined,
  PlusOutlined,
  SendOutlined,
} from '@ant-design/icons';
import { customersApi, ordersApi, productsApi, usersApi, getApiErrorMessage } from '../../api';
import type { Customer, CustomerSearchResult, Order, OrderItem, Product, User } from '../../types';
import { canCreateOrder } from '../../utils/permissions';
import { back } from '../router';
import MobileLayout from '../MobileLayout';
import MLoading from '../components/MLoading';
import MSalesFormExcel from './MSalesFormExcel';
import type { ParsedExcelItem } from '../../api';

interface ItemRow {
  productId?: number | null;
  productName: string;
  spec?: string;
  unit?: string;
  quantity: number;
  unitPrice: number;
  remark?: string;
}

interface MSalesFormProps {
  mode: 'new' | 'edit';
  orderId?: number;
  user: User;
}

export default function MSalesForm({ mode, orderId, user }: MSalesFormProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [excelOpen, setExcelOpen] = useState(false);

  const [customerSearch, setCustomerSearch] = useState('');
  const [customerOptions, setCustomerOptions] = useState<CustomerSearchResult[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSearchResult | null>(null);
  const [contractRef, setContractRef] = useState('');
  const [deliveryDate, setDeliveryDate] = useState<dayjs.Dayjs | null>(null);
  const [notes, setNotes] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [urgentReason, setUrgentReason] = useState('');
  const [salespersonId, setSalespersonId] = useState<number | undefined>();
  const [items, setItems] = useState<ItemRow[]>([{ productName: '', quantity: 0, unitPrice: 0 }]);

  const [products, setProducts] = useState<Product[]>([]);
  const [salespersons, setSalespersons] = useState<User[]>([]);
  const canAssignSalesperson = user.isAdmin || user.canManageUsers || user.canCreateOrderForSales;

  // 初始加载：edit 模式拉取订单
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const [prodList, salesList] = await Promise.all([
          productsApi.list(),
          canAssignSalesperson ? usersApi.list({ role: 'sales', status: 'enabled' }) : Promise.resolve([] as User[]),
        ]);
        setProducts(prodList);
        setSalespersons(salesList);
        if (mode === 'edit' && orderId) {
          const order = await ordersApi.get(orderId);
          // 待审批必须先撤回
          if (order.status === 'pending_approval') {
            try { await ordersApi.action(order.id, 'withdraw', '业务员编辑自动撤回'); }
            catch { message.warning('订单仍在审批中，无法编辑'); back('sales'); return; }
          }
          setSelectedCustomer({
            id: order.customer.id,
            name: order.customer.name,
            contact: order.customer.contact,
            phone: order.customer.phone || '',
          });
          setCustomerSearch(order.customer.name);
          setContractRef(order.contractRef || '');
          setDeliveryDate(order.deliveryDate ? dayjs(order.deliveryDate) : null);
          setNotes(order.notes || '');
          setUrgent(!!order.urgent);
          setUrgentReason(order.urgentReason || '');
          setSalespersonId(order.salespersonId ?? undefined);
          setItems(order.orderItems.map(toRow));
        } else if (!canAssignSalesperson) {
          setSalespersonId(undefined);
        }
      } catch (e) {
        message.error(getApiErrorMessage(e, '加载失败'));
      } finally {
        setLoading(false);
      }
    };
    void init();
    // eslint-disable-next-line
  }, [mode, orderId]);

  // 客户搜索（防抖 300ms）
  useEffect(() => {
    if (!customerSearch || (selectedCustomer && selectedCustomer.name === customerSearch)) return;
    const t = setTimeout(async () => {
      try {
        const list = await customersApi.search(customerSearch);
        setCustomerOptions(list);
      } catch {/* ignore */}
    }, 300);
    return () => clearTimeout(t);
  }, [customerSearch, selectedCustomer]);

  const updateItem = (i: number, patch: Partial<ItemRow>) => {
    setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  };
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));
  const addItem = () => setItems((prev) => [...prev, { productName: '', quantity: 0, unitPrice: 0 }]);

  const total = useMemo(() => items.reduce((s, it) => s + (it.quantity || 0) * (it.unitPrice || 0), 0), [items]);
  const validItems = useMemo(() => items.filter((it) => it.productName.trim() && it.quantity > 0), [items]);

  const handleApplyExcel = (data: { contractRef?: string; deliveryDate?: string; customerName?: string; items: ParsedExcelItem[]; previewHash?: string }) => {
    if (data.contractRef) setContractRef(data.contractRef);
    if (data.deliveryDate) setDeliveryDate(dayjs(data.deliveryDate));
    if (data.customerName && !selectedCustomer) {
      setCustomerSearch(data.customerName);
    }
    setItems(
      data.items.map((it) => ({
        productName: it.productName,
        spec: it.spec,
        unit: it.unit,
        quantity: it.quantity || 0,
        unitPrice: it.unitPrice || 0,
        remark: it.remark,
      })),
    );
    message.success(`已应用 ${data.items.length} 项明细`);
  };

  const ensureCustomer = async (): Promise<Customer | null> => {
    if (selectedCustomer) {
      // 已选客户但只是搜索结果（无完整信息），需要补全或直接使用 id
      return await customersApi.get(selectedCustomer.id);
    }
    if (!customerSearch.trim()) return null;
    // 不存在该客户名 → 弹确认是否新建
    const name = customerSearch.trim();
    return await new Promise((resolve) => {
      Modal.confirm({
        title: '客户不存在',
        content: `是否创建新客户「${name}」？`,
        okText: '创建',
        cancelText: '取消',
        onOk: async () => {
          try {
            const c = await customersApi.create({ name, salespersonId: salespersonId ?? user.id });
            resolve(c as Customer);
          } catch (e) {
            message.error(getApiErrorMessage(e, '创建客户失败'));
            resolve(null);
          }
        },
        onCancel: () => resolve(null),
      });
    });
  };

  const handleSubmit = async (asDraft: boolean) => {
    if (!customerSearch.trim()) { message.warning('请填写客户'); return; }
    if (!deliveryDate) { message.warning('请选择交货日期'); return; }
    if (validItems.length === 0) { message.warning('请至少填写一项产品明细'); return; }
    if (urgent && !urgentReason.trim()) { message.warning('请填写加急原因'); return; }
    setSaving(true);
    try {
      const customer = await ensureCustomer();
      if (!customer) { setSaving(false); return; }
      const payload = {
        customerId: customer.id,
        salespersonId: salespersonId,
        deliveryDate: deliveryDate.format('YYYY-MM-DD'),
        notes,
        contractRef,
        urgent,
        urgentReason: urgent ? urgentReason : '',
        items: validItems.map((it) => ({
          productId: it.productId ?? null,
          productName: it.productName,
          spec: it.spec || '',
          customerBrand: '',
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          remark: it.remark || '',
        })),
      };
      let savedOrder: Order;
      if (mode === 'edit' && orderId) {
        savedOrder = await ordersApi.update(orderId, payload);
      } else {
        savedOrder = await ordersApi.create(payload);
      }
      if (!asDraft) {
        await ordersApi.action(savedOrder.id, 'submit');
        message.success('已提交审批');
      } else {
        message.success(mode === 'edit' ? '已保存' : '草稿已保存');
      }
      back('sales');
    } catch (e) {
      message.error(getApiErrorMessage(e, '保存失败'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <MobileLayout title={mode === 'edit' ? '编辑订单' : '新建订单'} showBack user={user} activeModule="sales" showTabBar={false}>
        <MLoading />
      </MobileLayout>
    );
  }

  return (
    <MobileLayout
      title={mode === 'edit' ? '编辑订单' : '新建订单'}
      showBack
      user={user}
      activeModule="sales"
      showTabBar={false}
    >
      {/* 客户 */}
      <div className="m-card">
        <div className="m-card-title" style={{ fontSize: 14, marginBottom: 10 }}>客户信息</div>
        <div className="m-form-field">
          <label className="m-form-label">客户名称 *</label>
          <AutoComplete
            value={customerSearch}
            options={customerOptions.map((c) => ({ value: c.name, label: `${c.name}${c.contact ? ' · ' + c.contact : ''}`, ext: c }))}
            onSearch={(v) => { setCustomerSearch(v); setSelectedCustomer(null); }}
            onSelect={(v, opt) => {
              setCustomerSearch(v);
              const o = opt as unknown as { ext: CustomerSearchResult };
              setSelectedCustomer(o.ext);
            }}
            placeholder="输入客户名搜索 / 新建"
            size="large"
            style={{ width: '100%' }}
          />
        </div>
        <div className="m-form-field">
          <label className="m-form-label">合同号</label>
          <input className="m-form-input" value={contractRef} onChange={(e) => setContractRef(e.target.value)} placeholder="可选" />
        </div>
        {canAssignSalesperson && (
          <div className="m-form-field">
            <label className="m-form-label">业务员</label>
            <Select
              size="large"
              style={{ width: '100%' }}
              placeholder="选择业务员"
              value={salespersonId}
              onChange={setSalespersonId}
              options={salespersons.map((s) => ({ value: s.id, label: s.name }))}
              showSearch
              optionFilterProp="label"
            />
          </div>
        )}
        <div className="m-form-field">
          <label className="m-form-label">交货日期 *</label>
          <DatePicker
            value={deliveryDate}
            onChange={setDeliveryDate}
            size="large"
            style={{ width: '100%' }}
            inputReadOnly
          />
        </div>
        <div className="m-form-field" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <label className="m-form-label">加急订单</label>
          <Switch checked={urgent} onChange={setUrgent} />
        </div>
        {urgent && (
          <div className="m-form-field">
            <label className="m-form-label">加急原因 *</label>
            <input className="m-form-input" value={urgentReason} onChange={(e) => setUrgentReason(e.target.value)} placeholder="请说明加急原因" />
          </div>
        )}
      </div>

      {/* Excel AI */}
      {canCreateOrder(user) && (
        <button
          type="button"
          className="m-ai-btn"
          onClick={() => setExcelOpen(true)}
          style={{ width: '100%', marginBottom: 10, height: 40 }}
        >
          <CloudUploadOutlined /> Excel / 图片 AI 智能解析
        </button>
      )}

      {/* 明细 */}
      <div className="m-section-head">
        <span className="m-section-head-title">产品明细</span>
        <a className="m-section-head-link" onClick={addItem}>+ 添加</a>
      </div>
      {items.map((it, i) => (
        <div key={i} className="m-card">
          <div className="m-card-header">
            <div className="m-card-title" style={{ fontSize: 14 }}>明细 {i + 1}</div>
            {items.length > 1 && (
              <button type="button" className="m-topbar-back" onClick={() => removeItem(i)} aria-label="删除"><DeleteOutlined /></button>
            )}
          </div>
          <div className="m-form-field">
            <label className="m-form-label">产品名称 *</label>
            <AutoComplete
              value={it.productName}
              options={products.map((p) => ({ value: p.name, label: `${p.code} · ${p.name}`, ext: p }))}
              onSearch={(v) => updateItem(i, { productName: v, productId: null })}
              onSelect={(v, opt) => {
                const o = opt as unknown as { ext: Product };
                updateItem(i, { productName: v, productId: o.ext.id, unitPrice: o.ext.unitPrice });
              }}
              size="large"
              style={{ width: '100%' }}
              placeholder="搜索或输入产品名"
            />
          </div>
          <div className="m-form-field">
            <label className="m-form-label">规格</label>
            <input className="m-form-input" value={it.spec || ''} onChange={(e) => updateItem(i, { spec: e.target.value })} placeholder="可选" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <div className="m-form-field">
              <label className="m-form-label">数量 *</label>
              <input className="m-form-input" type="number" inputMode="decimal" value={it.quantity || ''} onChange={(e) => updateItem(i, { quantity: Number(e.target.value) || 0 })} />
            </div>
            <div className="m-form-field">
              <label className="m-form-label">单位</label>
              <input className="m-form-input" value={it.unit || ''} onChange={(e) => updateItem(i, { unit: e.target.value })} placeholder="个" />
            </div>
            <div className="m-form-field">
              <label className="m-form-label">单价 *</label>
              <input className="m-form-input" type="number" inputMode="decimal" value={it.unitPrice || ''} onChange={(e) => updateItem(i, { unitPrice: Number(e.target.value) || 0 })} />
            </div>
          </div>
          <div className="m-form-field">
            <label className="m-form-label">备注</label>
            <input className="m-form-input" value={it.remark || ''} onChange={(e) => updateItem(i, { remark: e.target.value })} />
          </div>
          <div style={{ textAlign: 'right', fontSize: 13, color: '#475569' }}>
            小计：<span className="m-amount" style={{ fontSize: 15 }}>¥ {((it.quantity || 0) * (it.unitPrice || 0)).toFixed(2)}</span>
          </div>
        </div>
      ))}

      <button type="button" className="m-btn" onClick={addItem} style={{ width: '100%' }}>
        <PlusOutlined /> 继续添加明细
      </button>

      {/* 备注 */}
      <div className="m-card" style={{ marginTop: 12 }}>
        <div className="m-card-title" style={{ fontSize: 14, marginBottom: 10 }}>订单备注</div>
        <textarea className="m-form-textarea" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="补充说明（可选）" />
      </div>

      <div className="m-card" style={{ marginTop: 4 }}>
        <div className="m-card-row">
          <span className="m-card-label">订单金额</span>
          <span className="m-amount" style={{ fontSize: 18 }}>¥ {total.toFixed(2)}</span>
        </div>
      </div>

      <div className="m-form-actions">
        <button type="button" className="m-btn" disabled={saving} onClick={() => handleSubmit(true)}>
          保存草稿
        </button>
        <button type="button" className="m-btn m-btn-primary" disabled={saving} onClick={() => handleSubmit(false)}>
          <SendOutlined /> {saving ? '保存中…' : '提交审批'}
        </button>
      </div>

      <MSalesFormExcel
        open={excelOpen}
        onClose={() => setExcelOpen(false)}
        onApply={handleApplyExcel}
      />
    </MobileLayout>
  );
}

function toRow(it: OrderItem): ItemRow {
  return {
    productId: it.productId,
    productName: it.displayName || it.productName,
    spec: it.spec,
    unit: it.unit,
    quantity: it.quantity,
    unitPrice: it.unitPrice,
    remark: it.remark,
  };
}
