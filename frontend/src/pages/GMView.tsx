import { useEffect, useState } from 'react';
import { Button, Input, Modal, Pagination, Select, Skeleton, Space, Switch, Table, Tabs, Tag, Typography, message } from 'antd';
import type { TableColumnsType } from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { ordersApi, getApiErrorMessage } from '../api';
import type { DataChangeHandler, Order } from '../types';
import { DeliveryCell, Empty, StatusBadge } from '../components/ui';
import { formatCurrency, formatDate, getOrderProductSummary, getOrderQuantity } from '../utils/order';

const { Text } = Typography;

type RejectType = { orderId: number; contractNo: string; type: 'order' | 'ship' };
type GmTab = 'order' | 'ship' | 'history';

const ACTION_LABEL: Record<string, string> = {
  submit: '提交审批',
  approve: '批准下单',
  reject: '退回修改',
  ship: '提交发货',
  approve_ship: '批准发货',
  reject_ship: '驳回发货',
  request_review: '申请复审',
  queue_production: '排入生产',
  start_production: '开始生产',
  finish_production: '完成生产',
  withdraw: '撤回申请',
  contract_generated: '生成合同',
};

const actionTagColor = (action?: string) => {
  if (!action) return 'default';
  if (action.includes('approve')) return 'success';
  if (action.includes('reject')) return 'error';
  if (action === 'request_review') return 'orange';
  return 'blue';
};

const latestLog = (order: Order) => order.approvalLog?.[order.approvalLog.length - 1];
const materialTotal = (order: Order) => order.materialSummary?.total ?? order.materials.length;
const readyCount = (order: Order) => order.materialSummary?.ready ?? 0;

