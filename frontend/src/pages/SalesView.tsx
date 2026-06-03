import { useEffect, useRef, useState } from 'react';
import {
  AutoComplete, Button, Tabs, Card, Modal, Form, Input, InputNumber, Select,
  DatePicker, Table, Tag, Space, Typography, Divider, Drawer, Descriptions, Timeline, Upload, Switch, message, Skeleton, Alert, Pagination, Tooltip,
  type TableColumnsType,
} from 'antd';
import { getApiErrorMessage, ordersApi, customersApi, productsApi, excelApi, usersApi, type ParsedExcelItem } from '../api';
import type { DataChangeHandler, Order, OrderItem, Customer, CustomerSearchResult, Product, Role, User } from '../types';
import { PageHeader, StatusBadge, DeliveryCell } from '../components/ui';
import dayjs from 'dayjs';
import { formatCurrency, formatDate, formatShortDate, getOrderProductSummary } from '../utils/order';
import { canCreateOrder } from '../utils/permissions';
import { buildCustomerOrderOptions } from '../utils/customerOptions';

const { Text } = Typography;

type TimeRangeKey = '1m' | '3m' | '6m' | '1y';

const TIME_RANGE_OPTIONS: { label: string; value: TimeRangeKey }[] = [
  { label: '近一个月', value: '1m' },
  { label: '近三个月', value: '3m' },
  { label: '近六个月', value: '6m' },
  { label: '近一年', value: '1y' },
];

const TIME_RANGE_LABELS: Record<TimeRangeKey, string> = {
  '1m': '近一个月', '3m': '近三个月', '6m': '近六个月', '1y': '近一年',
};

type OrderItemRow = {
  _key: number;
  productId?: number | null;
  productName: string;
  detailRequirement: string;
  unit: string;
  quantity: number | null;
  unitPrice: number | null;
  // 以下字段对前端不再展示，但保留在类型上以兼容 schema 历史字段，提交时按默认值发出
  spec?: string;
  customerBrand?: string;
  remark?: string;
  sourceRowNo?: string;
  ctnCount?: number | null;
  qtyPerCtn?: number | null;
  ctnVolume?: number | null;
  totalVolume?: number | null;
  ctnWeight?: number | null;
  totalWeight?: number | null;
};

type CustDetail = Customer & {
  orders?: Order[];
  commLogs?: { id: number; type: string; outcome: string; content: string; createdBy: string; createdAt: string }[];
};

type ExcelPreview = {
  contractInfo: Record<string, string>;
  previewHash: string;
  rows: Record<string, string>[];
  items: ParsedExcelItem[];
  totalRows: number;
  diagnostics?: {
    parser: string;
    canImport: boolean;
    missingRequiredFields: string[];
    warnings: string[];
  };
};

const RATING_COLOR: Record<string, string> = {
  A: 'green', B: 'blue', C: 'orange', D: 'red',
};

const emptyItem = (key: number): OrderItemRow => ({
  _key: key, productId: null, productName: '', detailRequirement: '', unit: '件', quantity: null, unitPrice: null,
  spec: '', customerBrand: '', remark: '', sourceRowNo: '',
  ctnCount: null, qtyPerCtn: null, ctnVolume: null, totalVolume: null, ctnWeight: null, totalWeight: null,
});

