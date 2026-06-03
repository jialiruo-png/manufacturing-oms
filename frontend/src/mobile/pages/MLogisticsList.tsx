import { useEffect, useRef, useState } from 'react';
import { LoadingOutlined, SearchOutlined } from '@ant-design/icons';
import { message } from 'antd';
import { getApiErrorMessage, ordersApi } from '../../api';
import type { Order, User } from '../../types';
import { push } from '../router';
import MobileLayout from '../MobileLayout';
import MEmpty from '../components/MEmpty';
import MLoading from '../components/MLoading';
import MStatusTag from '../components/MStatusTag';
import { usePullRefresh } from '../hooks/usePullRefresh';
import { formatShortDate, formatWanCurrency, getDaysLeft } from '../../utils/order';

const TABS = [
  { key: 'ready_ship', label: '待发货' },
  { key: 'pending_ship_approval,shipped', label: '已发货' },
];

const PAGE_SIZE = 20;

function parseTracking(o: Order): string {
  const log = o.approvalLog?.slice().reverse().find((l) => l.action === 'ship');
  if (!log?.reason) return '';
  const parts = log.reason.split('|').map((p) => p.trim());
  const t = parts.find((p) => p.startsWith('运单号:'));
  return t ? t.slice(4).trim() : '';
}

export default function MLogisticsList({ user }: { user: User }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [statusKey, setStatusKey] = useState(TABS[0].key);
  const [search, setSearch] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = async (opts: { page: number; reset?: boolean }) => {
    if (opts.reset) setLoading(true); else setLoadingMore(true);
    try {
      const res = await ordersApi.listPaged({
        status: statusKey, page: opts.page, pageSize: PAGE_SIZE,
        search: search || undefined,
      });
      setTotal(res.total); setPage(opts.page);
      setOrders((prev) => opts.reset ? res.data : [...prev, ...res.data]);
    } catch (e) {
      message.error(getApiErrorMessage(e, '加载失败'));
      if (opts.reset) setOrders([]);
    } finally {
      if (opts.reset) setLoading(false); else setLoadingMore(false);
    }
  };

  useEffect(() => { void load({ page: 1, reset: true }); /* eslint-disable-next-line */ }, [statusKey]);
  const onRefresh = async () => { await load({ page: 1, reset: true }); };
  const { refreshing, pullDistance, bindProps } = usePullRefresh(scrollRef, onRefresh);

  useEffect(() => {
    const el = scrollRef.current; if (!el) return;
    const handler = () => {
      if (loading || loadingMore || orders.length >= total) return;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) void load({ page: page + 1 });
    };
    el.addEventListener('scroll', handler, { passive: true });
    return () => el.removeEventListener('scroll', handler);
    // eslint-disable-next-line
  }, [loading, loadingMore, orders.length, total, page]);

  return (
    <MobileLayout title="物流发货" user={user} activeModule="logistics">
      <div {...bindProps}>
        <div className="m-pull-indicator" style={{ height: refreshing ? 32 : pullDistance }}>
          {refreshing ? <><LoadingOutlined spin /> <span style={{ marginLeft: 6 }}>刷新中…</span></> : pullDistance > 0 ? (pullDistance >= 60 ? '松开刷新' : '下拉刷新') : null}
        </div>
        <div className="m-segbar">
          {TABS.map((t) => (
            <button key={t.key} type="button" className={`m-segbar-item${statusKey === t.key ? ' active' : ''}`} onClick={() => setStatusKey(t.key)}>{t.label}</button>
          ))}
        </div>
        <div className="m-search-bar">
          <SearchOutlined />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="订单号 / 客户 / 运单号" inputMode="search" onKeyDown={(e) => { if (e.key === 'Enter') void load({ page: 1, reset: true }); }} />
          {search && <a onClick={() => { setSearch(''); setTimeout(() => void load({ page: 1, reset: true }), 0); }} style={{ fontSize: 12, color: '#94a3b8' }}>清除</a>}
        </div>
        {loading ? <MLoading /> : orders.length === 0 ? <MEmpty text="暂无订单" /> : (
          <>
            {orders.map((o) => {
              const daysLeft = getDaysLeft(o.deliveryDate);
              const dueClass = daysLeft < 0 ? 'danger' : daysLeft <= 3 ? 'warning' : '';
              const tracking = parseTracking(o);
              return (
                <div key={o.id} className={`m-order-card${o.urgent ? ' m-card-rail-red' : ''}`} onClick={() => push('logistics', { id: o.id })}>
                  <div className="m-order-card-head">
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="m-order-code">{o.contractNo || o.contractRef || `#${o.id}`}</div>
                      <div className="m-order-customer">{o.customer?.name || '未知客户'}</div>
                    </div>
                    <MStatusTag status={o.status} />
                  </div>
                  <div className="m-order-summary">
                    {o.orderItems?.[0]?.displayName || o.orderItems?.[0]?.productName || '—'}
                    {o.orderItems && o.orderItems.length > 1 ? ` 等 ${o.orderItems.length} 项` : ''}
                  </div>
                  {tracking && (
                    <div style={{ marginTop: 8, fontSize: 12, color: '#2f66ff', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}>
                      运单号 {tracking}
                    </div>
                  )}
                  <div className="m-order-meta">
                    <span className="m-order-amount">{formatWanCurrency(o.totalAmount)}</span>
                    <span className={`m-order-due ${dueClass}`}>
                      {formatShortDate(o.deliveryDate)} · {daysLeft < 0 ? `逾期 ${Math.abs(daysLeft)} 天` : daysLeft === 0 ? '今日' : `${daysLeft} 天`}
                    </span>
                  </div>
                </div>
              );
            })}
            {loadingMore && <div className="m-list-end"><LoadingOutlined spin /> 加载更多…</div>}
            {!loadingMore && orders.length >= total && <div className="m-list-end">已加载全部 {total} 条</div>}
          </>
        )}
      </div>
    </MobileLayout>
  );
}
