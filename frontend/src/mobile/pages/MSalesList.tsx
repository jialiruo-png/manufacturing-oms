import { useEffect, useMemo, useRef, useState } from 'react';
import { LoadingOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { message } from 'antd';
import { ordersApi } from '../../api';
import type { Order, User } from '../../types';
import { push } from '../router';
import MobileLayout from '../MobileLayout';
import MOrderCard from '../components/MOrderCard';
import MEmpty from '../components/MEmpty';
import MLoading from '../components/MLoading';
import { usePullRefresh } from '../hooks/usePullRefresh';
import { canCreateOrder } from '../../utils/permissions';

interface MSalesListProps {
  user: User;
}

interface StatusTab { key: string; label: string; }
const STATUS_TABS: StatusTab[] = [
  { key: 'all', label: '全部' },
  { key: 'draft', label: '草稿' },
  { key: 'pending_approval', label: '待审批' },
  { key: 'procurement', label: '备料中' },
  { key: 'production', label: '生产中' },
  { key: 'ready_ship,pending_ship_approval', label: '待发货' },
  { key: 'shipped', label: '已发货' },
];

const PAGE_SIZE = 20;

export default function MSalesList({ user }: MSalesListProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [statusKey, setStatusKey] = useState('all');
  const [search, setSearch] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const canCreate = canCreateOrder(user);

  const fetch = async (opts: { page: number; reset?: boolean }) => {
    if (opts.reset) setLoading(true); else setLoadingMore(true);
    try {
      const res = await ordersApi.listPaged({
        status: statusKey === 'all' ? undefined : statusKey,
        page: opts.page,
        pageSize: PAGE_SIZE,
        search: search || undefined,
      });
      setTotal(res.total);
      setPage(opts.page);
      setOrders((prev) => (opts.reset ? res.data : [...prev, ...res.data]));
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      message.error(msg || '加载订单失败');
      if (opts.reset) setOrders([]);
    } finally {
      if (opts.reset) setLoading(false); else setLoadingMore(false);
    }
  };

  useEffect(() => { void fetch({ page: 1, reset: true }); /* eslint-disable-next-line */ }, [statusKey, user.id]);

  const onRefresh = async () => { await fetch({ page: 1, reset: true }); };
  const { refreshing, pullDistance, bindProps } = usePullRefresh(scrollRef, onRefresh);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = () => {
      if (loading || loadingMore) return;
      if (orders.length >= total) return;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) {
        void fetch({ page: page + 1 });
      }
    };
    el.addEventListener('scroll', handler, { passive: true });
    return () => el.removeEventListener('scroll', handler);
    // eslint-disable-next-line
  }, [loading, loadingMore, orders.length, total, page]);

  const handleSearch = () => { void fetch({ page: 1, reset: true }); };

  const title = useMemo(() => {
    if (user.isAdmin || user.canManageUsers) return '订单管理';
    if (user.role === 'sales' || canCreate) return '我的订单';
    return '订单';
  }, [user, canCreate]);

  return (
    <MobileLayout title={title} user={user} activeModule="sales">
      <div {...bindProps}>
        <div className="m-pull-indicator" style={{ height: refreshing ? 32 : pullDistance }}>
          {refreshing ? <><LoadingOutlined spin /> <span style={{ marginLeft: 6 }}>刷新中…</span></> : pullDistance > 0 ? (pullDistance >= 60 ? '松开刷新' : '下拉刷新') : null}
        </div>

        {/* 状态 tabs */}
        <div className="m-segbar">
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`m-segbar-item${statusKey === t.key ? ' active' : ''}`}
              onClick={() => setStatusKey(t.key)}
            >{t.label}</button>
          ))}
        </div>

        {/* 搜索 */}
        <div className="m-search-bar">
          <SearchOutlined />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
            placeholder="订单号 / 客户名 / 合同号"
            inputMode="search"
          />
          {search && (
            <a onClick={() => { setSearch(''); setTimeout(handleSearch, 0); }} style={{ fontSize: 12, color: '#94a3b8' }}>清除</a>
          )}
        </div>

        {/* 列表 */}
        {loading ? (
          <MLoading />
        ) : orders.length === 0 ? (
          <MEmpty text="暂无订单数据" />
        ) : (
          <>
            {orders.map((o) => (
              <MOrderCard
                key={o.id}
                order={o}
                onClick={() => push('sales', { id: o.id })}
                showSalesperson={user.isAdmin || user.isClerk || user.canManageUsers}
              />
            ))}
            {loadingMore && <div className="m-list-end"><LoadingOutlined spin /> 加载更多…</div>}
            {!loadingMore && orders.length >= total && (
              <div className="m-list-end">已加载全部 {total} 条</div>
            )}
          </>
        )}
      </div>

      {/* FAB */}
      {canCreate && (
        <button
          type="button"
          className="m-fab"
          onClick={() => push('sales', { action: 'new' })}
          aria-label="新建订单"
        >
          <PlusOutlined />
        </button>
      )}
    </MobileLayout>
  );
}