export default function SalesView({
  refreshKey = 0,
  onDataChanged,
  readOnly = false,
  role = 'sales',
  user,
}: {
  refreshKey?: number;
  onDataChanged: DataChangeHandler;
  readOnly?: boolean;
  role?: Role | 'admin';
  user?: User;
}) {
  const [subTab, setSubTab]         = useState<'orders' | 'customers'>('orders');
  const [orderRange, setOrderRange] = useState<TimeRangeKey>('1m');
  const [orders, setOrders]         = useState<Order[]>([]);
  const [orderTotal, setOrderTotal] = useState(0);
  const [orderPage, setOrderPage] = useState(1);
  const [orderPageSize, setOrderPageSize] = useState(20);
  const [customers, setCustomers]   = useState<Customer[]>([]);
  const [customerOptions, setCustomerOptions] = useState<CustomerSearchResult[]>([]);
  const [customerSearching, setCustomerSearching] = useState(false);
  const [products, setProducts]     = useState<Product[]>([]);
  const [salesUsers, setSalesUsers] = useState<User[]>([]);
  const [loading, setLoading]       = useState(true);
  const hasFetchedRef = useRef(false);
  const loadRequestSeqRef = useRef(0);
  const excelPreviewSeqRef = useRef(0);

  // Order modal
  const [orderModal, setOrderModal]   = useState(false);
  const [orderForm]                   = Form.useForm();
  const urgentChecked                 = Form.useWatch('urgent', orderForm);
  const [orderItems, setOrderItems]   = useState<OrderItemRow[]>([emptyItem(0)]);
  const [itemKeyCounter, setItemKeyCounter] = useState(1);
  const [submitting, setSubmitting]   = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [orderFile, setOrderFile] = useState<File | null>(null);
  const [excelPreview, setExcelPreview] = useState<ExcelPreview | null>(null);
  const [excelImporting, setExcelImporting] = useState(false);
  const [excelStatus, setExcelStatus] = useState<string>('');
  const [excelPreviewFileKey, setExcelPreviewFileKey] = useState('');
  const [aiParsing, setAiParsing] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageParsing, setImageParsing] = useState(false);
  const [imageStatus, setImageStatus] = useState<string>('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [orderDetailLoading, setOrderDetailLoading] = useState<number | null>(null);
  const [editingWithdrawn, setEditingWithdrawn] = useState(false);
  const [orderSearch, setOrderSearch] = useState('');
  const [orderDelivDateStart, setOrderDelivDateStart] = useState('');
  const [orderDelivDateEnd, setOrderDelivDateEnd] = useState('');
  const [customerRange, setCustomerRange] = useState<TimeRangeKey>('1m');
  const [customerDateStart, setCustomerDateStart] = useState('');
  const [customerDateEnd, setCustomerDateEnd] = useState('');
  const [custSearch, setCustSearch] = useState('');
  const [customerPage, setCustomerPage] = useState(1);
  const [customerPageSize, setCustomerPageSize] = useState(20);

  // Customer modal + detail
  const [custModal, setCustModal]       = useState(false);
  const [custForm]                      = Form.useForm();
  const [selectedCust, setSelectedCust] = useState<CustDetail | null>(null);
  const [logForm]                       = Form.useForm();
  const canUseOrderActions = !readOnly && !!user && canCreateOrder(user);
  const canUseCustomerActions = !readOnly && !!user && canCreateOrder(user);
  const canAssignSalesperson = !readOnly && !!user && (user.isAdmin || user.canCreateOrderForSales || user.canManageUsers);
  const canViewAmount = role !== 'procurement';
  const shouldFilterBySalesperson = role === 'sales';
  const currentSalesName = user?.name || '业务员';
  const creatorName = currentSalesName;
  const selectedSalespersonId = Form.useWatch('salespersonId', orderForm);

  const mergeCustomerOptions = (incoming: CustomerSearchResult[]) => {
    setCustomerOptions((prev) => {
      const byId = new Map<number, CustomerSearchResult>();
      [...incoming, ...prev].forEach((customer) => byId.set(customer.id, customer));
      return Array.from(byId.values()).slice(0, 50);
    });
  };

  const orderCustomerOwnerPayload = (salespersonId?: number) => {
    if (canAssignSalesperson) {
      return salespersonId ? { salespersonId } : {};
    }
    return { salespersonName: creatorName };
  };

  const load = async () => {
    const requestSeq = ++loadRequestSeqRef.current;
    const isLatestRequest = () => requestSeq === loadRequestSeqRef.current;
    setLoading(true);
    try {
      const fetchCoreData = async <T,>(label: string, request: () => Promise<T>) => {
        try {
          return await request();
        } catch (err) {
          console.error(`${label}加载失败`, err);
          throw new Error(`${label}：${getApiErrorMessage(err, '请检查网络后刷新页面')}`);
        }
      };
      const salesUsersRequest = canAssignSalesperson
        ? Promise.all([
          fetchCoreData('业务员列表', () => usersApi.list({ role: 'sales', status: 'enabled' })),
          fetchCoreData('经理列表', () => usersApi.list({ role: 'manager', status: 'enabled' })),
        ])
          .then(([sales, managers]) => [...sales, ...managers])
          .catch((err) => {
            console.error('业务员列表加载失败', err);
            if (isLatestRequest()) {
              message.warning(`业务员列表加载失败：${getApiErrorMessage(err, '请检查网络后刷新页面')}`);
            }
            return [];
          })
        : Promise.resolve([]);
      const [o, allCustomers, p, assignableUsers] = await Promise.all([
        fetchCoreData('订单列表', () => ordersApi.listPaged({
          range: orderRange,
          page: orderPage,
          pageSize: orderPageSize,
          search: orderSearch.trim() || undefined,
          deliveryDateFrom: orderDelivDateStart || undefined,
          deliveryDateTo: orderDelivDateEnd || undefined,
        })),
        fetchCoreData('客户列表', () => customersApi.list()),
        fetchCoreData('产品列表', () => productsApi.list()),
        salesUsersRequest,
      ]);
      if (!isLatestRequest()) return;
      setOrders(o.data);
      setOrderTotal(o.total);
      setCustomers(allCustomers);
      setCustomerOptions(allCustomers.slice(0, 20));
      setProducts(p);
      setSalesUsers(assignableUsers);
      hasFetchedRef.current = true;
    } catch (err) {
      if (!isLatestRequest()) return;
      const reason = getApiErrorMessage(err, '');
      message.error(reason ? `业务数据加载失败，${reason}。请刷新页面` : '业务数据加载失败，请刷新页面');
    } finally {
      if (isLatestRequest()) setLoading(false);
    }
  };

  useEffect(() => { setOrderPage(1); }, [orderRange, orderSearch, orderDelivDateStart, orderDelivDateEnd]);
  useEffect(() => { load(); }, [
    role,
    orderRange,
    orderSearch,
    orderDelivDateStart,
    orderDelivDateEnd,
    orderPage,
    orderPageSize,
    refreshKey,
  ]);
  useEffect(() => { setCustomerPage(1); }, [custSearch, customerRange, customerDateStart, customerDateEnd]);
  useEffect(() => {
    if (!canAssignSalesperson) return;
    const salesperson = salesUsers.find((item) => item.id === selectedSalespersonId);
    orderForm.setFieldValue('salesName', salesperson?.name || creatorName);
  }, [canAssignSalesperson, creatorName, orderForm, salesUsers, selectedSalespersonId]);

  // ─── Order item row helpers ─────────────────────────────────────────────────
  const updateItem = (idx: number, field: keyof OrderItemRow, value: unknown) => {
    setOrderItems((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const inputProductName = (idx: number, productName: string) => {
    setOrderItems((prev) => prev.map((item, i) => i === idx ? {
      ...item,
      productId: null,
      productName,
    } : item));
  };

  const selectProductItem = (idx: number, productName: string) => {
    const product = products.find((item) => item.name === productName);
    setOrderItems((prev) => prev.map((item, i) => i === idx ? {
      ...item,
      productId: product?.id ?? null,
      productName,
      spec: product?.code || '',
      unitPrice: product?.unitPrice ?? null,
    } : item));
  };

  const searchCustomers = async (keyword: string) => {
    const q = keyword.trim();
    if (q.length < 2) {
      if (q.length === 0) {
        try {
          setCustomerOptions(await customersApi.recent());
        } catch (err) {
          console.error('最近客户加载失败', err);
        }
      } else {
        setCustomerOptions([]);
      }
      return;
    }
    setCustomerSearching(true);
    try {
      mergeCustomerOptions(await customersApi.search(q));
    } catch (err) {
      console.error('客户搜索失败', err);
    } finally {
      setCustomerSearching(false);
    }
  };

  const applySelectedCustomer = (customer?: CustomerSearchResult) => {
    if (customer) {
      setSelectedCustomerId(customer.id);
      orderForm.setFieldsValue({ customerName: customer.name, contact: customer.contact, phone: customer.phone });
    } else {
      setSelectedCustomerId(null);
    }
  };

  const addItem = () => {
    setOrderItems((prev) => [...prev, emptyItem(itemKeyCounter)]);
    setItemKeyCounter((k) => k + 1);
  };

  const removeItem = (idx: number) => {
    setOrderItems((prev) => prev.filter((_, i) => i !== idx));
  };

  // ─── Excel helpers ──────────────────────────────────────────────────────────
  const normalizeText = (value: unknown) => String(value ?? '').trim();
  const parseNum = (value: unknown) => {
    const n = Number(normalizeText(value).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : undefined;
  };
  const pickExcelValue = (row: Record<string, string>, patterns: RegExp[]) => {
    const key = Object.keys(row).find((k) => patterns.some((p) => p.test(k)));
    return key ? normalizeText(row[key]) : '';
  };
  const parseExcelDate = (value: string) => {
    if (!value) return undefined;
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 20000) return dayjs('1899-12-30').add(numeric, 'day');
    const parsed = dayjs(value);
    return parsed.isValid() ? parsed : undefined;
  };
  const excelFileKey = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;

  // ─── Modal open/close ───────────────────────────────────────────────────────
  const resetOrderModal = () => {
    setOrderModal(false);
    setEditingOrder(null);
    setEditingWithdrawn(false);
    setSelectedCustomerId(null);
    setOrderItems([emptyItem(0)]);
    setItemKeyCounter(1);
    setOrderFile(null);
    setExcelPreview(null);
    setExcelPreviewFileKey('');
    setExcelStatus('');
    setImageFile(null);
    setImageStatus('');
    orderForm.resetFields();
  };

  const openNewOrder = () => {
    resetOrderModal();
    setOrderModal(true);
    orderForm.setFieldsValue({ salesName: creatorName, salespersonId: undefined, urgent: false });
    customersApi.recent()
      .then((items) => setCustomerOptions(items))
      .catch((err) => {
        console.error('最近客户加载失败', err);
      });
  };

  const applyOrderToEditForm = (order: Order) => {
    if (order.orderItems?.length > 0) {
      const rows: OrderItemRow[] = order.orderItems.map((item: OrderItem, i: number) => ({
        _key: i,
        productId: item.productId ?? null,
        productName: item.productName,
        spec: item.spec || '',
        customerBrand: item.customerBrand || '',
        unit: item.unit || '件',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        remark: item.remark || '',
        detailRequirement: item.detailRequirement || '',
        sourceRowNo: item.sourceRowNo || '',
        ctnCount: item.ctnCount ?? null,
        qtyPerCtn: item.qtyPerCtn ?? null,
        ctnVolume: item.ctnVolume ?? null,
        totalVolume: item.totalVolume ?? null,
        ctnWeight: item.ctnWeight ?? null,
        totalWeight: item.totalWeight ?? null,
      }));
      setOrderItems(rows);
      setItemKeyCounter(rows.length);
    } else {
      // Legacy order: create one row from product fields
      setOrderItems([{
        _key: 0,
        productId: order.productId || null,
        productName: order.product?.name || '',
        spec: order.product?.code || '',
        customerBrand: '',
        unit: '件',
        quantity: order.quantity,
        unitPrice: order.unitPrice,
        remark: '',
        detailRequirement: '',
        sourceRowNo: '',
        ctnCount: null,
        qtyPerCtn: null,
        ctnVolume: null,
        totalVolume: null,
        ctnWeight: null,
        totalWeight: null,
      }]);
      setItemKeyCounter(1);
    }

    orderForm.setFieldsValue({
      customerName: order.customer.name,
      contact: order.customer.contact || '',
      deliveryDate: dayjs(order.deliveryDate),
      salesName: order.salespersonName || order.createdBy || currentSalesName,
      notes: order.notes,
      urgent: order.urgent || false,
      urgentReason: order.urgentReason || '',
    });
  };

  const fetchFullOrder = async (order: Order) => {
    setOrderDetailLoading(order.id);
    try {
      return await ordersApi.get(order.id);
    } catch (err) {
      console.error('订单详情加载失败', err);
      message.error('订单详情加载失败，请稍后重试');
      return null;
    } finally {
      setOrderDetailLoading(null);
    }
  };

  const openOrderDetail = async (order: Order) => {
    const fullOrder = await fetchFullOrder(order);
    if (fullOrder) setSelectedOrder(fullOrder);
  };

  const openEditOrder = async (order: Order, withdrawn = false) => {
    const fullOrder = await fetchFullOrder(order);
    if (!fullOrder) return;
    setEditingOrder(fullOrder);
    setEditingWithdrawn(withdrawn);
    setSelectedCustomerId(fullOrder.customerId);
    setOrderFile(null);
    setExcelPreview(null);
    setExcelPreviewFileKey('');
    setExcelStatus('');
    applyOrderToEditForm(fullOrder);
    setOrderModal(true);
  };

  const editPendingOrder = (order: Order) => {
    Modal.confirm({
      title: '撤回审批并编辑订单',
      content: '该订单正在等待审批。编辑订单将自动撤回审批，订单状态退回草稿，修改后需重新提交审批。是否继续？',
      okText: '继续编辑',
      cancelText: '取消',
      onOk: async () => {
        try {
          const withdrawnOrder = await ordersApi.action(order.id, 'withdraw', '编辑订单自动撤回审批');
          await load();
          onDataChanged('sales_order_changed', 'sales');
          setEditingOrder(withdrawnOrder);
          setEditingWithdrawn(true);
          setSelectedCustomerId(withdrawnOrder.customerId);
          setOrderFile(null);
          setExcelPreview(null);
          setExcelPreviewFileKey('');
          setExcelStatus('');
          applyOrderToEditForm(withdrawnOrder);
          setOrderModal(true);
        } catch (err) {
          console.error('订单撤回审批失败', err);
          message.error(getApiErrorMessage(err, '撤回审批失败'));
        }
      },
    });
  };

  const deleteOrder = async (order: Order) => {
    try {
      await ordersApi.delete(order.id);
      message.success('订单已删除');
      await load();
      onDataChanged('sales_order_changed', 'sales');
    } catch (err) {
      console.error('订单删除失败', err);
      message.error(getApiErrorMessage(err, '删除订单失败'));
    }
  };

  const confirmDeleteOrder = (order: Order) => {
    Modal.confirm({
      title: '删除订单',
      content: order.status === 'pending_approval'
        ? '该订单正在审批中，删除后将自动撤回审批，是否继续？'
        : '删除后该订单及相关明细将不可恢复，是否继续？',
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => deleteOrder(order),
    });
  };

  // ─── Submit ─────────────────────────────────────────────────────────────────
  const submitOrder = async () => {
    let values;
    try { values = await orderForm.validateFields(); } catch { return; }

    const validItems = orderItems.filter(
      (item) => item.productName.trim() && item.quantity != null && item.quantity > 0 && item.unitPrice != null && item.unitPrice >= 0,
    );
    if (validItems.length === 0) {
      message.warning('请至少填写一行有效产品明细（产品名称、数量、单价为必填项）');
      return;
    }

    setSubmitting(true);
    try {
      const deliveryDate = (values.deliveryDate as dayjs.Dayjs).format('YYYY-MM-DD');
      const notes = (values.notes as string) || '';
      const urgent = (values.urgent as boolean) || false;
      const urgentReason = urgent ? ((values.urgentReason as string) || '') : '';
      const items = validItems.map((item) => ({
        productId: item.productId || undefined,
        productName: item.productName.trim(),
        spec: item.spec || '',
        customerBrand: item.customerBrand || '',
        quantity: item.quantity!,
        unitPrice: item.unitPrice!,
        remark: item.remark || '',
        detailRequirement: item.detailRequirement || '',
        sourceRowNo: item.sourceRowNo || '',
        ctnCount: item.ctnCount ?? undefined,
        qtyPerCtn: item.qtyPerCtn ?? undefined,
        ctnVolume: item.ctnVolume ?? undefined,
        totalVolume: item.totalVolume ?? undefined,
        ctnWeight: item.ctnWeight ?? undefined,
        totalWeight: item.totalWeight ?? undefined,
      }));

      if (editingOrder) {
        await ordersApi.update(editingOrder.id, { deliveryDate, notes, urgent, urgentReason, items });
      } else {
        const salespersonId = canAssignSalesperson ? Number(values.salespersonId) || undefined : undefined;
        if (canAssignSalesperson && !salespersonId) {
          message.error('请选择订单业务员');
          return;
        }
        let finalCustomerId = selectedCustomerId;
        if (!finalCustomerId) {
          try {
            const newCust = await customersApi.create({
              name: values.customerName as string,
              contact: (values.contact as string) || '',
              phone: (values.phone as string) || '',
              ...orderCustomerOwnerPayload(values.salespersonId as number | undefined),
              rating: 'B',
              email: '',
              address: '',
              notes: '',
            });
            finalCustomerId = newCust.id;
          } catch (err) {
            console.error('订单保存前创建客户失败', err);
            message.error(`客户创建失败：${getApiErrorMessage(err, '请检查客户信息')}`);
            return;
          }
        }

        let createdOrder: Order;
        try {
          createdOrder = await ordersApi.create({
            customerId: finalCustomerId,
            salespersonId,
            deliveryDate,
            notes,
            contractRef: '',
            urgent,
            urgentReason,
            items,
          });
        } catch (err) {
          console.error('订单草稿创建失败', err);
          message.error(`订单保存失败：${getApiErrorMessage(err, '请检查订单内容')}`);
          return;
        }
        Modal.confirm({
          title: '订单已保存为草稿',
          content: '是否现在提交给经理层审批？提交后订单将进入等待审批中。',
          okText: '提交审批',
          cancelText: '稍后处理',
          onOk: async () => {
            await ordersApi.action(createdOrder.id, 'submit');
            await load();
            onDataChanged('sales_submit', 'sales');
          },
        });
      }

      resetOrderModal();
      try {
        await load();
        onDataChanged('sales_order_changed', 'sales');
      } catch (err) {
        console.error('订单保存后刷新数据失败', err);
        message.warning(`订单已保存，但刷新列表失败：${getApiErrorMessage(err, '请手动刷新页面')}`);
      }
    } catch (err) {
      console.error(err);
      message.error(getApiErrorMessage(err, '保存失败，请检查填写内容'));
    } finally {
      setSubmitting(false);
    }
  };

  const submitForApproval = async (orderId: number) => {
    try {
      await ordersApi.action(orderId, 'submit');
      await load(); onDataChanged('sales_submit', 'sales');
    } catch (err) {
      console.error(err);
      message.error(getApiErrorMessage(err, '提交审批失败'));
    }
  };

  // ─── Excel upload ───────────────────────────────────────────────────────────
  // 把解析结果（正则或 AI）写入表单与明细表
  // fileKey: 当前 Excel 文件指纹，用于 import 时与后端 previewHash 校验对齐；可选，AI/正则两条路径都会传入
  const applyExcelPreview = (preview: ExcelPreview, sourceLabel: string, fileKey?: string) => {
    setExcelPreview(preview);
    if (fileKey !== undefined) setExcelPreviewFileKey(fileKey);
    const row = preview.rows[0] || {};
    const contractRef = pickExcelValue(row, [/合同编号/i, /合同/i, /contract/i, /po/i]);
    const customerName = preview.contractInfo.customerName || pickExcelValue(row, [/客户名称/i, /^客户$/i, /customer/i]);
    const contact = pickExcelValue(row, [/联系人/i, /contact/i]);
    const phone = pickExcelValue(row, [/联系电话/i, /电话/i, /phone/i, /tel/i]);
    const productName = pickExcelValue(row, [/产品名称/i, /^产品$/i, /品名/i, /货物/i, /description/i]);
    const modelSpec = pickExcelValue(row, [/型号规格/i, /型号/i, /规格/i, /model/i, /spec/i]);
    const customerBrand = pickExcelValue(row, [/客户品牌/i, /品牌/i, /brand/i]);
    const quantity = parseNum(pickExcelValue(row, [/数量/i, /qty/i]));
    const unitPrice = parseNum(pickExcelValue(row, [/单价/i, /unit.*price/i]));
    const deliveryDate = parseExcelDate(preview.contractInfo.deliveryDate || pickExcelValue(row, [/交货日期/i, /交期/i, /delivery/i]));
    const salesName = pickExcelValue(row, [/业务员/i, /sales/i]);
    const notes = pickExcelValue(row, [/备注/i, /note/i, /remark/i]);
    const customer = customerName
      ? customerOptions.find((c) => customerName.includes(c.name) || c.name.includes(customerName))
      : undefined;

    setSelectedCustomerId(customer?.id ?? null);

    orderForm.setFieldsValue({
      contractRef: contractRef || orderForm.getFieldValue('contractRef'),
      // 客户名总是被解析结果覆盖：解析失败时清空，避免误显示之前残留的客户名
      customerName: customerName || '',
      contact: contact || orderForm.getFieldValue('contact'),
      phone: phone || orderForm.getFieldValue('phone'),
      deliveryDate: deliveryDate || orderForm.getFieldValue('deliveryDate'),
      salesName: salesName || orderForm.getFieldValue('salesName') || creatorName,
      notes: notes || orderForm.getFieldValue('notes'),
    });
    if (!customerName) {
      message.warning('未能自动识别客户名称，请手动选择或输入');
    }

    // 把解析出的全部明细行装入 orderItems（手动录入仍可在表中编辑覆盖）
    if (preview.items && preview.items.length > 0) {
      let nextKey = Date.now();
      setOrderItems(preview.items.map((item) => ({
        _key: nextKey++,
        productId: null,
        productName: item.productName,
        detailRequirement: item.detailRequirement || '',
        unit: item.unit || '件',
        quantity: item.quantity || null,
        unitPrice: item.unitPrice || null,
        spec: item.spec || '',
        customerBrand: item.customerBrand || '',
        remark: item.remark || '',
        sourceRowNo: item.sourceRowNo || '',
        ctnCount: item.ctnCount ?? null,
        qtyPerCtn: item.qtyPerCtn ?? null,
        ctnVolume: item.ctnVolume ?? null,
        totalVolume: item.totalVolume ?? null,
        ctnWeight: item.ctnWeight ?? null,
        totalWeight: item.totalWeight ?? null,
      })));
    } else if (productName || quantity != null || unitPrice != null) {
      // 兜底：解析器没产出 items 但表头行可用
      setOrderItems([{
        ...emptyItem(Date.now()),
        productName: productName || '',
        spec: modelSpec || '',
        customerBrand: customerBrand || '',
        quantity: quantity ?? null,
        unitPrice: unitPrice ?? null,
      }]);
    }

    const warningText = preview.diagnostics?.warnings?.length ? `；${preview.diagnostics.warnings.join('；')}` : '';
    const missingText = preview.diagnostics && !preview.diagnostics.canImport
      ? `；缺少：${preview.diagnostics.missingRequiredFields.join('、')}`
      : '';
    setExcelStatus(`${sourceLabel}：已读取 ${preview.totalRows} 行，明细已装入下方表格（可手动修改），解析器：${preview.diagnostics?.parser || 'generic'}${warningText}${missingText}`);
  };

  const handleExcelFile = async (file: File) => {
    const requestSeq = ++excelPreviewSeqRef.current;
    const fileKey = excelFileKey(file);
    setOrderFile(file);
    // Excel 与图片互斥：上传 Excel 时清掉图片上下文
    setImageFile(null);
    setImageStatus('');
    setExcelStatus(`已选择附件：${file.name}`);
    setExcelPreview(null);
    setExcelPreviewFileKey('');
    // 上传新 Excel 时必须先清空旧明细，避免新文件解析失败或异步返回乱序时沿用上一次表格的产品行。
    setOrderItems([emptyItem(0)]);
    setItemKeyCounter(1);
    try {
      const preview = await excelApi.preview(file);
      if (requestSeq !== excelPreviewSeqRef.current) return false;
      applyExcelPreview(preview, '正则解析', fileKey);
    } catch {
      if (requestSeq !== excelPreviewSeqRef.current) return false;
      setExcelStatus(`已保留附件：${file.name}，未能读取 Excel 内容。`);
      setExcelPreviewFileKey('');
      setOrderItems([emptyItem(0)]);
      setItemKeyCounter(1);
    }
    return false;
  };

  const runAIParse = async () => {
    if (!orderFile) {
      message.warning('请先上传 Excel 文件');
      return;
    }
    // 复用同一个 seq 来确保 AI 与正则解析互相 dedup（同时 / 快速点击时只采纳最新一次）
    const requestSeq = ++excelPreviewSeqRef.current;
    const fileKey = excelFileKey(orderFile);
    setAiParsing(true);
    setExcelStatus(`🪄 AI 智能解析中（千问 qwen-turbo），约需 30–60 秒，请耐心等待…`);
    try {
      const preview = await excelApi.aiParse(orderFile);
      if (requestSeq !== excelPreviewSeqRef.current) return;
      applyExcelPreview(preview, '🪄 AI 智能解析', fileKey);
      message.success('AI 智能解析完成，请核对预览结果，可手动修改后再导入');
    } catch (err) {
      if (requestSeq !== excelPreviewSeqRef.current) return;
      console.error('AI 智能解析失败', err);
      message.error(getApiErrorMessage(err, 'AI 智能解析失败，请稍后重试或回退到正则解析'));
      setExcelStatus(`AI 智能解析失败：${getApiErrorMessage(err, '请稍后重试')}`);
    } finally {
      setAiParsing(false);
    }
  };

  // 上传订单图片 → 直接走千问 VL 视觉识别 → 填表
  // 图片识别不走 /excel/import 的二次校验链路（因为后端无法把图片再当 Excel 解析），
  // 用户审核明细后通过下方主表单"保存草稿"按钮提交即可。
  const handleImageFile = async (file: File) => {
    // 图片与 Excel 互斥：上传图片时先清掉 Excel 上下文
    excelPreviewSeqRef.current += 1;
    setOrderFile(null);
    setExcelPreviewFileKey('');
    setExcelPreview(null);
    setExcelStatus('');

    setImageFile(file);
    setImageStatus(`🪄 AI 图片识别中（千问视觉模型），约需 15–60 秒，请耐心等待…`);
    setImageParsing(true);

    const requestSeq = ++excelPreviewSeqRef.current;
    try {
      const preview = await excelApi.aiParseImage(file);
      if (requestSeq !== excelPreviewSeqRef.current) return false;
      // fileKey 传空串：避免后续 Excel "调用现有接口导入" 误用图片预览结果
      applyExcelPreview(preview, '🪄 AI 图片识别', '');
      setImageStatus(`✅ 图片识别完成：${file.name}，已读取 ${preview.totalRows} 行明细，请在下方"产品明细"表中核对后保存草稿`);
      message.success('AI 图片识别完成，请核对明细后点击"保存草稿"');
    } catch (err) {
      if (requestSeq !== excelPreviewSeqRef.current) return false;
      console.error('AI 图片识别失败', err);
      const msg = getApiErrorMessage(err, '请稍后重试或换一张更清晰的图片');
      message.error(`AI 图片识别失败：${msg}`);
      setImageStatus(`AI 图片识别失败：${msg}`);
    } finally {
      setImageParsing(false);
    }
    return false;
  };

  const importExcelOrders = async () => {
    if (!orderFile) return;
    if (!excelPreview || excelPreviewFileKey !== excelFileKey(orderFile)) {
      setExcelStatus('当前 Excel 尚未完成解析，请等待解析完成后再导入，避免误用上一次表格明细。');
      return;
    }
    if (!excelPreview.diagnostics?.canImport) {
      setExcelStatus(`Excel 解析不完整，缺少：${excelPreview.diagnostics?.missingRequiredFields.join('、') || '必要字段'}`);
      return;
    }
    const values = orderForm.getFieldsValue();
    const deliveryDate = values.deliveryDate as dayjs.Dayjs | undefined;
    let customerId = selectedCustomerId;
    const salespersonId = canAssignSalesperson ? Number(values.salespersonId) || undefined : undefined;
    if (canAssignSalesperson && !salespersonId) {
      setExcelStatus('请选择订单业务员后再导入订单。');
      return;
    }

    if (!customerId) {
      const customerName = values.customerName as string | undefined;
      if (customerName && deliveryDate) {
        try {
          const newCust = await customersApi.create({
            name: customerName,
            contact: (values.contact as string) || '',
            phone: (values.phone as string) || '',
            ...orderCustomerOwnerPayload(values.salespersonId as number | undefined),
            rating: 'B',
            email: '',
            address: '',
            notes: '',
          });
          customerId = newCust.id;
          setSelectedCustomerId(customerId);
        } catch (err) {
          console.error(err);
          setExcelStatus(getApiErrorMessage(err, '客户创建失败，无法导入为订单草稿'));
          return;
        }
      }
    }

    if (!customerId || !deliveryDate) {
      setExcelStatus('已保留附件。填写客户名称和交货日期后，可导入为订单草稿。');
      return;
    }
    setExcelImporting(true);
    try {
      // 把当前 6 列可编辑表里的全部行（用户编辑后的最终版）作为 items 上传
      const editedItems: ParsedExcelItem[] = orderItems
        .filter((row) => (row.productName || '').trim())
        .map((row) => ({
          productName: row.productName,
          detailRequirement: row.detailRequirement || '',
          unit: row.unit || '件',
          quantity: row.quantity || 1,
          unitPrice: row.unitPrice || 0,
          subtotal: (row.quantity || 1) * (row.unitPrice || 0),
          spec: row.spec || '',
          customerBrand: row.customerBrand || '',
          remark: row.remark || '',
          sourceRowNo: row.sourceRowNo || '',
          ctnCount: row.ctnCount ?? null,
          qtyPerCtn: row.qtyPerCtn ?? null,
          ctnVolume: row.ctnVolume ?? null,
          totalVolume: row.totalVolume ?? null,
          ctnWeight: row.ctnWeight ?? null,
          totalWeight: row.totalWeight ?? null,
        }));
      const result = await excelApi.import(orderFile, {
        customerId,
        salespersonId,
        contractRef: (values.contractRef as string) || '',
        deliveryDate: deliveryDate.format('YYYY-MM-DD'),
        previewHash: excelPreview.previewHash,
        items: editedItems,
      });
      setExcelStatus(`已导入 ${result.imported} 条订单${result.errors.length ? `，${result.errors.length} 条未导入` : ''}`);
      await load(); onDataChanged('sales_order_changed', 'sales');
    } catch (err) {
      console.error(err);
      setExcelStatus(getApiErrorMessage(err, '导入未完成，附件已保留在当前弹窗中。'));
    } finally {
      setExcelImporting(false);
    }
  };

  // ─── Customer functions ─────────────────────────────────────────────────────
  const createCustomer = async () => {
    let values;
    try { values = await custForm.validateFields(); } catch { return; }
    try {
      const data: Partial<Customer> = {
        ...values,
      };
      if (role === 'sales') {
        data.salespersonName = creatorName;
      } else {
        const salespersonId = values.salespersonId as number | undefined;
        if (salespersonId) data.salespersonId = salespersonId;
        delete data.salespersonName;
      }
      await customersApi.create(data);
      setCustModal(false);
      custForm.resetFields();
      setSelectedCust(null);
      await load();
    } catch (err) {
      console.error(err);
      message.error(getApiErrorMessage(err, '创建失败'));
    }
  };

  const viewCustomer = async (id: number) => {
    const c = await customersApi.get(id);
    setSelectedCust(c);
    logForm.setFieldsValue({ type: '电话', outcome: '正常', content: '', createdBy: currentSalesName });
  };

  const deleteCustomer = async (customer: Customer) => {
    try {
      await customersApi.delete(customer.id);
      message.success('客户已删除');
      if (selectedCust?.id === customer.id) setSelectedCust(null);
      await load();
    } catch (err) {
      console.error('客户删除失败', err);
      message.error(getApiErrorMessage(err, '删除客户失败'));
    }
  };

  const confirmDeleteCustomer = (customer: Customer) => {
    Modal.confirm({
      title: '删除客户',
      content: `确认删除「${customer.name}」？已有订单记录的客户不能删除。`,
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => deleteCustomer(customer),
    });
  };

  const addLog = async () => {
    if (!selectedCust) return;
    try {
      await logForm.validateFields(['content']);
      await customersApi.addLog(selectedCust.id, logForm.getFieldsValue());
      const c = await customersApi.get(selectedCust.id);
      setSelectedCust(c);
      logForm.setFieldValue('content', '');
    } catch (err) {
      console.error(err);
      message.error(getApiErrorMessage(err, '沟通记录保存失败'));
    }
  };

  if (loading && !hasFetchedRef.current) return (
    <div className="sales-management-panel">
      <PageHeader title="订单录入与客户跟进" subtitle="管理订单草稿、客户信息与沟通记录" />
      <Card size="small">
        <Skeleton active paragraph={{ rows: 10 }} />
      </Card>
    </div>
  );

  const currentOrderRangeLabel = TIME_RANGE_OPTIONS.find((item) => item.value === orderRange)?.label || '近一个月';

  // ─── Order modal item table columns (6 列统一口径) ────────────────────────
  const itemColumns = [
    {
      title: <><span style={{ color: '#ff4d4f' }}>*</span> 产品名称</>,
      key: 'productName',
      width: 180,
      render: (_: unknown, rec: OrderItemRow, idx: number) => (
        <AutoComplete
          size="small"
          value={rec.productName}
          options={products.map((p) => ({ label: `[${p.code}] ${p.name}`, value: p.name }))}
          filterOption={(input, option) =>
            (option?.label as string ?? '').toLowerCase().includes(input.toLowerCase())
          }
          onChange={(value) => inputProductName(idx, value)}
          onSelect={(value) => selectProductItem(idx, value)}
          style={{ width: '100%' }}
          placeholder="产品名称"
        />
      ),
    },
    {
      title: '详细要求',
      key: 'detailRequirement',
      width: 260,
      render: (_: unknown, rec: OrderItemRow, idx: number) => (
        <Input.TextArea
          size="small"
          value={rec.detailRequirement}
          onChange={(e) => updateItem(idx, 'detailRequirement', e.target.value)}
          autoSize={{ minRows: 1, maxRows: 4 }}
          placeholder="如：动力型号 178F；泵体规格 3寸铝壳泵"
        />
      ),
    },
    {
      title: '单位',
      key: 'unit',
      width: 80,
      render: (_: unknown, rec: OrderItemRow, idx: number) => (
        <Input
          size="small"
          value={rec.unit}
          onChange={(e) => updateItem(idx, 'unit', e.target.value)}
          placeholder="件"
        />
      ),
    },
    {
      title: <><span style={{ color: '#ff4d4f' }}>*</span> 数量</>,
      key: 'quantity',
      width: 90,
      render: (_: unknown, rec: OrderItemRow, idx: number) => (
        <InputNumber
          size="small"
          min={1}
          value={rec.quantity ?? undefined}
          onChange={(v) => updateItem(idx, 'quantity', v)}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: (
        <Tooltip title="按未税口径录入；含税请用单独的财务流程">
          <span><span style={{ color: '#ff4d4f' }}>*</span> 未税单价(¥)</span>
        </Tooltip>
      ),
      key: 'unitPrice',
      width: 120,
      render: (_: unknown, rec: OrderItemRow, idx: number) => (
        <InputNumber
          size="small"
          min={0}
          precision={2}
          value={rec.unitPrice ?? undefined}
          onChange={(v) => updateItem(idx, 'unitPrice', v)}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: '总价',
      key: 'subtotal',
      width: 110,
      align: 'right' as const,
      render: (_: unknown, rec: OrderItemRow) => {
        const subtotal = (rec.quantity || 0) * (rec.unitPrice || 0);
        return subtotal > 0
          ? <Text strong style={{ fontSize: 12 }}>{formatCurrency(subtotal)}</Text>
          : <Text type="secondary">—</Text>;
      },
    },
    {
      title: '',
      key: 'action',
      width: 60,
      align: 'center' as const,
      render: (_: unknown, _rec: OrderItemRow, idx: number) => (
        <Button
          size="small"
          danger
          type="text"
          disabled={orderItems.length <= 1}
          onClick={() => removeItem(idx)}
        >
          删除
        </Button>
      ),
    },
  ];

  // ─── Orders table columns ──────────────────────────────────────────────────
  const sharedOrderColumns: TableColumnsType<Order> = [
    {
      title: '合同编号', dataIndex: 'contractNo', width: 138, fixed: 'left', align: 'left',
      render: (v) => {
        const val = (v as string) || '';
        return <code className={val ? 'sales-table-code' : 'sales-table-code is-empty'}>{val || '—'}</code>;
      },
    },
    {
      title: '客户', width: 150,
      render: (_, o) => <span className="sales-customer-name">{o.customer.name}</span>,
    },
    {
      title: '产品摘要', ellipsis: true, width: 210,
      render: (_, o) => <span className="sales-table-summary">{getOrderProductSummary(o)}</span>,
    },
    {
      title: '款数', align: 'center', width: 52,
      render: (_, o) => <span className="sales-order-number">{o.itemCount || o.orderItems?.length || 1}</span>,
    },
    {
      title: '业务员', width: 80,
      render: (_, o) => <span className="sales-order-person">{o.salespersonName || o.createdBy || '—'}</span>,
    },
    {
      title: '总数量', align: 'right', width: 68,
      render: (_, o) => <span className="sales-order-number">{o.totalQuantity || o.quantity}</span>,
    },
    ...(canViewAmount ? [{
      title: '总价', dataIndex: 'totalAmount', align: 'right' as const, width: 100,
      render: (v: unknown) => <span className="sales-order-amount">{formatCurrency(v as number)}</span>,
    }] : []),
    {
      title: '交期', width: 112,
      render: (_, o) => <span className="sales-due-date">{formatDate(o.deliveryDate, 'YYYY/MM/DD')}</span>,
    },
    {
      title: '状态', width: 105,
      render: (_, o) => <StatusBadge status={o.status} />,
    },
  ];

  const orderColumns: TableColumnsType<Order> = [
    ...sharedOrderColumns,
    {
      title: '操作', align: 'left', width: 190, fixed: 'right', className: 'sales-action-column',
      render: (_, o) => {
        if (canUseOrderActions && o.status === 'draft') {
          return (
            <Space size={0} className="sales-inline-actions">
              <Button type="link" size="small" onClick={() => submitForApproval(o.id)}>提交</Button>
              <Button type="link" size="small" loading={orderDetailLoading === o.id} onClick={() => openEditOrder(o)}>编辑</Button>
              <Button type="link" size="small" danger onClick={() => confirmDeleteOrder(o)}>删除</Button>
              <Button type="link" size="small" loading={orderDetailLoading === o.id} onClick={() => openOrderDetail(o)}>详情</Button>
            </Space>
          );
        }
        if (canUseOrderActions && o.status === 'pending_approval' && !o.prevStatus) {
          return (
            <Space size={0} className="sales-inline-actions">
              <Button type="link" size="small" loading={orderDetailLoading === o.id} onClick={() => editPendingOrder(o)}>编辑</Button>
              <Button type="link" size="small" danger onClick={() => confirmDeleteOrder(o)}>删除</Button>
              <Button type="link" size="small" loading={orderDetailLoading === o.id} onClick={() => openOrderDetail(o)}>详情</Button>
            </Space>
          );
        }
        return <Space size={0} className="sales-inline-actions"><Button type="link" size="small" loading={orderDetailLoading === o.id} onClick={() => openOrderDetail(o)}>详情</Button></Space>;
      },
    },
  ];

  const customerColumns: TableColumnsType<Customer> = [
    { title: '客户', dataIndex: 'name', render: (v) => <span className="sales-customer-name">{v as string}</span>, width: 210 },
    { title: '联系人', dataIndex: 'contact', width: 130, render: (v) => <span className="sales-order-person">{(v as string) || '—'}</span> },
    { title: '联系方式', dataIndex: 'phone', width: 138, render: (v) => <span className="sales-order-number">{(v as string) || '—'}</span> },
    { title: '所属业务员', dataIndex: 'salespersonName', render: (v) => <span className="sales-order-person">{(v as string) || '未分配'}</span>, width: 128 },
    {
      title: '等级',
      dataIndex: 'rating',
      // 与订单板块状态色块视觉一致：复用 AntD Tag，吃 .sales-management-panel .ant-tag 全局样式
      render: (v) => <Tag color={RATING_COLOR[String(v || 'B')] || 'default'}>{(v as string) || 'B'} 级</Tag>,
      width: 70,
    },
    { title: '订单数', render: (_, c) => <span className="sales-order-number">{c._count?.orders || 0}</span>, align: 'right', width: 68 },
    { title: '沟通记录', render: (_, c) => <span className="sales-order-number">{c._count?.commLogs || 0}</span>, align: 'right', width: 80 },
    {
      title: '操作',
      align: 'left',
      fixed: 'right',
      width: 128,
      className: 'sales-action-column sales-customer-action-column',
      render: (_: unknown, c: Customer) => (
        <Space size={0} className="sales-inline-actions sales-customer-actions">
          <Button type="link" size="small" onClick={() => viewCustomer(c.id)}>查看</Button>
          {canUseCustomerActions && <Button type="link" danger size="small" onClick={() => confirmDeleteCustomer(c)}>删除</Button>}
        </Space>
      ),
    },
  ];

  const customerSearchTerms = custSearch.split(/[,，\s]+/).map((item) => item.trim()).filter(Boolean);
  const customerRangeStart = customerDateStart
    ? dayjs(customerDateStart).startOf('day')
    : dayjs().subtract(Number(customerRange.replace(/[^\d]/g, '')) || 1, customerRange === '1y' ? 'year' : 'month').startOf('day');
  const customerRangeEnd = customerDateEnd ? dayjs(customerDateEnd).endOf('day') : null;
  const filteredCustomers = customers.filter((c) => {
    const createdAt = dayjs(c.createdAt);
    const inTimeRange = createdAt.isValid()
      && !createdAt.isBefore(customerRangeStart)
      && (!customerRangeEnd || !createdAt.isAfter(customerRangeEnd));
    if (!inTimeRange) return false;
    if (customerSearchTerms.length === 0) return true;
    const haystack = [c.name, c.contact, c.salespersonName].join(' ');
    return customerSearchTerms.every((term) => haystack.includes(term));
  });
  const customerTotal = filteredCustomers.length;
  const pagedCustomers = filteredCustomers.slice((customerPage - 1) * customerPageSize, customerPage * customerPageSize);

  const renderSalesPagination = (
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

  const tabItems = [
    {
      key: 'orders',
      label: `${shouldFilterBySalesperson ? '我的订单' : '订单'}${orderTotal > 0 ? ` (${orderTotal})` : ''}`,
      children: (
        <div className="sales-list-panel">
          <div className="ymt-filter-bar">
            <label className="ymt-filter ymt-time-filter">
              <span className="ymt-filter-label">时间范围</span>
              <span className="ymt-filter-value">{TIME_RANGE_LABELS[orderRange]}</span>
              <svg className="ymt-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <select className="ymt-select-native" value={orderRange} onChange={(e) => setOrderRange(e.target.value as TimeRangeKey)}>
                {TIME_RANGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label className="ymt-filter ymt-search-filter">
              <svg className="ymt-search-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" /><path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              <input className="ymt-search-text" value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)} placeholder="请输入客户名称/合同编号/业务员名称，多条用逗号隔开" />
            </label>
            <div className="ymt-filter ymt-date-filter">
              <span className="ymt-filter-label ymt-date-label">交付日期</span>
              <DatePicker
                className="ymt-date-input"
                variant="borderless"
                value={orderDelivDateStart ? dayjs(orderDelivDateStart) : null}
                onChange={(d) => setOrderDelivDateStart(d ? d.format('YYYY-MM-DD') : '')}
                placeholder="开始时间"
                format="YYYY-MM-DD"
                suffixIcon={null}
                allowClear
              />
              <span className="ymt-date-sep">至</span>
              <DatePicker
                className="ymt-date-input"
                variant="borderless"
                value={orderDelivDateEnd ? dayjs(orderDelivDateEnd) : null}
                onChange={(d) => setOrderDelivDateEnd(d ? d.format('YYYY-MM-DD') : '')}
                placeholder="截止时间"
                format="YYYY-MM-DD"
                suffixIcon={null}
                allowClear
              />
            </div>
            {canUseOrderActions && (
              <button className="ymt-create-btn" type="button" onClick={openNewOrder}>+ 新建订单</button>
            )}
          </div>
          <Table<Order>
            className="sales-data-table sales-order-table"
            rowKey="id"
            columns={orderColumns}
            dataSource={orders}
            rowClassName={(record) => selectedOrder?.id === record.id ? 'sales-order-row-selected' : ''}
            scroll={{ x: 1120 }}
            pagination={false}
            locale={{
              emptyText: (
                <div style={{ padding: '28px 0' }}>
                  <Text type="secondary">{`${currentOrderRangeLabel}暂无订单`}</Text>
                </div>
              ),
            }}
          />
          {renderSalesPagination(orderPage, orderPageSize, orderTotal, (page, pageSize) => {
            setOrderPage(page);
            setOrderPageSize(pageSize);
          })}
        </div>
      ),
    },
    {
      key: 'customers',
      label: `客户管理${customers.length > 0 ? ` (${customers.length})` : ''}`,
      children: selectedCust ? (
        /* Customer detail */
        <div className="customer-detail">
          <button type="button" className="customer-detail-back" onClick={() => setSelectedCust(null)}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="14" height="14"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span>返回列表</span>
          </button>

          {/* 基本信息 */}
          <Card
            size="small"
            className="customer-detail-card"
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Text strong style={{ fontSize: 18, color: '#0f1318' }}>{selectedCust.name}</Text>
                <Tag color={RATING_COLOR[selectedCust.rating] || 'default'} style={{ marginInlineEnd: 0 }}>{selectedCust.rating} 级</Tag>
              </div>
            }
          >
            <Descriptions
              column={2}
              size="small"
              colon={false}
              labelStyle={{ width: 96, color: '#64748b', fontWeight: 500 }}
              contentStyle={{ color: '#1a1d23' }}
            >
              <Descriptions.Item label="联系人">{selectedCust.contact || '—'}</Descriptions.Item>
              <Descriptions.Item label="联系方式">{selectedCust.phone || '—'}</Descriptions.Item>
              <Descriptions.Item label="邮箱">{selectedCust.email || '—'}</Descriptions.Item>
              <Descriptions.Item label="所属业务员">{selectedCust.salespersonName || <Text type="secondary">未分配</Text>}</Descriptions.Item>
              <Descriptions.Item label="地址" span={2}>{selectedCust.address || '—'}</Descriptions.Item>
              {selectedCust.notes && (
                <Descriptions.Item label="备注" span={2}>
                  <span style={{ whiteSpace: 'pre-wrap' }}>{selectedCust.notes}</span>
                </Descriptions.Item>
              )}
            </Descriptions>
          </Card>

          {/* 历史订单 */}
          <Card
            size="small"
            className="customer-detail-card"
            title={`历史订单 (${selectedCust._count?.orders ?? selectedCust.orders?.length ?? 0})`}
            extra={(selectedCust._count?.orders ?? 0) > (selectedCust.orders?.length ?? 0) ? (
              <Text type="secondary" style={{ fontSize: 12 }}>仅显示最近 {selectedCust.orders?.length ?? 0} 条</Text>
            ) : null}
          >
            {(selectedCust.orders?.length ?? 0) === 0 ? (
              <Text type="secondary" style={{ fontSize: 13 }}>暂无历史订单</Text>
            ) : (
              <div className="customer-order-list">
                {selectedCust.orders?.slice(0, 5).map((o) => (
                  <div key={o.id} className="customer-order-row">
                    <code className={o.contractNo ? 'sales-table-code' : 'sales-table-code is-empty'} style={{ minWidth: 120 }}>{o.contractNo || '—'}</code>
                    <span className="customer-order-product">{getOrderProductSummary(o)}</span>
                    {canViewAmount && <Text strong style={{ color: '#0f1318' }}>{formatCurrency(o.totalAmount)}</Text>}
                    <StatusBadge status={o.status} />
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* 沟通记录 */}
          <Card
            size="small"
            className="customer-detail-card"
            title={`沟通记录 (${selectedCust._count?.commLogs ?? selectedCust.commLogs?.length ?? 0})`}
            extra={(selectedCust._count?.commLogs ?? 0) > (selectedCust.commLogs?.length ?? 0) ? (
              <Text type="secondary" style={{ fontSize: 12 }}>仅显示最近 {selectedCust.commLogs?.length ?? 0} 条</Text>
            ) : null}
          >
            {canUseCustomerActions && (
              <Form
                form={logForm}
                layout="vertical"
                initialValues={{ type: '电话', outcome: '正常', content: '', createdBy: currentSalesName }}
                className="comm-log-form"
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 160px', gap: 12 }}>
                  <Form.Item label="沟通方式" name="type" style={{ marginBottom: 8 }}>
                    <Select options={['电话', '拜访', '微信', '邮件', '展会', '视频会议'].map((t) => ({ label: t, value: t }))} />
                  </Form.Item>
                  <Form.Item label="沟通结果" name="outcome" style={{ marginBottom: 8 }}>
                    <Select options={['满意', '正常', '待跟进', '已成交', '投诉'].map((t) => ({ label: t, value: t }))} />
                  </Form.Item>
                  <Form.Item label="记录人" name="createdBy" style={{ marginBottom: 8 }}>
                    <Input placeholder="记录人" />
                  </Form.Item>
                </div>
                <Form.Item label="沟通内容" name="content" rules={[{ required: true, message: '请填写沟通内容' }]} style={{ marginBottom: 8 }}>
                  <Input.TextArea rows={3} placeholder="本次沟通的关键信息、客户反馈或下一步动作..." />
                </Form.Item>
                <div style={{ textAlign: 'right' }}>
                  <Button type="primary" onClick={addLog}>记录沟通</Button>
                </div>
              </Form>
            )}
            {(selectedCust.commLogs?.length ?? 0) === 0 ? (
              <Text type="secondary" style={{ fontSize: 13, display: 'block', marginTop: canUseCustomerActions ? 16 : 0 }}>暂无沟通记录</Text>
            ) : (
              <Timeline
                className="comm-log-timeline"
                style={{ marginTop: canUseCustomerActions ? 16 : 0 }}
                items={selectedCust.commLogs?.map((log) => ({
                  color: log.outcome === '已成交' ? 'green' : log.outcome === '投诉' ? 'red' : log.outcome === '待跟进' ? 'orange' : 'blue',
                  children: (
                    <div>
                      <Space size={6} wrap style={{ marginBottom: 4 }}>
                        <Tag color="blue" style={{ marginInlineEnd: 0 }}>{log.type}</Tag>
                        <Tag
                          color={log.outcome === '已成交' ? 'green' : log.outcome === '投诉' ? 'red' : log.outcome === '待跟进' ? 'orange' : 'default'}
                          style={{ marginInlineEnd: 0 }}
                        >
                          {log.outcome}
                        </Tag>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {formatShortDate(log.createdAt)} · {log.createdBy}
                        </Text>
                      </Space>
                      <div style={{ fontSize: 13, color: '#1a1d23', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{log.content}</div>
                    </div>
                  ),
                }))}
              />
            )}
          </Card>
        </div>
      ) : (
        <div className="sales-list-panel">
          <div className="ymt-filter-bar">
            <label className="ymt-filter ymt-time-filter">
              <span className="ymt-filter-label">时间范围</span>
              <span className="ymt-filter-value">{TIME_RANGE_LABELS[customerRange]}</span>
              <svg className="ymt-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <select className="ymt-select-native" value={customerRange} onChange={(e) => { setCustomerRange(e.target.value as TimeRangeKey); setCustomerDateStart(''); setCustomerDateEnd(''); }}>
                {TIME_RANGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label className="ymt-filter ymt-search-filter">
              <svg className="ymt-search-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" /><path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              <input className="ymt-search-text" value={custSearch} onChange={(e) => setCustSearch(e.target.value)} placeholder="请输入客户名称/联系人/业务员名称，多条用逗号隔开" />
            </label>
            <div className="ymt-filter ymt-date-filter">
              <span className="ymt-filter-label ymt-date-label">创建时间</span>
              <DatePicker
                className="ymt-date-input"
                variant="borderless"
                value={customerDateStart ? dayjs(customerDateStart) : null}
                onChange={(d) => setCustomerDateStart(d ? d.format('YYYY-MM-DD') : '')}
                placeholder="开始时间"
                format="YYYY-MM-DD"
                suffixIcon={null}
                allowClear
              />
              <span className="ymt-date-sep">至</span>
              <DatePicker
                className="ymt-date-input"
                variant="borderless"
                value={customerDateEnd ? dayjs(customerDateEnd) : null}
                onChange={(d) => setCustomerDateEnd(d ? d.format('YYYY-MM-DD') : '')}
                placeholder="截止时间"
                format="YYYY-MM-DD"
                suffixIcon={null}
                allowClear
              />
            </div>
            {canUseCustomerActions && (
              <button className="ymt-create-btn" type="button" onClick={() => setCustModal(true)}>+ 新建客户</button>
            )}
          </div>
          <Table<Customer>
            className="sales-data-table sales-order-table"
            rowKey="id"
            columns={customerColumns}
            dataSource={pagedCustomers}
            scroll={{ x: 1040 }}
            pagination={false}
            locale={{
              emptyText: (
                <div style={{ padding: '28px 0' }}>
                  <Text type="secondary">暂无客户</Text>
                </div>
              ),
            }}
          />
          {renderSalesPagination(customerPage, customerPageSize, customerTotal, (page, pageSize) => {
            setCustomerPage(page);
            setCustomerPageSize(pageSize);
          })}
        </div>
      ),
    },
  ];

  // ─── Compute total for order modal ─────────────────────────────────────────
  const modalTotal = orderItems.reduce((sum, item) => sum + (item.quantity || 0) * (item.unitPrice || 0), 0);

  return (
    <div className="sales-management-panel">
      <section className="sales-shell-card">
        <div className="sales-page-head">
          <div>
            <h1>订单录入与客户跟进</h1>
            <div className="sales-page-subtitle">管理订单草稿、客户信息与沟通记录</div>
          </div>
          <div className="sales-page-date">{dayjs().format('YYYY年MM月DD日')}</div>
        </div>

        <Tabs
          className="sales-sub-tabs"
          activeKey={subTab}
          onChange={(k) => { setSubTab(k as typeof subTab); setSelectedCust(null); setSelectedOrder(null); }}
          items={tabItems}
        />
      </section>

      {/* Order detail drawer */}
      <Drawer
        open={!!selectedOrder}
        title="订单详情"
        placement="right"
        width={720}
        onClose={() => setSelectedOrder(null)}
      >
        {selectedOrder && (() => {
          const customer = customerOptions.find((c) => c.id === selectedOrder.customerId);
          const statusRecords = selectedOrder.approvalLog || [];
          const hasItems = (selectedOrder.orderItems?.length ?? 0) > 0;

          return (
            <div>
              <Descriptions column={1} size="small" bordered labelStyle={{ width: 118, color: '#64748b' }}>
                <Descriptions.Item label="合同编号">
                  <code className={selectedOrder.contractNo ? 'sales-table-code' : 'sales-table-code is-empty'}>{selectedOrder.contractNo || '—'}</code>
                </Descriptions.Item>
                <Descriptions.Item label="客户">{selectedOrder.customer.name}</Descriptions.Item>
                <Descriptions.Item label="联系人">{customer?.contact || selectedOrder.customer.contact || '—'}</Descriptions.Item>
                <Descriptions.Item label="电话">{customer?.phone || '—'}</Descriptions.Item>
                <Descriptions.Item label="下单日期">
                  {selectedOrder.orderDate ? formatDate(selectedOrder.orderDate, 'YYYY/MM/DD') : formatDate(selectedOrder.createdAt, 'YYYY/MM/DD')}
                </Descriptions.Item>
                {!hasItems && (
                  <>
                    <Descriptions.Item label="产品">{selectedOrder.product?.name || '—'}</Descriptions.Item>
                    <Descriptions.Item label="型号规格">
                      {[selectedOrder.product?.code, (products.find((p) => p.id === selectedOrder.productId))?.description].filter(Boolean).join(' · ') || '—'}
                    </Descriptions.Item>
                    <Descriptions.Item label="数量">{selectedOrder.quantity}</Descriptions.Item>
                    {canViewAmount && <Descriptions.Item label="单价">{formatCurrency(selectedOrder.unitPrice)}</Descriptions.Item>}
                  </>
                )}
                {hasItems && (
                  <>
                    <Descriptions.Item label="产品款数">{selectedOrder.orderItems.length} 款</Descriptions.Item>
                    <Descriptions.Item label="总数量">{selectedOrder.totalQuantity || selectedOrder.quantity} 台</Descriptions.Item>
                  </>
                )}
                {canViewAmount && (
                  <Descriptions.Item label="订单总金额">
                    <Text strong style={{ color: '#1d4ed8' }}>{formatCurrency(selectedOrder.totalAmount)}</Text>
                  </Descriptions.Item>
                )}
                <Descriptions.Item label="交期">
                  <DeliveryCell date={selectedOrder.deliveryDate} shipped={selectedOrder.status === 'shipped'} />
                </Descriptions.Item>
                <Descriptions.Item label="业务员">{selectedOrder.salespersonName || selectedOrder.createdBy || '未分配'}</Descriptions.Item>
                {selectedOrder.urgent && (
                  <>
                    <Descriptions.Item label="是否加急"><Tag color="red">加急</Tag></Descriptions.Item>
                    <Descriptions.Item label="加急来源">{selectedOrder.urgentSource || '业务员标记'}</Descriptions.Item>
                    <Descriptions.Item label="加急原因">{selectedOrder.urgentReason || '—'}</Descriptions.Item>
                    <Descriptions.Item label="经理层确认">{selectedOrder.urgentConfirmed ? '已确认' : '未确认'}</Descriptions.Item>
                  </>
                )}
                {!selectedOrder.urgent && (
                  <Descriptions.Item label="是否加急">否</Descriptions.Item>
                )}
                <Descriptions.Item label="状态"><StatusBadge status={selectedOrder.status} /></Descriptions.Item>
                <Descriptions.Item label="备注">{selectedOrder.notes || '—'}</Descriptions.Item>
                {selectedOrder.contractRef && (
                  <Descriptions.Item label="合同参考">{selectedOrder.contractRef}</Descriptions.Item>
                )}
              </Descriptions>

              {hasItems && (
                <>
                  <Divider style={{ margin: '16px 0 12px' }} />
                  <Text strong style={{ display: 'block', marginBottom: 8 }}>产品明细 ({selectedOrder.orderItems.length}款)</Text>
                  <Table
                    size="small"
                    rowKey="id"
                    bordered
                    pagination={false}
                    dataSource={selectedOrder.orderItems}
                    columns={[
                      { title: '产品名称', dataIndex: 'productName', width: 180, ellipsis: true, render: (_: unknown, item: OrderItem) => item.displayName || item.productName },
                      { title: '详细要求', dataIndex: 'detailRequirement', ellipsis: true, render: (v: string) => v || '—' },
                      { title: '单位', dataIndex: 'unit', width: 70, render: (v: string) => v || '件' },
                      { title: '数量', dataIndex: 'quantity', width: 70, align: 'right' as const },
                      ...(canViewAmount ? [
                        { title: '未税单价', dataIndex: 'unitPrice', width: 100, align: 'right' as const, render: (v: unknown) => formatCurrency(v as number) },
                        { title: '总价', dataIndex: 'subtotal', width: 110, align: 'right' as const, render: (v: unknown) => <Text strong>{formatCurrency(v as number)}</Text> },
                      ] : []),
                    ]}
                    expandable={{
                      showExpandColumn: false,
                      expandRowByClick: true,
                      expandedRowRender: (item: OrderItem) => (
                        <Space direction="vertical" size={8} style={{ width: '100%' }}>
                          <div>
                            <Text type="secondary">包装物流：</Text>
                            <Text>
                              {[
                                item.ctnCount != null ? `CTN ${item.ctnCount}` : '',
                                item.qtyPerCtn != null ? `QTY/CTN ${item.qtyPerCtn}` : '',
                                item.ctnVolume != null ? `CTN/CBM ${item.ctnVolume}` : '',
                                item.totalVolume != null ? `T.T CBM ${item.totalVolume}` : '',
                                item.ctnWeight != null ? `CTN/KG ${item.ctnWeight}` : '',
                                item.totalWeight != null ? `T.T KG ${item.totalWeight}` : '',
                              ].filter(Boolean).join(' · ') || '—'}
                            </Text>
                          </div>
                        </Space>
                      ),
                      rowExpandable: (item: OrderItem) => Boolean(
                        item.ctnCount != null
                        || item.qtyPerCtn != null
                        || item.ctnVolume != null
                        || item.totalVolume != null
                        || item.ctnWeight != null
                        || item.totalWeight != null,
                      ),
                    }}
                  />
                </>
              )}

              <Divider style={{ margin: '20px 0 14px' }} />
              <Text strong style={{ display: 'block', marginBottom: 12 }}>状态记录</Text>
              {statusRecords.length === 0 ? (
                <Text type="secondary" style={{ fontSize: 13 }}>暂无状态记录</Text>
              ) : (
                <Timeline
                  items={statusRecords.map((log) => ({
                    children: (
                      <div>
                        <Space size={6} wrap>
                          <Tag color="blue" style={{ margin: 0 }}>{log.fromStage || '—'} → {log.toStage}</Tag>
                          <Text style={{ fontSize: 13 }}>{log.operator}</Text>
                        </Space>
                        <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>
                          {formatDate(log.createdAt)}
                          {log.reason ? ` · ${log.reason}` : ''}
                        </div>
                      </div>
                    ),
                  }))}
                />
              )}
            </div>
          );
        })()}
      </Drawer>

      {/* New / edit order modal */}
      <Modal
        open={orderModal}
        title={editingOrder ? '编辑订单草稿' : '新建订单'}
        onCancel={resetOrderModal}
        onOk={submitOrder}
        okText="保存草稿"
        cancelText="取消"
        confirmLoading={submitting}
        width={820}
        destroyOnClose
      >
        <Form form={orderForm} layout="vertical" size="middle" style={{ marginTop: 16 }}>
          {/* ── Section 1: Header info ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item label="客户名称" name="customerName" rules={[{ required: true, message: '请输入客户名称' }]}>
              <AutoComplete
                disabled={!!editingOrder}
                placeholder="输入至少 2 个关键字搜索客户，可直接填写新客户名"
                options={buildCustomerOrderOptions(customerOptions)}
                filterOption={false}
                onSearch={searchCustomers}
                notFoundContent={customerSearching ? '搜索中...' : null}
                onSelect={(_, option) => {
                  const customer = customerOptions.find((c) => c.id === Number((option as { customerId?: number }).customerId));
                  applySelectedCustomer(customer);
                }}
                onChange={(value) => {
                  const selectedOption = buildCustomerOrderOptions(customerOptions).find((option) => option.value === value);
                  const customer = selectedOption
                    ? customerOptions.find((c) => c.id === selectedOption.customerId)
                    : customerOptions.find((c) => c.name === value);
                  if (customer) applySelectedCustomer(customer);
                  else setSelectedCustomerId(null);
                }}
              />
            </Form.Item>
            <Form.Item label={<><span style={{ color: '#ff4d4f', marginRight: 4 }}>*</span>合同编号</>}>
              {editingOrder
                ? <Input value={editingOrder.contractNo || '—'} disabled style={{ background: '#F3F4F6', color: '#6B7280' }} />
                : <Input disabled placeholder="提交后自动生成" style={{ background: '#F3F4F6', color: '#6B7280' }} />
              }
            </Form.Item>
            <Form.Item label="联系人" name="contact">
              <Input placeholder="可从客户自动带出" disabled={!!editingOrder} />
            </Form.Item>
            {canAssignSalesperson && !editingOrder ? (
              <Form.Item label="业务员" name="salespersonId" rules={[{ required: true, message: '请选择订单业务员' }]}>
                <Select
                  showSearch
                  allowClear
                  placeholder="输入姓名搜索，或点击选择业务员"
                  optionFilterProp="label"
                  filterOption={(input, option) =>
                    (option?.label ?? '').toString().toLowerCase().includes(input.toLowerCase())
                  }
                  options={salesUsers.map((item) => ({ label: `${item.name} · ${item.phone}`, value: item.id }))}
                  notFoundContent="未找到业务员"
                />
              </Form.Item>
            ) : (
              <Form.Item label={<><span style={{ color: '#ff4d4f', marginRight: 4 }}>*</span>业务员</>} name="salesName" initialValue={creatorName}>
                <Input disabled style={{ background: '#F3F4F6', color: '#6B7280' }} />
              </Form.Item>
            )}
            <Form.Item label="联系方式" name="phone">
              <Input placeholder="可从客户自动带出" disabled={!!editingOrder} />
            </Form.Item>
            <Form.Item label="是否加急" name="urgent" valuePropName="checked">
              <Switch checkedChildren="加急" unCheckedChildren="正常" />
            </Form.Item>
            {urgentChecked && (
              <Form.Item label="加急原因" name="urgentReason" style={{ gridColumn: 'span 2' }}>
                <Input placeholder="可选，如：客户催单、交期紧、重要客户" />
              </Form.Item>
            )}
            <Form.Item label="交货日期" name="deliveryDate" rules={[{ required: true, message: '请选择交货日期' }]}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="备注" name="notes">
              <Input placeholder="可选" />
            </Form.Item>
          </div>
          {/* Hidden field for Excel import flow */}
          <Form.Item name="contractRef" hidden><Input /></Form.Item>
          {editingWithdrawn && (
            <Alert
              type="warning"
              showIcon
              message="当前订单已撤回审批，保存后需重新提交审批。"
              style={{ marginBottom: 16 }}
            />
          )}

          {/* ── Section 2: Product rows ── */}
          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 16, marginBottom: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text strong style={{ fontSize: 13 }}>产品明细</Text>
              <Button type="dashed" size="small" onClick={addItem}>+ 添加行</Button>
            </div>
            <Table
              size="small"
              rowKey="_key"
              dataSource={orderItems}
              columns={itemColumns}
              pagination={false}
              bordered
              scroll={{ x: 720 }}
            />
            {modalTotal > 0 && (
              <div style={{ textAlign: 'right', fontSize: 14, fontWeight: 600, color: '#1d4ed8', marginTop: 8 }}>
                订单总金额：{formatCurrency(modalTotal)}
              </div>
            )}
          </div>
        </Form>

        {/* ── Excel upload (new orders only) ── */}
        {!editingOrder && (
          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 16, marginTop: 8 }}>
            <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>上传订单 Excel</Text>
            <Upload.Dragger
              accept=".xlsx,.xls"
              maxCount={1}
              beforeUpload={(file) => handleExcelFile(file as File)}
              onRemove={() => {
                excelPreviewSeqRef.current += 1;
                setOrderFile(null);
                setExcelPreview(null);
                setExcelPreviewFileKey('');
                setExcelStatus('');
                setOrderItems([emptyItem(0)]);
                setItemKeyCounter(1);
              }}
            >
              <div style={{ padding: '8px 0' }}>
                <Text type="secondary" style={{ fontSize: 13, display: 'block' }}>
                  点击或拖拽上传 .xlsx / .xls 文件，字段缺失会按空值处理
                </Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  支持合同编号、客户、产品、数量、金额、交货日期、业务员、备注等字段
                </Text>
              </div>
            </Upload.Dragger>
            {excelStatus && (
              <div style={{ marginTop: 10, color: '#64748b', fontSize: 12 }}>{excelStatus}</div>
            )}
            {orderFile && (
              <Space size={8} style={{ marginTop: 10 }} wrap>
                <Button
                  size="small"
                  loading={excelImporting}
                  disabled={
                    !excelPreview?.diagnostics?.canImport
                    || excelPreviewFileKey !== excelFileKey(orderFile)
                    || aiParsing
                  }
                  onClick={importExcelOrders}
                >
                  调用现有接口导入为订单草稿
                </Button>
                <Button
                  size="small"
                  className="ymt-ai-btn"
                  loading={aiParsing}
                  disabled={excelImporting}
                  onClick={runAIParse}
                  title="使用千问大模型重新识别 Excel 内容，适合中英文混杂 / 格式异常的订单；结果会覆盖正则解析，最终仍可手动修改"
                >
                  🪄 AI 智能解析
                </Button>
              </Space>
            )}
            {excelPreview?.diagnostics && (
              <div style={{ marginTop: 10 }}>
                {excelPreview.diagnostics.warnings.map((warning) => (
                  <Tag key={warning} color="gold">{warning}</Tag>
                ))}
                {!excelPreview.diagnostics.canImport && (
                  <Tag color="red">缺少 {excelPreview.diagnostics.missingRequiredFields.join('、')}</Tag>
                )}
              </div>
            )}
            {excelPreview?.items && excelPreview.items.length > 0 ? (
              <div style={{ marginTop: 10, color: '#64748b', fontSize: 12 }}>
                已解析 {excelPreview.items.length} 行明细并填入下方"产品明细"表，可逐行修改后再导入
              </div>
            ) : null}

            {/* ── 上传订单图片（AI 视觉识别） ── */}
            <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px dashed #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span className="ymt-ai-tag" aria-label="AI 识别">
                  <span className="ymt-ai-tag-text">AI 识别</span>
                </span>
                <Text strong style={{ fontSize: 13 }}>上传订单图片</Text>
              </div>
              <Upload.Dragger
                accept=".jpg,.jpeg,.png,.webp"
                maxCount={1}
                disabled={imageParsing}
                beforeUpload={(file) => handleImageFile(file as File)}
                onRemove={() => {
                  excelPreviewSeqRef.current += 1;
                  setImageFile(null);
                  setImageStatus('');
                  setExcelPreview(null);
                  setOrderItems([emptyItem(0)]);
                  setItemKeyCounter(1);
                }}
                showUploadList={!!imageFile}
              >
                <div style={{ padding: '8px 0' }}>
                  <Text type="secondary" style={{ fontSize: 13, display: 'block' }}>
                    {imageParsing ? '正在用千问视觉模型识别…' : '点击或拖拽上传订单图片（拍照 / 截图 / 扫描件均可）'}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    支持 .jpg / .png / .webp，单张最大 10MB；自动识别客户、产品、数量、金额、交期等字段
                  </Text>
                </div>
              </Upload.Dragger>
              {imageStatus && (
                <div style={{ marginTop: 10, color: '#64748b', fontSize: 12 }}>{imageStatus}</div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* New customer modal */}
      <Modal
        open={custModal}
        title="新建客户"
        onCancel={() => { setCustModal(false); custForm.resetFields(); }}
        onOk={createCustomer}
        okText="创建"
        cancelText="取消"
        destroyOnClose
      >
        <Form
          form={custForm}
          layout="vertical"
          size="middle"
          style={{ marginTop: 16 }}
          initialValues={{ rating: 'B', salespersonName: creatorName }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item label="公司名称" name="name" rules={[{ required: true, message: '请填写公司名称' }]}
              style={{ gridColumn: 'span 2' }}>
              <Input />
            </Form.Item>
            <Form.Item label="联系人" name="contact">
              <Input />
            </Form.Item>
            <Form.Item label="联系方式" name="phone">
              <Input placeholder="电话 / 微信 / 邮箱等" />
            </Form.Item>
            <Form.Item label="邮箱" name="email">
              <Input />
            </Form.Item>
            <Form.Item label="客户等级" name="rating" initialValue="B">
              <Select options={['A', 'B', 'C', 'D'].map((r) => ({ label: `${r} 级`, value: r }))} />
            </Form.Item>
            {canAssignSalesperson ? (
              <Form.Item label="所属业务员（可选）" name="salespersonId">
                <Select
                  allowClear
                  placeholder="可不选择，后续再分配"
                  options={salesUsers.filter((item) => item.role === 'sales').map((item) => ({ label: `${item.name} · ${item.phone}`, value: item.id }))}
                />
              </Form.Item>
            ) : (
              <Form.Item label="所属业务员" name="salespersonName">
                <Input disabled />
              </Form.Item>
            )}
          </div>
          <Form.Item label="地址" name="address">
            <Input />
          </Form.Item>
          <Form.Item label="备注" name="notes">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
