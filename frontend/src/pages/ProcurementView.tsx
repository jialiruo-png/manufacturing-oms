import { useEffect, useState, type ReactNode } from 'react';
import { Button, Tabs, Table, Tag, Space, Modal, Form, Input, InputNumber, Select, Switch, Typography, Popconfirm, Pagination, Skeleton, message } from 'antd';
import { CheckOutlined, CloseOutlined, ThunderboltOutlined, WarningOutlined } from '@ant-design/icons';
import type { TableColumnsType } from 'antd';
import { getApiErrorMessage, ordersApi, materialsApi, inventoryApi, type AISuggestionGroup } from '../api';
import type { DataChangeHandler, Order, Material, InventoryItem } from '../types';
import { Empty } from '../components/ui';
import dayjs from 'dayjs';
import { formatDate, formatShortDate, getOrderProductSummary, getOrderQuantity } from '../utils/order';

const { Text } = Typography;
type ProcurementTab = 'orders' | 'completed' | 'inventory';
type InventoryStatusFilter = 'all' | 'normal' | 'low' | 'noSafety';
type TimeRangeKey = '1m' | '3m' | '6m' | '1y';
const COMPLETED_PROCUREMENT_STATUSES = 'pending_production,production,pending_ship_approval,ready_ship,shipped';
const PURCHASE_FILTER_RANGE_WIDTH = 180;
const PURCHASE_FILTER_SEARCH_WIDTH = 440;

const TIME_RANGE_OPTIONS: { label: string; value: TimeRangeKey }[] = [
  { label: '近一个月', value: '1m' },
  { label: '近三个月', value: '3m' },
  { label: '近六个月', value: '6m' },
  { label: '近一年', value: '1y' },
];