export default function GMView({
  refreshKey = 0,
  onDataChanged,
}: {
  refreshKey?: number;
  onDataChanged: DataChangeHandler;
}) {
  const [subTab, setSubTab]              = useState<GmTab>('order');
  const [pending, setPending]            = useState<Order[]>([]);
  const [pendingShip, setPendingShip]    = useState<Order[]>([]);
  const [history, setHistory]            = useState<Order[]>([]);
  const [pendingTotal, setPendingTotal]  = useState(0);
  const [pendingPage, setPendingPage]    = useState(1);
  const [pendingPageSize, setPendingPageSize] = useState(20);
  const [pendingShipTotal, setPendingShipTotal] = useState(0);
  const [pendingShipPage, setPendingShipPage]   = useState(1);
  const [pendingShipPageSize, setPendingShipPageSize] = useState(20);
  const [historyTotal, setHistoryTotal]  = useState(0);
  const [historyPage, setHistoryPage]    = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(20);
  const [pendingSearch, setPendingSearch]     = useState('');
  const [pendingShipSearch, setPendingShipSearch] = useState('');
  const [historySearch, setHistorySearch]     = useState('');
  const [loading, setLoading]            = useState(true);
  const [rejectModal, setRejectModal]    = useState<RejectType | null>(null);
  const [rejectReason, setRejectReason]  = useState('');
  const [acting, setActing]              = useState<number | null>(null);
  const [urgentDecisions, setUrgentDecisions] = useState<Record<number, boolean>>({});

  const load = async () => {
    setLoading(true);
    try {
      // 改用 allSettled：任意一个 tab 接口失败不影响其他 tab 加载，便于定位
      const [pendingResult, pendingShipResult, historyResult] = await Promise.allSettled([
        ordersApi.listPaged({ status: 'pending_approval', page: pendingPage, pageSize: pendingPageSize }),
        ordersApi.listPaged({ status: 'pending_ship_approval', page: pendingShipPage, pageSize: pendingShipPageSize }),
        ordersApi.listPaged({
          status: 'procurement,production,ready_ship,shipped',
          range: '1m',
          sort: 'createdAt_desc',
          page: historyPage,
          pageSize: historyPageSize,
        }),
      ]);

      const errors: string[] = [];

      if (pendingResult.status === 'fulfilled') {
        setPending(pendingResult.value.data);
        setPendingTotal(pendingResult.value.total);
        setUrgentDecisions((prev) => {
          const next = { ...prev };
          for (const order of pendingResult.value.data) {
            if (!(order.id in next)) next[order.id] = !!order.urgent;
          }
          return next;
        });
      } else {
        console.error('下单审批加载失败', pendingResult.reason);
        errors.push(`下单审批：${getApiErrorMessage(pendingResult.reason, '加载失败')}`);
        setPending([]);
        setPendingTotal(0);
      }

      if (pendingShipResult.status === 'fulfilled') {
        setPendingShip(pendingShipResult.value.data);
        setPendingShipTotal(pendingShipResult.value.total);
      } else {
        console.error('发货审批加载失败', pendingShipResult.reason);
        errors.push(`发货审批：${getApiErrorMessage(pendingShipResult.reason, '加载失败')}`);
        setPendingShip([]);
        setPendingShipTotal(0);
      }

      if (historyResult.status === 'fulfilled') {
        setHistory(historyResult.value.data);
        setHistoryTotal(historyResult.value.total);
      } else {
        console.error('历史记录加载失败', historyResult.reason);
        errors.push(`历史记录：${getApiErrorMessage(historyResult.reason, '加载失败')}`);
        setHistory([]);
        setHistoryTotal(0);
      }

      if (errors.length > 0) {
        message.error(errors.join('；'));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [pendingPage, pendingPageSize, pendingShipPage, pendingShipPageSize, historyPage, historyPageSize, refreshKey]);

  const handleApprove = async (order: Order) => {
    setActing(order.id);
    try {
      const isUrgent = urgentDecisions[order.id] ?? !!order.urgent;
      await ordersApi.action(order.id, 'approve', '', { urgent: isUrgent, urgentReason: '' });
      await load();
      onDataChanged('gm_approve', 'gm');
    } catch (err) {
      console.error('下单审批通过失败', err);
      message.error('审批操作失败，请稍后重试');
    } finally {
      setActing(null);
    }
  };

  const handleApproveShip = async (orderId: number) => {
    setActing(orderId);
    try {
      await ordersApi.action(orderId, 'approve_ship');
      await load();
      onDataChanged('gm_approve_ship', 'gm');
    } catch (err) {
      console.error('发货审批通过失败', err);
      message.error('审批操作失败，请稍后重试');
    } finally {
      setActing(null);
    }
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    const cur = rejectModal;
    setActing(cur.orderId);
    const action = cur.type === 'ship' ? 'reject_ship' : 'reject';
    try {
      await ordersApi.action(cur.orderId, action, rejectReason);
      setRejectModal(null);
      setRejectReason('');
      await load();
      onDataChanged(cur.type === 'ship' ? 'gm_reject_ship' : 'gm_reject', 'gm');
    } catch (err) {
      console.error('审批退回失败', err);
      message.error('退回操作失败，请稍后重试');
    } finally {
      setActing(null);
    }
  };

  const filterOrders = (list: Order[], kw: string) => {
    const terms = kw.split(/[,，\s]+/).map((t) => t.trim()).filter(Boolean);
    if (!terms.length) return list;
    return list.filter((o) => {
      const hay = [
        o.customer.name,
        o.contractNo,
        getOrderProductSummary(o),
        o.salespersonName,
        o.customer.salespersonName,
        o.createdBy,
      ].join(' ');
      return terms.every((t) => hay.includes(t));
    });
  };

  const pendingRows     = filterOrders(pending, pendingSearch);
  const pendingShipRows = filterOrders(pendingShip, pendingShipSearch);
  const historyRows     = filterOrders(history, historySearch);

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

  const commonOrderColumns: TableColumnsType<Order> = [
    {
      title: '合同编号',
      width: 160,
      fixed: 'left',
      render: (_, o) => <code className={o.contractNo ? 'sales-table-code' : 'sales-table-code is-empty'}>{o.contractNo || '—'}</code>,
    },
    {
      title: '客户',
      width: 160,
      render: (_, o) => (
        <Space size={4} wrap>
          <span className="sales-customer-name">{o.customer.name}</span>
          {o.urgent && <Tag color="red" icon={<ThunderboltOutlined />}>加急</Tag>}
          {o.prevStatus && <Tag color="orange">复审</Tag>}
        </Space>
      ),
    },
    {
      title: '产品摘要',
      width: 230,
      ellipsis: true,
      render: (_, o) => <span className="sales-table-summary">{getOrderProductSummary(o)}</span>,
    },
    {
      title: '总数量',
      width: 90,
      align: 'right',
      render: (_, o) => <span>{getOrderQuantity(o)}</span>,
    },
    {
      title: '业务员',
      width: 100,
      render: (_, o) => <Text type="secondary">{o.salespersonName || o.customer.salespersonName || o.createdBy || '—'}</Text>,
    },
    {
      title: '总价',
      width: 110,
      align: 'right',
      render: (_, o) => <span style={{ fontWeight: 700 }}>{formatCurrency(o.totalAmount)}</span>,
    },
    {
      title: '交期',
      width: 130,
      render: (_, o) => <DeliveryCell date={o.deliveryDate} />,
    },
  ];

  const pendingApprovalColumns: TableColumnsType<Order> = [
    ...commonOrderColumns,
    {
      title: '加急',
      width: 90,
      render: (_, o) => (
        <Switch
          size="small"
          checked={urgentDecisions[o.id] ?? !!o.urgent}
          checkedChildren="加急"
          unCheckedChildren="正常"
          onChange={(checked) => setUrgentDecisions((prev) => ({ ...prev, [o.id]: checked }))}
        />
      ),
    },
    {
      title: '操作',
      width: 160,
      fixed: 'right',
      align: 'left',
      className: 'sales-action-column',
      render: (_, o) => (
        <Space size={0} className="sales-inline-actions">
          <Button type="link" size="small" loading={acting === o.id} onClick={() => handleApprove(o)}>
            批准下单
          </Button>
          <Button
            type="link"
            size="small"
            danger
            loading={acting === o.id}
            onClick={() => setRejectModal({ orderId: o.id, contractNo: o.contractNo || '', type: 'order' })}
          >
            退回修改
          </Button>
        </Space>
      ),
    },
  ];

  const shipApprovalColumns: TableColumnsType<Order> = [
    {
      title: '合同编号',
      width: 140,
      render: (_, o) => <code className={o.contractNo ? 'sales-table-code' : 'sales-table-code is-empty'}>{o.contractNo || '—'}</code>,
    },
    {
      title: '客户',
      width: 140,
      ellipsis: true,
      render: (_, o) => (
        <Space size={4} wrap>
          <span className="sales-customer-name">{o.customer.name}</span>
          {o.urgent && <Tag color="red" icon={<ThunderboltOutlined />}>加急</Tag>}
        </Space>
      ),
    },
    {
      title: '产品摘要',
      width: 190,
      ellipsis: true,
      render: (_, o) => <span className="sales-table-summary">{getOrderProductSummary(o)}</span>,
    },
    {
      title: '款数',
      width: 56,
      align: 'center',
      render: (_, o) => <span>{o.itemCount || o.orderItems?.length || 1}</span>,
    },
    {
      title: '业务员',
      width: 84,
      ellipsis: true,
      render: (_, o) => <Text type="secondary">{o.salespersonName || o.customer.salespersonName || o.createdBy || '—'}</Text>,
    },
    {
      title: '总数量',
      width: 68,
      align: 'right',
      render: (_, o) => <span>{getOrderQuantity(o)}</span>,
    },
    {
      title: '总价',
      width: 90,
      align: 'right',
      render: (_, o) => <span style={{ fontWeight: 700 }}>{formatCurrency(o.totalAmount)}</span>,
    },
    {
      title: '交期',
      width: 100,
      render: (_, o) => <DeliveryCell date={o.deliveryDate} />,
    },
    {
      title: '快递单号',
      width: 130,
      ellipsis: true,
      render: (_, o) => {
        const shipLog = o.approvalLog.find((l) => l.action === 'ship');
        const trackingMatch = shipLog?.reason?.match(/(?:运单号|快递单号)[:：]\s*([^|]+?)(?:\s*\||$)/);
        const trackingNo = trackingMatch?.[1]?.trim();
        return trackingNo
          ? <code className="logistics-tracking-no">{trackingNo}</code>
          : <Text type="secondary">—</Text>;
      },
    },
    {
      title: '操作',
      width: 130,
      align: 'left',
      className: 'sales-action-column',
      render: (_, o) => (
        <Space size={0} className="sales-inline-actions">
          <Button type="link" size="small" loading={acting === o.id} onClick={() => handleApproveShip(o.id)}>
            批准发货
          </Button>
          <Button
            type="link"
            size="small"
            danger
            loading={acting === o.id}
            onClick={() => setRejectModal({ orderId: o.id, contractNo: o.contractNo || '', type: 'ship' })}
          >
            驳回发货
          </Button>
        </Space>
      ),
    },
  ];

  const historyColumns: TableColumnsType<Order> = [
    {
      title: '合同编号',
      width: 160,
      fixed: 'left',
      render: (_, o) => <code className={o.contractNo ? 'sales-table-code' : 'sales-table-code is-empty'}>{o.contractNo || '—'}</code>,
    },
    {
      title: '客户',
      width: 160,
      render: (_, o) => <span className="sales-customer-name">{o.customer.name}</span>,
    },
    {
      title: '产品摘要',
      width: 230,
      ellipsis: true,
      render: (_, o) => <span className="sales-table-summary">{getOrderProductSummary(o)}</span>,
    },
    {
      title: '总价',
      width: 110,
      align: 'right',
      render: (_, o) => formatCurrency(o.totalAmount),
    },
    {
      title: '审批结果',
      width: 110,
      render: (_, o) => {
        const log = latestLog(o);
        return log
          ? <Tag color={actionTagColor(log.action)}>{ACTION_LABEL[log.action] ?? '—'}</Tag>
          : <Text type="secondary">—</Text>;
      },
    },
    {
      title: '审批时间',
      width: 130,
      render: (_, o) => {
        const log = latestLog(o);
        return <Text type="secondary">{log ? formatDate(log.createdAt, 'MM/DD HH:mm') : '—'}</Text>;
      },
    },
    {
      title: '当前状态',
      width: 120,
      render: (_, o) => <StatusBadge status={o.status} />,
    },
  ];

  if (loading) return (
    <div className="gm-management-panel">
      <section className="sales-shell-card">
        <div className="sales-page-head">
          <div>
            <h1>订单审批中心</h1>
            <div className="sales-page-subtitle">审核业务员订单，确认生产完成后的发货安排</div>
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
      key: 'order',
      label: `下单审批${pendingTotal > 0 ? ` (${pendingTotal})` : ''}`,
      children: (
        <div className="sales-list-panel">
          <div className="ymt-filter-bar">
            <label className="ymt-filter ymt-search-filter">
              <svg className="ymt-search-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" /><path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              <input
                className="ymt-search-text"
                placeholder="搜索合同编号 / 客户 / 产品 / 业务员"
                value={pendingSearch}
                onChange={(e) => { setPendingSearch(e.target.value); setPendingPage(1); }}
              />
            </label>
          </div>
          {pendingRows.length === 0 ? (
            <div className="gm-empty-block">
              <Empty icon="✅" title={pending.length === 0 ? '暂无待审批订单' : '未找到匹配订单'} desc={pending.length === 0 ? '所有下单申请均已处理' : '请调整搜索关键词后重试'} />
            </div>
          ) : (
            <Table<Order>
              className="sales-data-table"
              rowKey="id"
              columns={pendingApprovalColumns}
              dataSource={pendingRows}
              tableLayout="fixed"
              pagination={false}
            />
          )}
          {renderPagination(pendingPage, pendingPageSize, pendingSearch.trim() ? pendingRows.length : pendingTotal, (page, pageSize) => {
            setPendingPage(page);
            setPendingPageSize(pageSize);
          })}
        </div>
      ),
    },
    {
      key: 'ship',
      label: `发货审批${pendingShipTotal > 0 ? ` (${pendingShipTotal})` : ''}`,
      children: (
        <div className="sales-list-panel">
          <div className="ymt-filter-bar">
            <label className="ymt-filter ymt-search-filter">
              <svg className="ymt-search-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" /><path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              <input
                className="ymt-search-text"
                placeholder="搜索合同编号 / 客户 / 产品 / 业务员"
                value={pendingShipSearch}
                onChange={(e) => { setPendingShipSearch(e.target.value); setPendingShipPage(1); }}
              />
            </label>
          </div>
          {pendingShipRows.length === 0 ? (
            <div className="gm-empty-block">
              <Empty icon="🚚" title={pendingShip.length === 0 ? '暂无待发货审批订单' : '未找到匹配订单'} desc={pendingShip.length === 0 ? '所有发货申请均已处理' : '请调整搜索关键词后重试'} />
            </div>
          ) : (
            <Table<Order>
              className="sales-data-table"
              rowKey="id"
              columns={shipApprovalColumns}
              dataSource={pendingShipRows}
              tableLayout="fixed"
              pagination={false}
            />
          )}
          {renderPagination(pendingShipPage, pendingShipPageSize, pendingShipSearch.trim() ? pendingShipRows.length : pendingShipTotal, (page, pageSize) => {
            setPendingShipPage(page);
            setPendingShipPageSize(pageSize);
          })}
        </div>
      ),
    },
    {
      key: 'history',
      label: '历史记录',
      children: (
        <div className="sales-list-panel">
          <div className="ymt-filter-bar">
            <label className="ymt-filter ymt-search-filter">
              <svg className="ymt-search-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" /><path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              <input
                className="ymt-search-text"
                placeholder="搜索合同编号 / 客户 / 产品"
                value={historySearch}
                onChange={(e) => { setHistorySearch(e.target.value); setHistoryPage(1); }}
              />
            </label>
          </div>
          {historyRows.length === 0 ? (
            <div className="gm-empty-block">
              <Empty icon="📋" title={history.length === 0 ? '暂无历史审批记录' : '未找到匹配订单'} desc={history.length === 0 ? '近一个月审批过的订单将显示在这里' : '请调整搜索关键词后重试'} />
            </div>
          ) : (
            <Table<Order>
              className="sales-data-table"
              rowKey="id"
              columns={historyColumns}
              dataSource={historyRows}
              tableLayout="fixed"
              pagination={false}
            />
          )}
          {renderPagination(historyPage, historyPageSize, historySearch.trim() ? historyRows.length : historyTotal, (page, pageSize) => {
            setHistoryPage(page);
            setHistoryPageSize(pageSize);
          })}
        </div>
      ),
    },
  ];

  return (
    <div className="gm-management-panel">
      <section className="sales-shell-card">
        <div className="sales-page-head">
          <div>
            <h1>订单审批中心</h1>
            <div className="sales-page-subtitle">审核业务员订单，确认生产完成后的发货安排</div>
          </div>
          <div className="sales-page-date">{dayjs().format('YYYY年MM月DD日')}</div>
        </div>

        <Tabs
          className="sales-sub-tabs"
          activeKey={subTab}
          onChange={(k) => setSubTab(k as GmTab)}
          items={tabItems}
        />
      </section>

      <Modal
        open={!!rejectModal}
        title={rejectModal?.type === 'ship' ? '驳回发货' : '退回修改'}
        onCancel={() => { setRejectModal(null); setRejectReason(''); }}
        onOk={handleReject}
        okText="确认退回"
        okButtonProps={{ danger: true }}
        cancelText="取消"
        confirmLoading={acting === rejectModal?.orderId}
        destroyOnClose
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
          <Text type="secondary">合同编号</Text>
          <code className={rejectModal?.contractNo ? 'sales-table-code' : 'sales-table-code is-empty'}>
            {rejectModal?.contractNo || '—'}
          </code>
        </div>
        {rejectModal?.type === 'ship' && (
          <Tag color="orange" style={{ marginBottom: 12 }}>驳回后订单将退回「待发货」，由物流重新填写快递信息</Tag>
        )}
        <Input.TextArea
          rows={3}
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="请填写退回原因（可选）"
        />
      </Modal>
    </div>
  );
}
