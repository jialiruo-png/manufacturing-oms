import { useEffect, useMemo, useRef, useState } from 'react';
import { LoadingOutlined, SearchOutlined, ThunderboltFilled } from '@ant-design/icons';
import { message } from 'antd';
import { ordersApi, getApiErrorMessage } from '../../api';
import type { Order, User } from '../../types';
import { push } from '../router';
import MobileLayout from '../MobileLayout';
import MEmpty from '../components/MEmpty';
import MLoading from '../components/MLoading';
import MStatusTag from '../components/MStatusTag';
import { usePullRefresh } from '../hooks/usePullRefresh';
import { formatShortDate, formatWanCurrency, getDaysLeft } from '../../utils/order';

const TABS = [
  { key: 'procurement', label: '备料中' },
  { key: 'pending_production', label: '待排产' },
  { key: 'procurement,pending_production,production,pending_ship_approval,ready_ship,shipped', label: '全部' },
];

const PAGE_SIZE = 20;

export default function MProcurementList({ user }: { user: User }) {
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
        status: statusKey,
        page: opts.page,
        pageSize: PAGE_SIZE,
        search: search || undefined,
      });
      setTotal(res.total);
      setPage(opts.page);
      setOrders((prev) => (opts.reset ? res.data : [...prev, ...res.data]));
    } catch (e) {
      message.error(getApiErrorMessage(e, '加载采购订单失败'));
      if (opts.reset) setOrders([]);
    } finally {
      if (opts.reset) setLoading(false); else setLoadingMore(false);
    }
  };

  useEffect(() => { void load({ page: 1, reset: true }); /* eslint-disable-next-line */ }, [statusKey]);

  const onRefresh = async () => { await load({ page: 1, reset: true }); };
  const { refreshing, pullDistance, bindProps } = usePullRefresh(scrollRef, onRefresh);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = () => {
      if (loading || loadingMore || orders.length >= total) return;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) {
        void load({ page: page + 1 });
      }
    };
    el.addEventListener('scroll', handler, { passive: true });
    return () => el.removeEventListener('scroll', handler);
    // eslint-disable-next-line
  }, [loading, loadingMore, orders.length, total, page]);

  const visible = useMemo(() => {
    const kw = search.trim().toLowerCase();
    if (!kw) return orders;
    return orders.filter((o) =>
      (o.contractNo || '').toLowerCase().includes(kw)
      || (o.customer?.name || '').toLowerCase().includes(kw)
    );
  }, [orders, search]);

  return (
    <MobileLayout title="采购备料" user={user} activeModule="procurement">
      <div {...bindProps}>
        <div className="m-pull-indicator" style={{ height: refreshing ? 32 : pullDistance }}>
          {refreshing ? <><LoadingOutlined spin /> <span style={{ marginLeft: 6 }}>刷新中…</span></> : pullDistance > 0 ? (pullDistance >= 60 ? '松开刷新' : '下拉刷新') : null}
        </div>

        <div className="m-segbar">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`m-segbar-item${statusKey === t.key ? ' active' : ''}`}
              onClick={() => setStatusKey(t.key)}
            >{t.label}</button>
          ))}
        </div>

        <div className="m-search-bar">
          <SearchOutlined />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="订单号 / 客户名"
            inputMode="search"
          />
          {search && <a onClick={() => setSearch('')} style={{ fontSize: 12, color: '#94a3b8' }}>清除</a>}
        </div>

        {loading ? <MLoading /> : visible.length === 0 ? (
          <MEmpty text="暂无待处理的采购订单" />
        ) : (
          <>
            {visible.map((o) => {
              const totalMat = o.materialSummary?.total ?? o.materials.length;
              const readyMat = o.materialSummary?.ready ?? o.materials.filter((m) => m.status === 'ready').length;
              const unready = totalMat - readyMat;
              const urgentUn = o.materialSummary?.urgentUnready ?? 0;
              const daysLeft = getDaysLeft(o.deliveryDate);
              const dueClass = daysLeft < 0 ? 'danger' : daysLeft <= 3 ? 'warning' : '';
              const ratio = totalMat > 0 ? Math.round((readyMat / totalMat) * 100) : 0;
              const rail = unready === 0 && totalMat > 0 ? 'm-card-rail-green' : urgentUn > 0 ? 'm-card-rail-red' : o.urgent ? 'm-card-rail-amber' : '';
              return (
                <div key={o.id} className={`m-order-card ${rail}`} onClick={() => push('procurement', { id: o.id })}>
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
                  <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, height: 8, borderRadius: 999, background: '#f3f4f6', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${ratio}%`,
                        background: unready === 0
                          ? '#22c55e'
                          : urgentUn > 0
                            ? '#ef4444'
                            : 'linear-gradient(90deg, rgb(190, 0, 0) 0%, rgba(190, 0, 0, 0.12) 100%)',
                        transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                      }} />
                    </div>
                    <span style={{ fontSize: 12, color: '#475569', minWidth: 56, textAlign: 'right' }}>
                      <span className="m-num">{readyMat}</span> / <span className="m-num">{totalMat}</span> 已备
                    </span>
                  </div>
                  <div className="m-order-meta">
                    <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      {urgentUn > 0 && <span className="m-tag urgent"><ThunderboltFilled /> 紧急 {urgentUn}</span>}
                      <span className="m-order-amount">{formatWanCurrency(o.totalAmount)}</span>
                    </span>
                    <span className={`m-order-due ${dueClass}`}>
                      {formatShortDate(o.deliveryDate)} · {daysLeft < 0 ? `逾期 ${Math.abs(daysLeft)} 天` : daysLeft === 0 ? '今日' : `${daysLeft} 天`}
                    </span>
                  </div>
                </div>
              );
            })}
            {loadingMore && <div className="m-list-end"><LoadingOutlined spin /> 加载更多…</div>}
            {!loadingMore && visible.length >= total && (
              <div className="m-list-end">已加载全部 {total} 条</div>
            )}
          </>
        )}
      </div>
    </MobileLayout>
  );
}