function PurchaseFilterBar({
  search,
  onSearchChange,
  placeholder,
  range,
  onRangeChange,
  children,
  extra,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  placeholder: string;
  range?: TimeRangeKey;
  onRangeChange?: (value: TimeRangeKey) => void;
  children?: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <div className="ymt-filter-bar">
      {range && onRangeChange && (
        <label className="ymt-filter ymt-time-filter">
          <span className="ymt-filter-label">时间范围</span>
          <span className="ymt-filter-value">{TIME_RANGE_OPTIONS.find((o) => o.value === range)?.label}</span>
          <svg className="ymt-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <select className="ymt-select-native" value={range} onChange={(e) => onRangeChange(e.target.value as TimeRangeKey)}>
            {TIME_RANGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      )}
      <label className="ymt-filter ymt-search-filter">
        <svg className="ymt-search-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" /><path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        <input
          className="ymt-search-text"
          placeholder={placeholder}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </label>
      {children}
      {extra}
    </div>
  );
}

export default function ProcurementView({
  refreshKey = 0,
  onDataChanged,
}: {
  refreshKey?: number;
  onDataChanged: DataChangeHandler;
}) {
  const [subTab, setSubTab]           = useState<ProcurementTab>('orders');
  const [orders, setOrders]           = useState<Order[]>([]);
  const [orderTotal, setOrderTotal]   = useState(0);
  const [orderPage, setOrderPage]     = useState(1);
  const [orderPageSize, setOrderPageSize] = useState(20);
  const [orderSearch, setOrderSearch] = useState('');
  const [orderRange, setOrderRange] = useState<TimeRangeKey>('1m');
  const [completedOrders, setCompletedOrders] = useState<Order[]>([]);
  const [completedTotal, setCompletedTotal] = useState(0);
  const [completedPage, setCompletedPage] = useState(1);
  const [completedPageSize, setCompletedPageSize] = useState(20);
  const [completedSearch, setCompletedSearch] = useState('');
  const [completedRange, setCompletedRange] = useState<TimeRangeKey>('1m');
  const [inventory, setInventory]     = useState<InventoryItem[]>([]);
  const [inventoryPage, setInventoryPage] = useState(1);
  const [inventoryPageSize, setInventoryPageSize] = useState(20);
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryStatus, setInventoryStatus] = useState<InventoryStatusFilter>('all');
  const [loading, setLoading]         = useState(true);
  const [expanded, setExpanded]       = useState<Set<number>>(new Set());
  const [loadingOrderDetail, setLoadingOrderDetail] = useState<number | null>(null);
  const [editingMat, setEditingMat]   = useState<number | null>(null);
  const [matForm, setMatForm]         = useState({ expectedDate: '', notes: '', name: '', spec: '', unit: '', required: 0 });
  const [markingAll, setMarkingAll]   = useState<number | null>(null);
  const [updatingMatStatus, setUpdatingMatStatus] = useState<number | null>(null);
  const [addMatModal, setAddMatModal] = useState<Order | null>(null);
  const [savingMat, setSavingMat]     = useState(false);
  const [addMatForm]                  = Form.useForm();
  const [editMatModal, setEditMatModal] = useState<{ order: Order; material: Material } | null>(null);
  const [editMatForm]                   = Form.useForm();
  // AI 物料建议（辅助功能，采购勾选后才入库）
  const [aiSuggestModal, setAiSuggestModal] = useState<{ order: Order; groups: AISuggestionGroup[]; selected: Record<string, boolean> } | null>(null);
  const [aiSuggestLoading, setAiSuggestLoading] = useState<number | null>(null);
  const [aiSuggestSaving, setAiSuggestSaving] = useState(false);

  const [invModal, setInvModal]       = useState(false);
  const [editingInv, setEditingInv]   = useState<InventoryItem | null>(null);
  const [savingInv, setSavingInv]     = useState(false);
  const [adjustModal, setAdjustModal] = useState<InventoryItem | null>(null);
  const [adjustDir, setAdjustDir]     = useState<'in' | 'out'>('in');
  const [invForm]  = Form.useForm();
  const [adjForm]  = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const [ord, completed, inv] = await Promise.all([
        ordersApi.listPaged({ status: 'procurement', page: orderPage, pageSize: orderPageSize }),
        ordersApi.listPaged({
          status: COMPLETED_PROCUREMENT_STATUSES,
          range: '1m',
          sort: 'createdAt_desc',
          page: completedPage,
          pageSize: completedPageSize,
        }),
        inventoryApi.list(),
      ]);
      setOrders(ord.data);
      setOrderTotal(ord.total);
      setCompletedOrders(completed.data);
      setCompletedTotal(completed.total);
      setInventory(inv);
      if (ord.data.length === 1) setExpanded(new Set([ord.data[0].id]));
    } catch (err) {
      console.error('采购页加载失败', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [orderPage, orderPageSize, completedPage, completedPageSize, refreshKey]);

  const invMap = new Map<string, InventoryItem>();
  for (const item of inventory) invMap.set(item.name.trim().toLowerCase(), item);

  const handleOrderExpand = async (order: Order, shouldExpand: boolean, source: 'orders' | 'completed' = 'orders') => {
    const id = order.id;
    if (!shouldExpand) {
      setExpanded((prev) => { const n = new Set(prev); n.delete(id); return n; });
      return;
    }
    if (order.materials.length === 0) {
      setLoadingOrderDetail(id);
      try {
        const fullOrder = await ordersApi.get(id);
        if (source === 'completed') {
          setCompletedOrders((prev) => prev.map((item) => item.id === id ? fullOrder : item));
        } else {
          setOrders((prev) => prev.map((item) => item.id === id ? fullOrder : item));
        }
      } catch (err) {
        console.error('备料订单详情加载失败', err);
        message.error('备料明细加载失败，请稍后重试');
      } finally {
        setLoadingOrderDetail(null);
      }
    }
    setExpanded((prev) => { const n = new Set(prev); n.add(id); return n; });
  };

  const refreshOrderDetail = async (orderId: number) => {
    const fullOrder = await ordersApi.get(orderId);
    setOrders((prev) => prev.map((item) => item.id === orderId ? fullOrder : item));
  };

  const inventoryForMaterial = (mat: Material) => invMap.get(mat.name.trim().toLowerCase());

  const hasEnoughStock = (mat: Material) => {
    const inv = inventoryForMaterial(mat);
    return !!inv && inv.quantity >= mat.required;
  };

  const effectiveMaterialStatus = (mat: Material): 'in_progress' | 'ready' => {
    if (mat.status === 'ready') return 'ready';
    if (mat.status === 'in_progress') return 'in_progress';
    return hasEnoughStock(mat) ? 'ready' : 'in_progress';
  };

  const setMaterialStatus = async (mat: Material, status: 'in_progress' | 'ready') => {
    if (effectiveMaterialStatus(mat) === status && mat.status === status) return;
    setUpdatingMatStatus(mat.id);
    try {
      await materialsApi.update(mat.id, { status });
      await refreshOrderDetail(mat.orderId);
      onDataChanged('procurement_material_changed', 'procurement');
    } catch (err) {
      console.error('物料状态更新失败', err);
      message.error('物料状态更新失败，请稍后重试');
    } finally {
      setUpdatingMatStatus(null);
    }
  };

  const toggleUrgent = async (mat: Material) => {
    await materialsApi.update(mat.id, { urgent: !mat.urgent });
    await refreshOrderDetail(mat.orderId);
    onDataChanged('procurement_material_changed', 'procurement');
  };

  const openAddMaterial = (order: Order) => {
    const firstItem = order.orderItems?.[0];
    addMatForm.resetFields();
    addMatForm.setFieldsValue({
      orderItemId: firstItem?.id,
      unit: '个',
    });
    setAddMatModal(order);
  };

  // 触发 AI 物料建议：辅助功能，失败不阻塞采购流程
  const requestAISuggestions = async (order: Order) => {
    setAiSuggestLoading(order.id);
    try {
      const { groups } = await materialsApi.aiSuggest(order.id);
      const hasAny = groups.some((g) => g.materials.length > 0);
      if (!hasAny) {
        message.info('AI 未抽取到候选物料，请直接使用"新增物料"手动添加');
        return;
      }
      // 默认全选
      const selected: Record<string, boolean> = {};
      groups.forEach((g) => g.materials.forEach((_m, idx) => { selected[`${g.orderItemId}:${idx}`] = true; }));
      setAiSuggestModal({ order, groups, selected });
    } catch (err) {
      console.error('AI 物料建议失败', err);
      message.error(getApiErrorMessage(err, 'AI 物料建议失败，请稍后重试'));
    } finally {
      setAiSuggestLoading(null);
    }
  };

  // 把勾选的 AI 建议批量入库（调用现有 POST /api/materials）
  const applyAISuggestions = async () => {
    if (!aiSuggestModal) return;
    const { order, groups, selected } = aiSuggestModal;
    const picked: { orderItemId: number; mat: AISuggestionGroup['materials'][number] }[] = [];
    groups.forEach((g) => g.materials.forEach((m, idx) => {
      if (selected[`${g.orderItemId}:${idx}`]) picked.push({ orderItemId: g.orderItemId, mat: m });
    }));
    if (picked.length === 0) {
      message.warning('请至少勾选一条建议物料');
      return;
    }
    setAiSuggestSaving(true);
    try {
      // 串行调用，避免并发命中后端事务竞争；订单内一般 3-20 条建议，能在 1-2s 内完成
      for (const { orderItemId, mat } of picked) {
        const orderItem = order.orderItems?.find((it) => it.id === orderItemId);
        const required = mat.estimatedQty && mat.estimatedQty > 0
          ? mat.estimatedQty
          : (orderItem?.quantity ?? 1);
        await materialsApi.create({
          orderId: order.id,
          orderItemId,
          name: mat.name,
          spec: mat.spec,
          unit: mat.unit || '个',
          required,
          notes: mat.notes ? `[AI 建议] ${mat.notes}` : '[AI 建议]',
        });
      }
      message.success(`已加入 ${picked.length} 条 AI 建议物料，请采购核对后调整`);
      setAiSuggestModal(null);
      await refreshOrderDetail(order.id);
      onDataChanged('procurement_material_changed', 'procurement');
    } catch (err) {
      console.error('AI 建议入库失败', err);
      message.error(getApiErrorMessage(err, '部分建议未能写入，请稍后重试或手动新增'));
    } finally {
      setAiSuggestSaving(false);
    }
  };

  const openEditMaterial = (order: Order, material: Material) => {
    editMatForm.resetFields();
    editMatForm.setFieldsValue({
      orderItemId: material.orderItemId ?? undefined,
      name: material.name,
      spec: material.spec || '',
      unit: material.unit || '个',
      required: material.required,
      notes: material.notes || '',
    });
    setEditMatModal({ order, material });
  };

  const submitEditMaterial = async () => {
    if (!editMatModal) return;
    try {
      const values = await editMatForm.validateFields();
      setSavingMat(true);
      await materialsApi.update(editMatModal.material.id, {
        name: values.name.trim(),
        spec: values.spec?.trim() || '',
        unit: values.unit?.trim() || '个',
        required: Number(values.required),
        notes: values.notes?.trim() || '',
      });
      message.success('物料已更新');
      const orderId = editMatModal.order.id;
      setEditMatModal(null);
      editMatForm.resetFields();
      await refreshOrderDetail(orderId);
      onDataChanged('procurement_material_changed', 'procurement');
    } catch (err) {
      if ((err as { errorFields?: unknown }).errorFields) return;
      console.error('更新物料失败', err);
      message.error('更新物料失败，请稍后重试');
    } finally {
      setSavingMat(false);
    }
  };

  const deleteMaterial = async (mat: Material) => {
    try {
      await materialsApi.delete(mat.id);
      message.success('物料已删除');
      await refreshOrderDetail(mat.orderId);
      onDataChanged('procurement_material_changed', 'procurement');
    } catch (err) {
      console.error('删除物料失败', err);
      message.error('删除物料失败，请稍后重试');
    }
  };

  const submitAddMaterial = async () => {
    if (!addMatModal) return;
    try {
      const values = await addMatForm.validateFields();
      setSavingMat(true);
      await materialsApi.create({
        orderId: addMatModal.id,
        orderItemId: values.orderItemId,
        name: values.name.trim(),
        spec: values.spec?.trim() || '',
        unit: values.unit?.trim() || '个',
        required: Number(values.required),
        notes: values.notes?.trim() || '',
      });
      message.success('物料已添加');
      const orderId = addMatModal.id;
      setAddMatModal(null);
      addMatForm.resetFields();
      await refreshOrderDetail(orderId);
      onDataChanged('procurement_material_changed', 'procurement');
    } catch (err) {
      if ((err as { errorFields?: unknown }).errorFields) return; // form validation error
      console.error('新增物料失败', err);
      message.error('新增物料失败，请稍后重试');
    } finally {
      setSavingMat(false);
    }
  };

  const saveMat = async (mat: Material) => {
    try {
      const payload: Parameters<typeof materialsApi.update>[1] = {
        expectedDate: matForm.expectedDate || null,
        notes: matForm.notes,
      };
      // 仅当物料处于 pending 状态时才把核心字段写入更新，避免后端拒绝
      if (mat.status === 'pending') {
        if (matForm.name && matForm.name !== mat.name) payload.name = matForm.name;
        if (matForm.spec !== undefined && matForm.spec !== mat.spec) payload.spec = matForm.spec;
        if (matForm.unit && matForm.unit !== mat.unit) payload.unit = matForm.unit;
        if (matForm.required && matForm.required !== mat.required) payload.required = matForm.required;
      }
      await materialsApi.update(mat.id, payload);
      setEditingMat(null);
      await refreshOrderDetail(mat.orderId);
      onDataChanged('procurement_material_changed', 'procurement');
    } catch (err: unknown) {
      console.error('保存物料失败', err);
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || '保存物料失败');
    }
  };

  const startEditMat = (mat: Material) => {
    setEditingMat(mat.id);
    setMatForm({
      expectedDate: mat.expectedDate ? dayjs(mat.expectedDate).format('YYYY-MM-DD') : '',
      notes: mat.notes,
      name: mat.name,
      spec: mat.spec || '',
      unit: mat.unit || '件',
      required: mat.required,
    });
  };

  const deleteMat = async (mat: Material) => {
    try {
      await materialsApi.delete(mat.id);
      await refreshOrderDetail(mat.orderId);
      onDataChanged('procurement_material_changed', 'procurement');
      message.success('物料已删除');
    } catch (err: unknown) {
      console.error('删除物料失败', err);
      const e = err as { response?: { data?: { error?: string } } };
      message.error(e?.response?.data?.error || '删除物料失败');
    }
  };

  const markAllReady = async (order: Order) => {
    setMarkingAll(order.id);
    try {
      const unready = order.materials.filter((m) => effectiveMaterialStatus(m) !== 'ready' || m.status !== 'ready');
      await Promise.all(unready.map((m) => materialsApi.update(m.id, { status: 'ready' })));
      await refreshOrderDetail(order.id);
      onDataChanged('procurement_material_changed', 'procurement');
    } catch (err) {
      console.error('一键全部备齐失败', err);
      message.error('一键全部备齐失败，请稍后重试');
    } finally {
      setMarkingAll(null);
    }
  };

  const confirmMarkAllReady = (order: Order) => {
    Modal.confirm({
      title: '确认全部备齐',
      content: '将把该订单所有物料状态更新为“已备齐”。请确认实物和库存已核对无误。',
      okText: '确认全部备齐',
      cancelText: '取消',
      onOk: () => markAllReady(order),
    });
  };

  const handleQueueProduction = async (orderId: number) => {
    await ordersApi.action(orderId, 'queue_production');
    message.success('已排入生产，订单进入排产队列');
    await load(); onDataChanged('procurement_start_production', 'procurement');
  };

  // Inventory CRUD
  const openNewInv = () => { setEditingInv(null); invForm.resetFields(); setInvModal(true); };
  const openEditInv = (item: InventoryItem) => {
    setEditingInv(item);
    invForm.setFieldsValue({ name: item.name, spec: item.spec, unit: item.unit, quantity: item.quantity, safetyStock: item.safetyStock, notes: item.notes });
    setInvModal(true);
  };

  const saveInv = async () => {
    const values = await invForm.validateFields();
    setSavingInv(true);
    if (editingInv) {
      await inventoryApi.update(editingInv.id, values);
    } else {
      await inventoryApi.create(values);
    }
    setSavingInv(false);
    setInvModal(false);
    await load();
    onDataChanged('procurement_inventory_changed', 'procurement');
  };

  const doAdjust = async () => {
    if (!adjustModal) return;
    const { delta } = await adjForm.validateFields();
    await inventoryApi.adjust(adjustModal.id, adjustDir === 'in' ? delta : -delta);
    setAdjustModal(null);
    adjForm.resetFields();
    await load();
    onDataChanged('procurement_inventory_changed', 'procurement');
  };

  const allReady  = (o: Order) => o.materials.length > 0
    ? o.materials.every((m) => effectiveMaterialStatus(m) === 'ready')
    : !!o.materialSummary && o.materialSummary.unready === 0;
  const materialTotal = (o: Order) => o.materialSummary?.total ?? o.materials.length;
  const readyCount = (o: Order) => o.materials.length > 0
    ? o.materials.filter((m) => effectiveMaterialStatus(m) === 'ready').length
    : o.materialSummary?.ready ?? 0;
  const urgentCount = (o: Order) => o.materials.length > 0
    ? o.materials.filter((m) => m.urgent && effectiveMaterialStatus(m) !== 'ready').length
    : o.materialSummary?.urgentUnready ?? 0;
  const lowStockCount = inventory.filter((i) => i.safetyStock > 0 && i.quantity < i.safetyStock).length;

  const filterOrdersBySearch = (list: Order[], keyword: string) => {
    const terms = keyword.split(/[,，\s]+/).map((item) => item.trim()).filter(Boolean);
    if (terms.length === 0) return list;
    return list.filter((order) => {
      const haystack = [
        order.customer.name,
        order.contractNo,
        order.salespersonName,
        order.customer.salespersonName,
        order.createdBy,
        getOrderProductSummary(order),
      ].join(' ');
      return terms.every((term) => haystack.includes(term));
    });
  };

  const orderRows = filterOrdersBySearch(orders, orderSearch);
  const completedRows = filterOrdersBySearch(completedOrders, completedSearch);

  const filteredInventory = inventory.filter((item) => {
    const terms = inventorySearch.split(/[,，\s]+/).map((term) => term.trim()).filter(Boolean);
    const matchesKeyword = terms.length === 0
      || terms.every((term) => [item.name, item.spec].join(' ').includes(term));
    const isLow = item.safetyStock > 0 && item.quantity < item.safetyStock;
    const matchesStatus =
      inventoryStatus === 'all'
      || (inventoryStatus === 'normal' && item.safetyStock > 0 && item.quantity >= item.safetyStock)
      || (inventoryStatus === 'low' && isLow)
      || (inventoryStatus === 'noSafety' && item.safetyStock <= 0);
    return matchesKeyword && matchesStatus;
  });
  const pagedInventory = filteredInventory.slice((inventoryPage - 1) * inventoryPageSize, inventoryPage * inventoryPageSize);

  const productKindSummary = (order: Order) => {
    if (order.orderItems?.length > 0) {
      const uniqueNames = Array.from(new Set(order.orderItems.map((item) => item.productName).filter(Boolean)));
      if (uniqueNames.length <= 2) return uniqueNames.join('、') || '—';
      return `${uniqueNames.slice(0, 2).join('、')}等 ${uniqueNames.length} 种`;
    }
    return order.product?.name || '—';
  };

  const materialProgressText = (order: Order) => {
    const ready = readyCount(order);
    const total = materialTotal(order);
    if (total > 0 && ready >= total) return '全部已备齐';
    return `${ready}/${total} 已备齐`;
  };

  const renderProcurementPagination = (
    current: number,
    pageSize: number,
    total: number,
    onChange: (page: number, pageSize: number) => void,
  ) => (
    <div className="sales-pagination-bar">
      <div className="sales-pagination-left">
        <Select<number>
          className="sales-page-size-select"
          value={pageSize}
          options={[10, 20, 50, 100].map((value) => ({ label: `${value} 条/页`, value }))}
          onChange={(nextPageSize) => onChange(1, nextPageSize)}
          style={{ width: 116 }}
        />
        <span className="sales-pagination-total">共 {total} 条，{Math.max(1, Math.ceil(total / pageSize))} 页</span>
      </div>
      <Pagination
        className="sales-pagination-control"
        current={current}
        pageSize={pageSize}
        total={total}
        showSizeChanger={false}
        showQuickJumper
        onChange={onChange}
      />
    </div>
  );

  const renderOrderTable = (list: Order[], readOnly: boolean, source: 'orders' | 'completed') => {
    const renderMaterialPanel = (o: Order) => {
        const ready = readyCount(o);
        const total = materialTotal(o);
        const isAllReady = allReady(o);
        const detailLoading = loadingOrderDetail === o.id;
        const detailPending = o.materials.length === 0 && total > 0;
        const materialActionsDisabled = detailLoading || detailPending;
        const matColumns: TableColumnsType<Material> = [
          {
            title: '产品名称',
            dataIndex: 'orderItemDisplayName',
            width: 140,
            render: (_: unknown, mat: Material) => (
              mat.orderItemDisplayName
                ? <span style={{ color: '#1a1d23' }}>{mat.orderItemDisplayName}</span>
                : <Text type="secondary">—</Text>
            ),
          },
          {
            title: '物料名称', dataIndex: 'name', width: 150,
            render: (_: unknown, mat: Material) => {
              const isEditing = editingMat === mat.id;
              if (isEditing && mat.status === 'pending') {
                return <input className="procurement-inline-input" value={matForm.name} onChange={(e) => setMatForm((f) => ({ ...f, name: e.target.value }))} />;
              }
              return <span className="procurement-strong-text">{mat.name}</span>;
            },
          },
          {
            title: '规格', dataIndex: 'spec', width: 130,
            render: (v: string, mat: Material) => {
              const isEditing = editingMat === mat.id;
              if (isEditing && mat.status === 'pending') {
                return <input className="procurement-inline-input" value={matForm.spec} onChange={(e) => setMatForm((f) => ({ ...f, spec: e.target.value }))} />;
              }
              return <Text type="secondary">{v || '—'}</Text>;
            },
          },
          {
            title: '需求量', dataIndex: 'required', align: 'right' as const, width: 110,
            render: (_: unknown, mat: Material) => {
              const isEditing = editingMat === mat.id;
              if (isEditing && mat.status === 'pending') {
                return (
                  <Space size={4}>
                    <InputNumber size="small" min={0.0001} value={matForm.required} onChange={(v) => setMatForm((f) => ({ ...f, required: Number(v) || 0 }))} style={{ width: 60 }} />
                    <input className="procurement-inline-input" style={{ width: 36 }} value={matForm.unit} onChange={(e) => setMatForm((f) => ({ ...f, unit: e.target.value }))} />
                  </Space>
                );
              }
              return `${mat.required} ${mat.unit}`;
            },
          },
          {
            title: '库存余量', align: 'right' as const, width: 82,
            render: (_: unknown, mat: Material) => {
              const inv = invMap.get(mat.name.trim().toLowerCase());
              if (!inv) return <Text type="secondary">—</Text>;
              const ok = inv.quantity >= mat.required;
              return <Text style={{ fontWeight: 700, color: ok ? '#16a34a' : '#f59e0b' }}>{inv.quantity} {inv.unit}{!ok && ' ⚠'}</Text>;
            },
          },
          {
            title: '备料状态', align: 'center' as const, width: 130,
            render: (_: unknown, mat: Material) => {
              const status = effectiveMaterialStatus(mat);
              const isReady = status === 'ready';
              if (readOnly) {
                return <Tag color={isReady ? 'success' : 'default'}>{isReady ? '已备齐' : '备料中'}</Tag>;
              }
              return (
                <Switch
                  className="procurement-ready-switch"
                  checked={isReady}
                  loading={updatingMatStatus === mat.id}
                  checkedChildren="已备齐"
                  unCheckedChildren="备料中"
                  onChange={(checked) => setMaterialStatus(mat, checked ? 'ready' : 'in_progress')}
                />
              );
            },
          },
          {
            title: '预计到货', width: 104,
            render: (_: unknown, mat: Material) => {
              const isEditing = editingMat === mat.id;
              if (readOnly) return <Text type="secondary">{mat.expectedDate ? formatShortDate(mat.expectedDate) : '—'}</Text>;
              return isEditing ? (
                <input type="date" value={matForm.expectedDate} onChange={(e) => setMatForm((f) => ({ ...f, expectedDate: e.target.value }))}
                  className="procurement-inline-input procurement-date-input" />
              ) : (
                <Text type="secondary" className="procurement-editable-text" onClick={() => startEditMat(mat)}>
                  {mat.expectedDate ? formatShortDate(mat.expectedDate) : <span style={{ color: '#d1d5db' }}>设置</span>}
                </Text>
              );
            },
          },
          {
            title: '缺料风险', align: 'center' as const, width: 56,
            render: (_: unknown, mat: Material) => (
              <Button
                type="text"
                size="small"
                disabled={readOnly}
                icon={<ThunderboltOutlined style={{ color: mat.urgent ? '#ef4444' : '#e2e8f0' }} />}
                onClick={() => toggleUrgent(mat)}
              />
            ),
          },
          {
            title: '备注', width: 90,
            render: (_: unknown, mat: Material) => {
              const isEditing = editingMat === mat.id;
              if (readOnly) return <Text type="secondary">{mat.notes || '—'}</Text>;
              return isEditing ? (
                <Space size={4} wrap className="procurement-material-edit-actions">
                  <input value={matForm.notes} onChange={(e) => setMatForm((f) => ({ ...f, notes: e.target.value }))}
                    className="procurement-inline-input" />
                  <Button type="text" size="small" aria-label="保存" icon={<CheckOutlined />} onClick={() => saveMat(mat)} />
                  <Button type="text" size="small" aria-label="取消" icon={<CloseOutlined />} onClick={() => setEditingMat(null)} />
                </Space>
              ) : (
                <Text type="secondary" className="procurement-editable-text" onClick={() => startEditMat(mat)}>
                  {mat.notes || <span style={{ color: '#d1d5db' }}>编辑</span>}
                </Text>
              );
            },
          },
          ...(!readOnly ? [{
            title: '操作', width: 96, align: 'center' as const,
            render: (_: unknown, mat: Material) => (
              <Space size={4} className="sales-inline-actions">
                <Button type="link" size="small" onClick={() => openEditMaterial(o, mat)}>编辑</Button>
                <Popconfirm
                  title="删除该物料？"
                  description="删除后不可恢复，已记录的备料状态将一并清除。"
                  okText="删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => deleteMaterial(mat)}
                >
                  <Button type="link" size="small" danger>删除</Button>
                </Popconfirm>
              </Space>
            ),
          }] : []),
        ];

        return (
          <div className="procurement-material-panel">
            <Table
              className="sales-data-table procurement-material-table"
              rowKey="id"
              columns={matColumns}
              dataSource={(() => {
                // 按所属产品聚类：同 orderItemId 物料聚在一起，组间顺序按首次出现位置（保持原插入序）
                const firstSeen = new Map<number, number>();
                o.materials.forEach((mat, idx) => {
                  const key = mat.orderItemId ?? -1;
                  if (!firstSeen.has(key)) firstSeen.set(key, idx);
                });
                return [...o.materials].sort((a, b) => {
                  const ka = a.orderItemId ?? -1;
                  const kb = b.orderItemId ?? -1;
                  const pa = firstSeen.get(ka) ?? 0;
                  const pb = firstSeen.get(kb) ?? 0;
                  if (pa !== pb) return pa - pb;
                  return a.id - b.id;
                });
              })()}
              loading={loadingOrderDetail === o.id}
              pagination={false}
              size="small"
              tableLayout="fixed"
              locale={{
                emptyText: detailLoading ? '正在加载备料明细' : '该订单暂无物料，请点击"新增物料"添加',
              }}
            />
            {!readOnly && (
              <div className="procurement-material-actions">
                <Button className="procurement-add-material-btn" size="small" onClick={() => openAddMaterial(o)} disabled={detailLoading}>+ 新增物料</Button>
                <Button
                  size="small"
                  className="ymt-ai-btn"
                  loading={aiSuggestLoading === o.id}
                  disabled={detailLoading || aiSuggestLoading !== null}
                  onClick={() => requestAISuggestions(o)}
                  title="使用千问大模型根据订单详细要求自动生成物料候选清单，采购勾选确认后入库"
                >
                  🪄 AI 补全物料
                </Button>
                {isAllReady ? (
                  <Button className="procurement-queue-production-btn" size="small" disabled={materialActionsDisabled} onClick={() => handleQueueProduction(o.id)}>排入生产</Button>
                ) : (
                  <>
                    <Button size="small" loading={markingAll === o.id || detailLoading} disabled={materialActionsDisabled} onClick={() => confirmMarkAllReady(o)}>一键全部备齐</Button>
                    <Tag color="orange">缺料 {total - ready} 项</Tag>
                  </>
                )}
              </div>
            )}
          </div>
        );
    };

    const orderColumns: TableColumnsType<Order> = [
      {
        title: '合同编号',
        width: 138,
        render: (_, order) => (
          <code className={order.contractNo ? 'sales-table-code' : 'sales-table-code is-empty'}>{order.contractNo || '—'}</code>
        ),
      },
      {
        title: '客户',
        width: 150,
        render: (_, order) => <span className="procurement-order-title">{order.customer.name}</span>,
      },
      {
        title: '产品摘要',
        width: 220,
        render: (_, order) => <span className="procurement-product-summary">{productKindSummary(order)}</span>,
      },
      {
        title: '总数量',
        width: 76,
        align: 'right',
        render: (_, order) => <span className="procurement-strong-text">{getOrderQuantity(order)}</span>,
      },
      {
        title: '业务员',
        width: 90,
        render: (_, order) => <Text type="secondary">{order.salespersonName || order.customer.salespersonName || order.createdBy || '—'}</Text>,
      },
      {
        title: '备料进度',
        width: 120,
        render: (_, order) => {
          const isAllReady = allReady(order);
          return <Tag color={isAllReady ? 'success' : 'blue'} className="procurement-light-tag">{materialProgressText(order)}</Tag>;
        },
      },
      {
        title: '缺料风险',
        width: 110,
        render: (_, order) => {
          const risk = urgentCount(order);
          if (risk > 0 && !readOnly) return <Tag color="red" icon={<WarningOutlined />} className="procurement-light-tag">有风险</Tag>;
          if (order.urgent) return <Tag color="orange" icon={<ThunderboltOutlined />} className="procurement-light-tag">加急</Tag>;
          return <Tag color="default" className="procurement-light-tag">无风险</Tag>;
        },
      },
      {
        title: '操作',
        align: 'left',
        width: 100,
        className: 'sales-action-column',
        render: (_, order) => (
          <Space size={0} className="sales-inline-actions">
            <Button type="link" size="small" onClick={() => handleOrderExpand(order, !expanded.has(order.id), source)}>
              {readOnly ? '详情' : '处理'}
            </Button>
          </Space>
        ),
      },
    ];

    return (
      <Table<Order>
        className="sales-data-table procurement-order-table"
        rowKey="id"
        columns={orderColumns}
        dataSource={list}
        scroll={{ x: 1050 }}
        pagination={false}
        expandable={{
          expandedRowKeys: Array.from(expanded),
          onExpand: (nextExpanded, order) => handleOrderExpand(order, nextExpanded, source),
          expandedRowRender: renderMaterialPanel,
          rowExpandable: () => true,
          expandIcon: ({ expanded: isExpanded, onExpand, record }) => (
            <button
              className={`procurement-expand-arrow${isExpanded ? ' open' : ''}`}
              onClick={(e) => onExpand(record, e)}
            >
              {isExpanded ? '▼' : '▶'}
            </button>
          ),
        }}
      />
    );
  };

  const inventoryColumns: TableColumnsType<InventoryItem> = [
    {
      title: '物料名称',
      dataIndex: 'name',
      width: 220,
      render: (v) => <span className="procurement-strong-text">{v as string}</span>,
    },
    { title: '规格', dataIndex: 'spec', render: (v) => <Text type="secondary">{(v as string) || '—'}</Text>, width: 180 },
    {
      title: '当前库存',
      dataIndex: 'quantity',
      align: 'right',
      width: 120,
      render: (v, item) => {
        const low = item.safetyStock > 0 && item.quantity < item.safetyStock;
        return <Text style={{ fontWeight: 700, color: low ? '#f59e0b' : '#25282e' }}>{v as number} {item.unit}</Text>;
      },
    },
    {
      title: '安全库存',
      dataIndex: 'safetyStock',
      align: 'right',
      width: 120,
      render: (v, item) => <Text type="secondary">{(v as number) > 0 ? `${v} ${item.unit}` : '—'}</Text>,
    },
    {
      title: '库存状态',
      width: 90,
      align: 'center',
      render: (_, item) => {
        if (item.safetyStock <= 0) return <Text type="secondary">—</Text>;
        return item.quantity >= item.safetyStock
          ? <Tag color="green">正常</Tag>
          : <Tag color="warning">偏低</Tag>;
      },
    },
    { title: '备注', dataIndex: 'notes', render: (v) => <Text type="secondary">{(v as string) || '—'}</Text> },
    { title: '更新时间', dataIndex: 'updatedAt', render: (v) => <Text type="secondary">{formatDate(v as string, 'MM/DD HH:mm')}</Text>, width: 130 },
    {
      title: '操作',
      align: 'left',
      fixed: 'right',
      width: 150,
      className: 'sales-action-column',
      render: (_, item) => (
        <Space size={0} className="sales-inline-actions">
          <Button type="link" size="small" onClick={() => { setAdjustModal(item); setAdjustDir('in'); adjForm.resetFields(); }}>调整</Button>
          <Button type="link" size="small" onClick={() => openEditInv(item)}>编辑</Button>
          <Popconfirm title={`删除「${item.name}」？`} onConfirm={async () => { await inventoryApi.delete(item.id); await load(); onDataChanged('procurement_inventory_changed', 'procurement'); }} okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
            <Button type="link" size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  if (loading) return (
    <div className="procurement-management-panel">
      <section className="sales-shell-card">
        <div className="sales-page-head">
          <div>
            <h1>采购备料与库存管理</h1>
            <div className="sales-page-subtitle">管理订单备料、物料需求与库存状态</div>
          </div>
          <div className="sales-page-date">{dayjs().format('YYYY年MM月DD日')}</div>
        </div>
        <div className="procurement-loading-block">
          <Skeleton active paragraph={{ rows: 9 }} />
        </div>
      </section>
    </div>
  );

  const tabItems = [
    {
      key: 'orders',
      label: `订单备料${orderTotal > 0 ? ` (${orderTotal})` : ''}`,
      children: (
        <div className="sales-list-panel">
          <PurchaseFilterBar
            search={orderSearch}
            onSearchChange={(value) => {
              setOrderSearch(value);
              setOrderPage(1);
            }}
            placeholder="请输入客户名称/合同编号/业务员名称"
            range={orderRange}
            onRangeChange={setOrderRange}
          />
          {orderRows.length === 0 ? (
            <div className="procurement-empty-block">
              <Empty icon="📦" title={orders.length === 0 ? '暂无待备料订单' : '未找到匹配订单'} desc={orders.length === 0 ? '所有订单均已进入生产或更后阶段' : '请调整搜索关键词后重试'} />
            </div>
          ) : renderOrderTable(orderRows, false, 'orders')}
          {renderProcurementPagination(orderPage, orderPageSize, orderSearch.trim() ? orderRows.length : orderTotal, (page, pageSize) => {
            setOrderPage(page);
            setOrderPageSize(pageSize);
          })}
        </div>
      ),
    },
    {
      key: 'completed',
      label: `近一个月完成订单${completedTotal > 0 ? ` (${completedTotal})` : ''}`,
      children: (
        <div className="sales-list-panel">
          <PurchaseFilterBar
            search={completedSearch}
            onSearchChange={(value) => {
              setCompletedSearch(value);
              setCompletedPage(1);
            }}
            placeholder="请输入客户名称/合同编号/业务员名称"
            range={completedRange}
            onRangeChange={setCompletedRange}
          />
          {completedRows.length === 0 ? (
            <div className="procurement-empty-block">
              <Empty icon="✅" title={completedOrders.length === 0 ? '近一个月暂无完成订单' : '未找到匹配订单'} desc={completedOrders.length === 0 ? '采购完成并进入后续流程的订单会显示在这里' : '请调整搜索关键词后重试'} />
            </div>
          ) : renderOrderTable(completedRows, true, 'completed')}
          {renderProcurementPagination(completedPage, completedPageSize, completedSearch.trim() ? completedRows.length : completedTotal, (page, pageSize) => {
            setCompletedPage(page);
            setCompletedPageSize(pageSize);
          })}
        </div>
      ),
    },
    {
      key: 'inventory',
      label: `库存台账${lowStockCount > 0 ? ` ⚠${lowStockCount}` : ''}`,
      children: (
        <div className="sales-list-panel">
          <PurchaseFilterBar
            search={inventorySearch}
            onSearchChange={(value) => {
              setInventorySearch(value);
              setInventoryPage(1);
            }}
            placeholder="请输入物料名称/规格"
            extra={<button className="ymt-create-btn" type="button" onClick={openNewInv}>+ 新增物料</button>}
          >
              {(() => {
                const statusOptions = [
                  { label: '全部', value: 'all' as InventoryStatusFilter },
                  { label: '库存正常', value: 'normal' as InventoryStatusFilter },
                  { label: '库存偏低', value: 'low' as InventoryStatusFilter },
                  { label: '无安全库存', value: 'noSafety' as InventoryStatusFilter },
                ];
                return (
                  <label className="ymt-filter ymt-select-filter" style={{ minWidth: 180 }}>
                    <span className="ymt-filter-label">库存状态</span>
                    <span className="ymt-filter-value">{statusOptions.find((o) => o.value === inventoryStatus)?.label}</span>
                    <svg className="ymt-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    <select className="ymt-select-native" value={inventoryStatus} onChange={(e) => { setInventoryStatus(e.target.value as InventoryStatusFilter); setInventoryPage(1); }}>
                      {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </label>
                );
              })()}
          </PurchaseFilterBar>
          <Table<InventoryItem>
            className="sales-data-table procurement-inventory-table"
            rowKey="id"
            columns={inventoryColumns}
            dataSource={pagedInventory}
            scroll={{ x: 1040 }}
            pagination={false}
            locale={{
              emptyText: (
                <div className="procurement-empty-block compact">
                  <Empty icon="🗄️" title="库存台账为空" desc="点击右上角新增公司常备物料" />
                </div>
              ),
            }}
          />
          {renderProcurementPagination(inventoryPage, inventoryPageSize, filteredInventory.length, (page, pageSize) => {
            setInventoryPage(page);
            setInventoryPageSize(pageSize);
          })}
        </div>
      ),
    },
  ];

  return (
    <div className="procurement-management-panel">
      <section className="sales-shell-card">
        <div className="sales-page-head">
          <div>
            <h1>采购备料与库存管理</h1>
            <div className="sales-page-subtitle">管理订单备料、物料需求与库存状态</div>
          </div>
          <div className="sales-page-date">{dayjs().format('YYYY年MM月DD日')}</div>
        </div>

        <Tabs
          className="sales-sub-tabs"
          activeKey={subTab}
          onChange={(k) => setSubTab(k as ProcurementTab)}
          items={tabItems}
        />
      </section>

      {/* Inventory create/edit modal */}
      <Modal
        open={invModal}
        title={editingInv ? '编辑物料' : '新增库存物料'}
        onCancel={() => setInvModal(false)}
        onOk={saveInv}
        confirmLoading={savingInv}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={invForm} layout="vertical" size="middle" style={{ marginTop: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item label="物料名称" name="name" rules={[{ required: true, message: '请填写物料名称' }]}>
              <Input placeholder="如：发动机、电容器" />
            </Form.Item>
            <Form.Item label="规格型号" name="spec">
              <Input placeholder="如：5kW / 220V" />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
            <Form.Item label="单位" name="unit" initialValue="个">
              <Select options={['个', '套', 'kg', 'm', '台', '件'].map(v => ({ label: v, value: v }))} />
            </Form.Item>
            <Form.Item label="当前库存" name="quantity" initialValue={0}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="安全库存预警" name="safetyStock" initialValue={0}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <Form.Item label="备注" name="notes">
            <Input placeholder="供应商、采购周期等" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Adjust modal */}
      <Modal
        open={!!adjustModal}
        title={`调整库存 — ${adjustModal?.name}`}
        onCancel={() => { setAdjustModal(null); adjForm.resetFields(); }}
        onOk={doAdjust}
        okText={`确认${adjustDir === 'in' ? '入库' : '出库'}`}
        okButtonProps={{ danger: adjustDir === 'out' }}
        cancelText="取消"
        destroyOnClose
      >
        {adjustModal && (
          <>
            <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
              当前库存：<Text strong>{adjustModal.quantity} {adjustModal.unit}</Text>
            </Text>
            <Space style={{ width: '100%', marginBottom: 16 }}>
              {(['in', 'out'] as const).map((d) => (
                <Button key={d} type={adjustDir === d ? 'primary' : 'default'} danger={adjustDir === d && d === 'out'}
                  onClick={() => setAdjustDir(d)} style={{ flex: 1 }}>
                  {d === 'in' ? '入库 +' : '出库 −'}
                </Button>
              ))}
            </Space>
            <Form form={adjForm} layout="vertical">
              <Form.Item label="数量" name="delta" rules={[{ required: true, message: '请填写数量' }]}>
                <InputNumber min={0.01} style={{ width: '100%' }} placeholder="请输入调整数量" autoFocus />
              </Form.Item>
            </Form>
          </>
        )}
      </Modal>

      {/* 新增物料 Modal */}
      <Modal
        open={!!addMatModal}
        title="新增物料"
        onCancel={() => { setAddMatModal(null); addMatForm.resetFields(); }}
        onOk={submitAddMaterial}
        confirmLoading={savingMat}
        okText="新增"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={addMatForm} layout="vertical" preserve={false}>
          <Form.Item
            label="所属产品"
            name="orderItemId"
            rules={[{ required: true, message: '请选择物料所属产品' }]}
            tooltip="该物料用于哪个订单产品的备料"
          >
            <Select
              placeholder="选择产品"
              options={(addMatModal?.orderItems ?? []).map((item) => ({
                value: item.id,
                label: item.spec ? `${item.productName} · ${item.spec}` : item.productName,
              }))}
              notFoundContent="该订单暂无产品明细"
            />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item label="物料名称" name="name" rules={[{ required: true, message: '请输入物料名称' }]}>
              <Input placeholder="如：发动机头" />
            </Form.Item>
            <Form.Item label="规格" name="spec">
              <Input placeholder="可填可不填" />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item label="需求量" name="required" rules={[{ required: true, message: '请输入需求量' }]}>
              <InputNumber min={0.01} step={1} style={{ width: '100%' }} placeholder="数量" />
            </Form.Item>
            <Form.Item label="单位" name="unit">
              <Input placeholder="个 / 套 / 台 ..." />
            </Form.Item>
          </div>
          <Form.Item label="备注" name="notes">
            <Input.TextArea rows={2} placeholder="可选" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 编辑物料 Modal */}
      <Modal
        open={!!editMatModal}
        title="编辑物料"
        onCancel={() => { setEditMatModal(null); editMatForm.resetFields(); }}
        onOk={submitEditMaterial}
        confirmLoading={savingMat}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={editMatForm} layout="vertical" preserve={false}>
          <Form.Item label="所属产品" name="orderItemId" tooltip="所属产品不可在此修改，如需调整请删除后重建">
            <Select
              disabled
              placeholder="所属产品"
              options={(editMatModal?.order.orderItems ?? []).map((item) => ({
                value: item.id,
                label: item.spec ? `${item.productName} · ${item.spec}` : item.productName,
              }))}
            />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item label="物料名称" name="name" rules={[{ required: true, message: '请输入物料名称' }]}>
              <Input />
            </Form.Item>
            <Form.Item label="规格" name="spec">
              <Input placeholder="可填可不填" />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item label="需求量" name="required" rules={[{ required: true, message: '请输入需求量' }]}>
              <InputNumber min={0.01} step={1} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="单位" name="unit">
              <Input placeholder="个 / 套 / 台 ..." />
            </Form.Item>
          </div>
          <Form.Item label="备注" name="notes">
            <Input.TextArea rows={2} placeholder="可选" />
          </Form.Item>
        </Form>
      </Modal>

      {/* AI 物料建议 Modal */}
      <Modal
        open={!!aiSuggestModal}
        title="🪄 AI 物料建议（辅助参考，请采购核对）"
        width={760}
        onCancel={() => setAiSuggestModal(null)}
        onOk={applyAISuggestions}
        confirmLoading={aiSuggestSaving}
        okText="加入勾选项"
        cancelText="取消"
        destroyOnClose
      >
        {aiSuggestModal && (
          <div style={{ maxHeight: 480, overflowY: 'auto' }}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
              AI 仅作辅助；勾选后将作为新物料加入备料明细，采购可再次修改或删除。
            </Text>
            {aiSuggestModal.groups.map((group) => (
              <div key={group.orderItemId} style={{ marginBottom: 16, padding: 12, background: '#fafafa', borderRadius: 6 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>📦 {group.productName}</div>
                {group.materials.length === 0 ? (
                  <Text type="secondary">该产品未抽取到建议物料</Text>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {group.materials.map((mat, idx) => {
                      const key = `${group.orderItemId}:${idx}`;
                      const checked = !!aiSuggestModal.selected[key];
                      return (
                        <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => setAiSuggestModal((prev) => prev
                              ? { ...prev, selected: { ...prev.selected, [key]: e.target.checked } }
                              : prev)}
                          />
                          <span style={{ flex: 1 }}>
                            <strong>{mat.name}</strong>
                            {mat.spec && <Text type="secondary"> · {mat.spec}</Text>}
                            <Text type="secondary"> · {mat.estimatedQty ?? '?'} {mat.unit}</Text>
                            {mat.notes && <Text type="secondary"> · {mat.notes}</Text>}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
