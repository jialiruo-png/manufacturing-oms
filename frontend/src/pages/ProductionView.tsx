import { useEffect, useState } from 'react';
import { Button, Input, Pagination, Select, Skeleton, Space, Table, Tabs, Tag, Typography, message } from 'antd';
import type { TableColumnsType } from 'antd';
import { CheckCircleOutlined, ClockCircleOutlined, ThunderboltOutlined, WarningOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { ordersApi } from '../api';
import type { DataChangeHandler, Order } from '../types';
import { Empty, SectionTitle } from '../components/ui';
import { formatDate, getOrderProductSummary, getOrderQuantity } from '../utils/order';

const { Text } = Typography;

type ProductionTab = 'queue' | 'producing';

function materialReady(order: Order) {
  return order.materialSummary ? order.materialSummary.unready === 0 : order.materials.every((m) => m.status === 'ready');
}

function materialRisk(order: Order) {
  return (order.materialSummary?.urgentUnready ?? order.materials.filter((m) => m.urgent && m.status !== 'ready').length) > 0;
}

function orderItemCount(order: Order) {
  return order.itemCount || order.orderItems?.length || 1;
}

function filterOrders(list: Order[], keyword: string) {
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
}

export default function ProductionView({
  refreshKey = 0,
  onDataChanged,
}: {
  refreshKey?: number;
  onDataChanged: DataChangeHandler;
}) {
  const [subTab, setSubTab] = useState<ProductionTab>('queue');
  const [producingOrders, setProducingOrders] = useState<Order[]>([]);
  const [procurementOrders, setProcurementOrders] = useState<Order[]>([]);
  const [producingTotal, setProducingTotal] = useState(0);
  const [procurementTotal, setProcurementTotal] = useState(0);
  const [producingPage, setProducingPage] = useState(1);
  const [producingPageSize, setProducingPageSize] = useState(20);
  const [procurementPage, setProcurementPage] = useState(1);
  const [procurementPageSize, setProcurementPageSize] = useState(20);
  const [producingSearch, setProducingSearch] = useState('');
  const [queueSearch, setQueueSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [producingData, procurementData] = await Promise.all([
        ordersApi.listPaged({ status: 'production', page: producingPage, pageSize: producingPageSize }),
        ordersApi.listPaged({ status: 'procurement,pending_production', page: procurementPage, pageSize: procurementPageSize }),
      ]);
      setProducingOrders(producingData.data);
      setProducingTotal(producingData.total);
      setProcurementOrders(procurementData.data);
      setProcurementTotal(procurementData.total);
    } catch (err) {
      console.error('生产订单加载失败', err);
      message.error('生产订单加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [producingPage, producingPageSize, procurementPage, procurementPageSize, refreshKey]);

  const doAction = async (orderId: number, action: string) => {
    setActing(orderId);
    try {
      await ordersApi.action(orderId, action);
      if (action === 'start_production') {
        setProducingPage(1);
        setProcurementPage(1);
      }
      await load();
      onDataChanged(action === 'finish_production' ? 'production_finish' : 'production_start_production', 'production');
    } catch (err) {
      console.error('生产流程操作失败', err);
      message.error('生产流程操作失败，请稍后重试');
    } finally {
      setActing(null);
    }
  };

  // 待排产 = 已被采购"排入生产"，订单 status 已切换为 pending_production
  // 缺料等待 = 仍在采购备料阶段 (status=procurement)，含未备齐物料或未点击排入生产
  const readyToProduce = procurementOrders.filter((order) => order.status === 'pending_production');
  const waitingMaterials = procurementOrders.filter((order) => order.status === 'procurement');
  const producingRows = filterOrders(producingOrders, producingSearch);
  const readyRows = filterOrders(readyToProduce, queueSearch);
  const waitingRows = filterOrders(waitingMaterials, queueSearch);
  const totalOrders = producingTotal + procurementTotal;

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

  const commonColumns: TableColumnsType<Order> = [
    {
      title: '合同编号',
      width: 160,
      fixed: 'left',
      render: (_, order) => (
        <code className={order.contractNo ? 'sales-table-code' : 'sales-table-code is-empty'}>{order.contractNo || '—'}</code>
      ),
    },
    {
      title: '客户',
      width: 160,
      render: (_, order) => <span className="sales-customer-name">{order.customer.name}</span>,
    },
    {
      title: '产品摘要',
      width: 230,
      ellipsis: true,
      render: (_, order) => <span className="sales-table-summary">{getOrderProductSummary(order)}</span>,
    },
    {
      title: '款数',
      width: 64,
      align: 'center',
      render: (_, order) => <span>{orderItemCount(order)}</span>,
    },
    {
      title: '业务员',
      width: 110,
      render: (_, order) => <span>{order.salespersonName || order.customer.salespersonName || order.createdBy || '—'}</span>,
    },
    {
      title: '总数量',
      width: 88,
      align: 'right',
      render: (_, order) => <span>{getOrderQuantity(order)}</span>,
    },
    {
      title: '交期',
      width: 118,
      render: (_, order) => <span className="sales-due-date">{formatDate(order.deliveryDate, 'YYYY/MM/DD')}</span>,
    },
  ];

  const producingColumns: TableColumnsType<Order> = [
    ...commonColumns,
    {
      title: '状态',
      width: 160,
      render: (_, order) => (
        <Space size={6} style={{ flexWrap: 'nowrap' }}>
          <Tag color="blue" icon={<ClockCircleOutlined />}>在产</Tag>
          {order.urgent && <Tag color="red" icon={<ThunderboltOutlined />}>加急</Tag>}
        </Space>
      ),
    },
    {
      title: '操作',
      width: 116,
      fixed: 'right',
      align: 'left',
      className: 'sales-action-column',
      render: (_, order) => (
        <Space size={0} className="sales-inline-actions">
          <Button type="link" size="small" loading={acting === order.id} onClick={() => doAction(order.id, 'finish_production')}>
            完成生产
          </Button>
        </Space>
      ),
    },
  ];

  const readyColumns: TableColumnsType<Order> = [
    ...commonColumns,
    {
      title: '状态',
      width: 168,
      render: (_, order) => (
        <Space size={6} style={{ flexWrap: 'nowrap' }}>
          <Tag color="success" icon={<CheckCircleOutlined />}>待排产</Tag>
          {order.urgent && <Tag color="red" icon={<ThunderboltOutlined />}>加急</Tag>}
        </Space>
      ),
    },
    {
      title: '操作',
      width: 116,
      fixed: 'right',
      align: 'left',
      className: 'sales-action-column',
      render: (_, order) => (
        <Space size={0} className="sales-inline-actions">
          <Button type="link" size="small" loading={acting === order.id} onClick={() => doAction(order.id, 'start_production')}>
            开始生产
          </Button>
        </Space>
      ),
    },
  ];

  const waitingColumns: TableColumnsType<Order> = [
    ...commonColumns,
    {
      title: '物料状态',
      width: 200,
      render: (_, order) => {
        const total = order.materialSummary?.total ?? 0;
        const ready = order.materialSummary?.ready ?? 0;
        return (
          <Space size={6} wrap>
            <Tag color="orange">缺料等待</Tag>
            {materialRisk(order) && <Tag color="red" icon={<WarningOutlined />}>缺料风险</Tag>}
            {total > 0 && <Tag color="default">{ready}/{total} 已备齐</Tag>}
            {order.urgent && <Tag color="red" icon={<ThunderboltOutlined />}>加急</Tag>}
          </Space>
        );
      },
    },
  ];

  if (loading) return (
    <div className="production-management-panel">
      <section className="sales-shell-card">
        <div className="sales-page-head">
          <div>
            <h1>生产排期与进度反馈</h1>
            <div className="sales-page-subtitle">管理生产队列，更新生产完成状态</div>
          </div>
          <div className="sales-page-date">{dayjs().format('YYYY年MM月DD日')}</div>
        </div>
        <div className="production-loading-block">
          <Skeleton active paragraph={{ rows: 9 }} />
        </div>
      </section>
    </div>
  );

  const tabItems = [
    {
      key: 'queue',
      label: `排产队列${procurementTotal > 0 ? ` (${procurementTotal})` : ''}`,
      children: (
        <div className="sales-list-panel">
          <div className="ymt-filter-bar">
            <label className="ymt-filter ymt-search-filter">
              <svg className="ymt-search-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" /><path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              <input
                className="ymt-search-text"
                placeholder="搜索客户名称 / 合同编号 / 产品"
                value={queueSearch}
                onChange={(event) => {
                  setQueueSearch(event.target.value);
                  setProcurementPage(1);
                }}
              />
            </label>
          </div>
          {procurementOrders.length === 0 ? (
            <div className="production-empty-block">
              <Empty icon="📋" title="暂无排产队列" desc="采购排入生产后的订单会显示在这里" />
            </div>
          ) : (
            <>
              <div className="production-queue-section">
                <div className="production-section-head">
                  <SectionTitle title="待排产" count={readyRows.length} accent="green" />
                </div>
                {readyRows.length === 0 ? (
                  <div style={{ padding: '20px 24px' }}>
                    <Empty icon="✅" title={queueSearch ? '未找到匹配的待排产订单' : '暂无待排产订单'} desc={queueSearch ? '请调整搜索关键词后重试' : '采购点击"排入生产"后的订单会出现在这里' } />
                  </div>
                ) : (
                  <Table<Order>
                    className="sales-data-table production-data-table"
                    rowKey="id"
                    columns={readyColumns}
                    dataSource={readyRows}
                    scroll={{ x: 1300 }}
                    pagination={false}
                  />
                )}
              </div>
              <div className="production-queue-section production-queue-section-divider">
                <div className="production-section-head">
                  <SectionTitle title="缺料等待" count={waitingRows.length} accent="amber" />
                </div>
                {waitingRows.length === 0 ? (
                  <div style={{ padding: '20px 24px' }}>
                    <Empty icon="📦" title={queueSearch ? '未找到匹配的缺料订单' : '暂无缺料等待'} desc={queueSearch ? '请调整搜索关键词后重试' : '当前所有在队订单物料均已备齐'} />
                  </div>
                ) : (
                  <Table<Order>
                    className="sales-data-table production-data-table"
                    rowKey="id"
                    columns={waitingColumns}
                    dataSource={waitingRows}
                    scroll={{ x: 1200 }}
                    pagination={false}
                  />
                )}
              </div>
            </>
          )}
          {renderPagination(procurementPage, procurementPageSize, queueSearch.trim() ? (readyRows.length + waitingRows.length) : procurementTotal, (page, pageSize) => {
            setProcurementPage(page);
            setProcurementPageSize(pageSize);
          })}
        </div>
      ),
    },
    {
      key: 'producing',
      label: `在产订单${producingTotal > 0 ? ` (${producingTotal})` : ''}`,
      children: (
        <div className="sales-list-panel">
          <div className="ymt-filter-bar">
            <label className="ymt-filter ymt-search-filter">
              <svg className="ymt-search-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" /><path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              <input
                className="ymt-search-text"
                placeholder="搜索客户名称 / 合同编号 / 产品"
                value={producingSearch}
                onChange={(event) => {
                  setProducingSearch(event.target.value);
                  setProducingPage(1);
                }}
              />
            </label>
          </div>
          {producingRows.length === 0 ? (
            <div className="production-empty-block">
              <Empty icon="🔧" title={producingOrders.length === 0 ? '暂无在产订单' : '未找到匹配订单'} desc={producingOrders.length === 0 ? '开始生产后的订单会显示在这里' : '请调整搜索关键词后重试'} />
            </div>
          ) : (
            <Table<Order>
              className="sales-data-table production-data-table"
              rowKey="id"
              columns={producingColumns}
              dataSource={producingRows}
              scroll={{ x: 1220 }}
              pagination={false}
            />
          )}
          {renderPagination(producingPage, producingPageSize, producingSearch.trim() ? producingRows.length : producingTotal, (page, pageSize) => {
            setProducingPage(page);
            setProducingPageSize(pageSize);
          })}
        </div>
      ),
    },
  ];

  return (
    <div className="production-management-panel">
      <section className="sales-shell-card">
        <div className="sales-page-head production-page-head">
          <div>
            <h1>生产排期与进度反馈</h1>
            <div className="sales-page-subtitle">管理生产队列，更新生产完成状态</div>
            <div className="production-summary-chips">
              <div className="production-summary-chip chip-green">
                <span className="production-chip-dot" />
                <span>待排产</span>
                <strong>{readyToProduce.length}</strong>
                <span>单</span>
              </div>
              <div className="production-summary-chip chip-blue">
                <span className="production-chip-dot" />
                <span>在产订单</span>
                <strong>{producingTotal}</strong>
                <span>单</span>
              </div>
              <div className="production-summary-chip chip-amber">
                <span className="production-chip-dot" />
                <span>缺料等待</span>
                <strong>{waitingMaterials.length}</strong>
                <span>单</span>
              </div>
            </div>
          </div>
          <div className="sales-page-date">{dayjs().format('YYYY年MM月DD日')}</div>
        </div>

        {totalOrders === 0 ? (
          <div className="production-empty-block">
            <Empty icon="🔧" title="暂无生产任务" desc="当前没有处于采购或生产阶段的订单" />
          </div>
        ) : (
          <Tabs
            className="sales-sub-tabs"
            activeKey={subTab}
            onChange={(key) => setSubTab(key as ProductionTab)}
            items={tabItems}
          />
        )}
      </section>
    </div>
  );
}
