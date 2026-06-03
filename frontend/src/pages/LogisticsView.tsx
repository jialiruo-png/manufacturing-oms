import { useEffect, useState } from 'react';
import { Button, DatePicker, Modal, Form, Input, Tag, Space, Typography, Pagination, Select, Skeleton, Table, Tabs, message } from 'antd';
import type { TableColumnsType } from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { ordersApi } from '../api';
import type { DataChangeHandler, Order } from '../types';
import { Empty } from '../components/ui';
import { formatDate, getOrderProductSummary, getOrderQuantity } from '../utils/order';

const { Text } = Typography;

type LogisticsTab = 'pending' | 'shipped';
type TimeRangeKey = '1m' | '3m' | '6m' | '1y';
type DateRangeValue = [Dayjs | null, Dayjs | null] | null;
type ShippedSearchField = 'contract' | 'customer' | 'tracking';

const TIME_RANGE_OPTIONS: { label: string; value: TimeRangeKey }[] = [
  { label: '近一个月', value: '1m' },
  { label: '近三个月', value: '3m' },
  { label: '近六个月', value: '6m' },
  { label: '近一年', value: '1y' },
];

const SHIPPED_SEARCH_OPTIONS: { label: string; value: ShippedSearchField }[] = [
  { label: '合同编号', value: 'contract' },
  { label: '客户名称', value: 'customer' },
  { label: '快递单号', value: 'tracking' },
];

const RANGE_MONTHS: Record<TimeRangeKey, number> = {
  '1m': 1,
  '3m': 3,
  '6m': 6,
  '1y': 12,
};

function parseShipInfo(order: Order) {
  const shipLog = order.approvalLog.find((l) => l.action === 'ship')
    ?? order.approvalLog[order.approvalLog.length - 1];
  if (!shipLog?.reason) return { carrier: '', trackingNo: '', date: '' };
  const parts = shipLog.reason.split(' | ');
  const carrier = parts.find((p) => p.startsWith('承运商:'))?.slice(4).trim() ?? '';
  const trackingNo = parts.find((p) => p.startsWith('运单号:'))?.slice(4).trim() ?? '';
  return { carrier, trackingNo, date: shipLog.createdAt };
}

