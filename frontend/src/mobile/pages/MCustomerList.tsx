import { useEffect, useMemo, useRef, useState } from 'react';
import { LoadingOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { message } from 'antd';
import { customersApi, getApiErrorMessage } from '../../api';
import type { Customer, User } from '../../types';
import { push } from '../router';
import MobileLayout from '../MobileLayout';
import MCustomerCard from '../components/MCustomerCard';
import MEmpty from '../components/MEmpty';
import MLoading from '../components/MLoading';
import { usePullRefresh } from '../hooks/usePullRefresh';

interface MCustomerListProps {
  user: User;
}

const RATING_FILTERS = ['全部', 'A', 'B', 'C', 'D'];

export default function MCustomerList({ user }: MCustomerListProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [list, setList] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [rating, setRating] = useState('全部');

  const load = async () => {
    setLoading(true);
    try {
      const data = await customersApi.list();
      setList(data);
    } catch (e) {
      message.error(getApiErrorMessage(e, '加载客户失败'));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);
  const { refreshing, pullDistance, bindProps } = usePullRefresh(scrollRef, load);

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return list.filter((c) => {
      if (rating !== '全部' && (c.rating || '').toUpperCase() !== rating) return false;
      if (!kw) return true;
      return c.name.toLowerCase().includes(kw)
        || (c.contact || '').toLowerCase().includes(kw)
        || (c.phone || '').toLowerCase().includes(kw);
    });
  }, [list, search, rating]);

  return (
    <MobileLayout title="客户管理" user={user} activeModule="customers">
      <div {...bindProps}>
        <div className="m-pull-indicator" style={{ height: refreshing ? 32 : pullDistance }}>
          {refreshing ? <><LoadingOutlined spin /> <span style={{ marginLeft: 6 }}>刷新中…</span></> : pullDistance > 0 ? (pullDistance >= 60 ? '松开刷新' : '下拉刷新') : null}
        </div>
        <div className="m-segbar">
          {RATING_FILTERS.map((r) => (
            <button
              key={r}
              type="button"
              className={`m-segbar-item${rating === r ? ' active' : ''}`}
              onClick={() => setRating(r)}
            >{r}</button>
          ))}
        </div>
        <div className="m-search-bar">
          <SearchOutlined />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="客户名 / 联系人 / 手机号"
            inputMode="search"
          />
          {search && (
            <a onClick={() => setSearch('')} style={{ fontSize: 12, color: '#94a3b8' }}>清除</a>
          )}
        </div>
        {loading ? <MLoading /> : filtered.length === 0 ? (
          <MEmpty text="暂无匹配客户" />
        ) : (
          <>
            {filtered.map((c) => (
              <MCustomerCard key={c.id} customer={c} onClick={() => push('customers', { id: c.id })} />
            ))}
            <div className="m-list-end">共 {filtered.length} 位客户</div>
          </>
        )}
      </div>
      <button
        type="button"
        className="m-fab"
        onClick={() => push('customers', { action: 'new' })}
        aria-label="新建客户"
      >
        <PlusOutlined />
      </button>
    </MobileLayout>
  );
}