export default function LogisticsView({
  refreshKey = 0,
  onDataChanged,
}: {
  refreshKey?: number;
  onDataChanged: DataChangeHandler;
}) {
  const [subTab, setSubTab]             = useState<LogisticsTab>('pending');
  const [orders, setOrders]             = useState<Order[]>([]);
  const [shipped, setShipped]           = useState<Order[]>([]);
  const [ordersTotal, setOrdersTotal]   = useState(0);
  const [shippedTotal, setShippedTotal] = useState(0);
  const [ordersPage, setOrdersPage]     = useState(1);
  const [ordersPageSize, setOrdersPageSize] = useState(20);
  const [shippedPage, setShippedPage]   = useState(1);
  const [shippedPageSize, setShippedPageSize] = useState(20);
  const [ordersSearch, setOrdersSearch] = useState('');
  const [shippedSearch, setShippedSearch] = useState('');
  const [shippedRange, setShippedRange] = useState<TimeRangeKey>('1m');
  const [shippedDateRange, setShippedDateRange] = useState<DateRangeValue>(null);
  const [shippedSearchField, setShippedSearchField] = useState<ShippedSearchField>('contract');
  const [loading, setLoading]           = useState(true);
  const [shipModal, setShipModal]       = useState<Order | null>(null);
  const [acting, setActing]             = useState<number | null>(null);
  const [form] = Form.useForm();

  const getShipDateParams = () => {
    const start = shippedDateRange?.[0]
      ? shippedDateRange[0].startOf('day')
      : dayjs().subtract(RANGE_MONTHS[shippedRange], 'month').startOf('day');
    const end = shippedDateRange?.[1]?.endOf('day');
    return {
      shipDateFrom: start.toISOString(),
      ...(end ? { shipDateTo: end.toISOString() } : {}),
    };
  };

  const load = async () => {
    setLoading(true);
    try {
      const [pending, done] = await Promise.all([
        ordersApi.listPaged({ status: 'ready_ship', page: ordersPage, pageSize: ordersPageSize }),
        ordersApi.listPaged({
          // 物流在已发货 tab 同时看到等待审批和已审批的订单
          status: 'pending_ship_approval,shipped',
          sort: 'createdAt_desc',
          page: shippedPage,
          pageSize: shippedPageSize,
          search: shippedSearch.trim() || undefined,
          searchField: shippedSearchField,
          ...getShipDateParams(),
        }),
      ]);
      setOrders(pending.data);
      setOrdersTotal(pending.total);
      setShipped(done.data);
      setShippedTotal(done.total);
    } catch (err) {
      console.error('物流订单加载失败', err);
      message.error('物流订单加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [
    ordersPage,
    ordersPageSize,
    shippedPage,
    shippedPageSize,
    shippedSearch,
    shippedSearchField,
    shippedRange,
    shippedDateRange?.[0]?.valueOf(),
    shippedDateRange?.[1]?.valueOf(),
    refreshKey,
  ]);
  useEffect(() => {
    setShippedPage(1);
  }, [shippedSearch, shippedSearchField, shippedRange, shippedDateRange?.[0]?.valueOf(), shippedDateRange?.[1]?.valueOf()]);

  const handleShip = async () => {
    if (!shipModal) return;
    const values = form.getFieldsValue();
    setActing(shipModal.id);
    const note = [
      values.carrier && `承运商: ${values.carrier}`,
      values.trackingNo && `运单号: ${values.trackingNo}`,
      values.note,
    ].filter(Boolean).join(' | ');
    try {
      await ordersApi.action(shipModal.id, 'ship', note);
      message.success('已提交发货审批，等待经理确认');
      setShipModal(null);
      form.resetFields();
      await load();
      onDataChanged('logistics_ship', 'logistics');
    } catch (err) {
      console.error('发货操作失败', err);
      message.error('发货操作失败，请稍后重试');
    } finally {
      setActing(null);
    }
  };

  const filterOrders = (list: Order[], keyword: string) => {
    const terms = keyword.split(/[,，\s]+/).map((t) => t.trim()).filter(Boolean);
    if (!terms.length) return list;
    return list.filter((o) => {
      const hay = [o.customer.name, o.contractNo, getOrderProductSummary(o)].join(' ');
      return terms.every((t) => hay.includes(t));
    });
  };

  const ordersRows  = filterOrders(orders, ordersSearch);
  const shippedRows = shipped;

  const renderPagination = (
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
          options={[10, 20, 50, 100].map((v) => ({ label: `${v} 条/页`, value: v }))}
          onChange={(nextSize) => onChange(1, nextSize)}
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

  const pendingColumns: TableColumnsType<Order> = [
    {
      title: '合同编号',
      width: 140,
      render: (_, o) => <code className={o.contractNo ? 'sales-table-code' : 'sales-table-code is-empty'}>{o.contractNo || '—'}</code>,
    },
    {
      title: '客户',
      width: 160,
      render: (_, o) => (
        <Space size={6}>
          <span className="sales-customer-name">{o.customer.name}</span>
          {o.urgent && <Tag color="red" icon={<ThunderboltOutlined />}>加急</Tag>}
        </Space>
      ),
    },
    {
      title: '产品摘要',
      width: 220,
      ellipsis: true,
      render: (_, o) => <span className="sales-table-summary">{getOrderProductSummary(o)}</span>,
    },
    {
      title: '款数',
      width: 64,
      align: 'center',
      render: (_, o) => <span>{o.itemCount || o.orderItems?.length || 1}</span>,
    },
    {
      title: '业务员',
      width: 96,
      render: (_, o) => <span>{o.salespersonName || o.customer.salespersonName || o.createdBy || '—'}</span>,
    },
    {
      title: '总数量',
      width: 76,
      align: 'right',
      render: (_, o) => <span>{getOrderQuantity(o)}</span>,
    },
    {
      title: '交期',
      width: 100,
      render: (_, o) => <span className="sales-due-date">{formatDate(o.deliveryDate, 'YYYY/MM/DD')}</span>,
    },
    {
      title: '操作',
      width: 110,
      align: 'left',
      className: 'sales-action-column',
      render: (_, o) => (
        <Space size={0} className="sales-inline-actions">
          <Button
            type="link"
            size="small"
            loading={acting === o.id}
            onClick={() => { setShipModal(o); form.resetFields(); }}
          >
            安排发货
          </Button>
        </Space>
      ),
    },
  ];

  const shippedColumns: TableColumnsType<Order> = [
    {
      title: '合同编号',
      width: 140,
      render: (_, o) => <code className={o.contractNo ? 'sales-table-code' : 'sales-table-code is-empty'}>{o.contractNo || '—'}</code>,
    },
    {
      title: '客户',
      width: 170,
      render: (_, o) => <span className="sales-customer-name">{o.customer.name}</span>,
    },
    {
      title: '产品摘要',
      width: 220,
      ellipsis: true,
      render: (_, o) => <span className="sales-table-summary">{getOrderProductSummary(o)}</span>,
    },
    {
      title: '总数量',
      width: 76,
      align: 'right',
      render: (_, o) => <span>{getOrderQuantity(o)}</span>,
    },
    {
      title: '快递单号',
      width: 150,
      render: (_, o) => {
        const { trackingNo } = parseShipInfo(o);
        return trackingNo
          ? <code className="logistics-tracking-no">{trackingNo}</code>
          : <Text type="secondary">—</Text>;
      },
    },
    {
      title: '承运商',
      width: 100,
      render: (_, o) => {
        const { carrier } = parseShipInfo(o);
        return <Text type="secondary">{carrier || '—'}</Text>;
      },
    },
    {
      title: '发货日期',
      width: 110,
      render: (_, o) => {
        const { date } = parseShipInfo(o);
        return <Text type="secondary">{date ? formatDate(date, 'MM/DD HH:mm') : '—'}</Text>;
      },
    },
    {
      title: '交期',
      width: 100,
      render: (_, o) => <span className="sales-due-date">{formatDate(o.deliveryDate, 'YYYY/MM/DD')}</span>,
    },
    {
      title: '审批状态',
      width: 100,
      align: 'center',
      render: (_, o) => (
        o.status === 'pending_ship_approval'
          ? <Tag color="orange">审批中</Tag>
          : <Tag color="success">已发货</Tag>
      ),
    },
  ];

  if (loading) return (
    <div className="logistics-management-panel">
      <section className="sales-shell-card">
        <div className="sales-page-head">
          <div>
            <h1>发货安排与交付跟踪</h1>
            <div className="sales-page-subtitle">处理待发货订单，填写物流信息并确认发货</div>
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
      key: 'pending',
      label: `待发货${ordersTotal > 0 ? ` (${ordersTotal})` : ''}`,
      children: (
        <div className="sales-list-panel">
          <div className="ymt-filter-bar">
            <label className="ymt-filter ymt-search-filter">
              <svg className="ymt-search-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" /><path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              <input
                className="ymt-search-text"
                placeholder="搜索合同编号 / 客户名称 / 产品"
                value={ordersSearch}
                onChange={(e) => { setOrdersSearch(e.target.value); setOrdersPage(1); }}
              />
            </label>
          </div>
          {ordersRows.length === 0 ? (
            <div className="logistics-empty-block">
              <Empty
                icon="🚚"
                title={orders.length === 0 ? '暂无待发货订单' : '未找到匹配订单'}
                desc={orders.length === 0 ? '所有就绪订单均已发出' : '请调整搜索关键词后重试'}
              />
            </div>
          ) : (
            <Table<Order>
              className="sales-data-table"
              rowKey="id"
              columns={pendingColumns}
              dataSource={ordersRows}
              tableLayout="fixed"
              pagination={false}
            />
          )}
          {renderPagination(ordersPage, ordersPageSize, ordersSearch.trim() ? ordersRows.length : ordersTotal, (page, pageSize) => {
            setOrdersPage(page);
            setOrdersPageSize(pageSize);
          })}
        </div>
      ),
    },
    {
      key: 'shipped',
      label: `已发货${shippedTotal > 0 ? ` (${shippedTotal})` : ''}`,
      children: (
        <div className="sales-list-panel">
          <div className="ymt-filter-bar">
            <label className="ymt-filter ymt-time-filter">
              <span className="ymt-filter-label">时间范围</span>
              <span className="ymt-filter-value">{TIME_RANGE_OPTIONS.find((o) => o.value === shippedRange)?.label}</span>
              <svg className="ymt-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <select className="ymt-select-native" value={shippedRange} onChange={(e) => { setShippedRange(e.target.value as TimeRangeKey); setShippedDateRange(null); }}>
                {TIME_RANGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label className="ymt-filter ymt-select-filter" style={{ minWidth: 150 }}>
              <span className="ymt-filter-label">搜索字段</span>
              <span className="ymt-filter-value">{SHIPPED_SEARCH_OPTIONS.find((o) => o.value === shippedSearchField)?.label}</span>
              <svg className="ymt-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <select className="ymt-select-native" value={shippedSearchField} onChange={(e) => setShippedSearchField(e.target.value as ShippedSearchField)}>
                {SHIPPED_SEARCH_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label className="ymt-filter ymt-search-filter">
              <svg className="ymt-search-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" /><path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              <input
                className="ymt-search-text"
                placeholder={`请输入${SHIPPED_SEARCH_OPTIONS.find((item) => item.value === shippedSearchField)?.label || '合同编号'}，多条用逗号隔开`}
                value={shippedSearch}
                onChange={(e) => { setShippedSearch(e.target.value); setShippedPage(1); }}
              />
            </label>
            <div className="ymt-filter ymt-date-filter">
              <span className="ymt-filter-label ymt-date-label">发货时间</span>
              <DatePicker
                className="ymt-date-input"
                variant="borderless"
                value={shippedDateRange?.[0] ?? null}
                onChange={(d) => setShippedDateRange([d, shippedDateRange?.[1] ?? null])}
                placeholder="开始时间"
                format="YYYY-MM-DD"
                suffixIcon={null}
                allowClear
              />
              <span className="ymt-date-sep">至</span>
              <DatePicker
                className="ymt-date-input"
                variant="borderless"
                value={shippedDateRange?.[1] ?? null}
                onChange={(d) => setShippedDateRange([shippedDateRange?.[0] ?? null, d])}
                placeholder="截止时间"
                format="YYYY-MM-DD"
                suffixIcon={null}
                allowClear
              />
            </div>
          </div>
          {shippedRows.length === 0 ? (
            <div className="logistics-empty-block">
              <Empty
                icon="📦"
                title={shipped.length === 0 ? '暂无已发货记录' : '未找到匹配订单'}
                desc={shipped.length === 0 ? '发货后的订单将显示在这里' : '请调整搜索关键词后重试'}
              />
            </div>
          ) : (
            <Table<Order>
              className="sales-data-table"
              rowKey="id"
              columns={shippedColumns}
              dataSource={shippedRows}
              tableLayout="fixed"
              pagination={false}
            />
          )}
          {renderPagination(shippedPage, shippedPageSize, shippedTotal, (page, pageSize) => {
            setShippedPage(page);
            setShippedPageSize(pageSize);
          })}
        </div>
      ),
    },
  ];

  return (
    <div className="logistics-management-panel">
      <section className="sales-shell-card">
        <div className="sales-page-head">
          <div>
            <h1>发货安排与交付跟踪</h1>
            <div className="sales-page-subtitle">处理待发货订单，填写物流信息并确认发货</div>
          </div>
          <div className="sales-page-date">{dayjs().format('YYYY年MM月DD日')}</div>
        </div>

        <Tabs
          className="sales-sub-tabs"
          activeKey={subTab}
          onChange={(k) => setSubTab(k as LogisticsTab)}
          items={tabItems}
        />
      </section>

      <Modal
        open={!!shipModal}
        title="安排发货"
        onCancel={() => { setShipModal(null); form.resetFields(); }}
        onOk={handleShip}
        okText="确认发货"
        cancelText="取消"
        confirmLoading={acting === shipModal?.id}
        destroyOnClose
      >
        {shipModal && (
          <>
            <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 14px', marginBottom: 20 }}>
              <code className={shipModal.contractNo ? 'sales-table-code' : 'sales-table-code is-empty'}>{shipModal.contractNo || '—'}</code>
              {shipModal.urgent && <Tag color="red" icon={<ThunderboltOutlined />} style={{ marginLeft: 8 }}>加急优先发货</Tag>}
              <div style={{ fontWeight: 700, marginTop: 4 }}>{shipModal.customer.name}</div>
              <Text type="secondary" style={{ fontSize: 13 }}>{getOrderProductSummary(shipModal)}，共 {getOrderQuantity(shipModal)} 台</Text>
            </div>
            <Form form={form} layout="vertical" size="middle">
              <Form.Item label="承运商" name="carrier">
                <Input placeholder="如：顺丰、德邦、自送" />
              </Form.Item>
              <Form.Item label="快递 / 运单号" name="trackingNo">
                <Input placeholder="可选" />
              </Form.Item>
              <Form.Item label="备注" name="note">
                <Input.TextArea rows={2} placeholder="可选" />
              </Form.Item>
            </Form>
          </>
        )}
      </Modal>
    </div>
  );
}
