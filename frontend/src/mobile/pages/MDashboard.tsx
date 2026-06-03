import { useEffect, useMemo, useRef, useState } from 'react';
import { LoadingOutlined } from '@ant-design/icons';
import { message } from 'antd';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { dashboardApi, getApiErrorMessage } from '../../api';
import type { DashboardData, User } from '../../types';
import { push } from '../router';
import { formatShortDate, formatWanCurrency, getDaysLeft, getOrderStatusLabel } from '../../utils/order';
import MobileLayout from '../MobileLayout';
import MLoading from '../components/MLoading';
import MEmpty from '../components/MEmpty';
import { usePullRefresh } from '../hooks/usePullRefresh';

const PIPELINE_STATUSES = [
  { key: 'pending_approval', label: '待审批' },
  { key: 'procurement', label: '备料中' },
  { key: 'pending_production', label: '待排产' },
  { key: 'production', label: '生产中' },
  { key: 'pending_ship_approval', label: '待发货审批' },
  { key: 'ready_ship', label: '待发货' },
  { key: 'shipped', label: '已发货' },
];

function momPct(curr: number, prev: number) {
  if (!prev) return curr > 0 ? 100 : 0;
  return ((curr - prev) / prev) * 100;
}

export default function MDashboard({ user }: { user: User }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [pipelineRange, setPipelineRange] = useState<'last30Days' | 'currentMonth'>('last30Days');

  const load = async () => {
    setLoading(true);
    try { setData(await dashboardApi.get()); }
    catch (e) { message.error(getApiErrorMessage(e, '加载看板失败')); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const { refreshing, pullDistance, bindProps } = usePullRefresh(scrollRef, load);

  const pipelineData = useMemo(() => {
    if (!data) return [];
    const pc = data.performance.pipelineCountsByRange?.[pipelineRange] || data.performance.pipelineCounts;
    return PIPELINE_STATUSES.map((s) => ({ name: s.label, value: pc[s.key] || 0 }));
  }, [data, pipelineRange]);

  const monthlyData = useMemo(() => {
    if (!data) return [];
    return data.performance.annualMonthlyStats.map((d) => ({
      month: d.month, revenue: Math.round(d.revenue / 10000), count: d.count,
    }));
  }, [data]);

  if (loading || !data) {
    return (
      <MobileLayout title="数据看板" user={user} activeModule="dashboard">
        {loading ? <MLoading text="加载看板数据…" /> : <MEmpty />}
      </MobileLayout>
    );
  }

  const { kpis, performance, riskOrders, recentOrders } = data;
  const momAmount = momPct(performance.currentMonth.amount, performance.previousMonth.amount);
  const momCount = momPct(performance.currentMonth.count, performance.previousMonth.count);
  const yoyAmount = momPct(performance.currentYear.amount, performance.previousYear.amount);
  const yoyCount = momPct(performance.currentYear.count, performance.previousYear.count);
  const overdueCount = riskOrders.filter((o) => o.daysLeft < 0).length;
  const urgentCount = riskOrders.filter((o) => o.daysLeft >= 0 && o.daysLeft <= 7).length;
  const maxSalesAmt = Math.max(1, ...performance.salesRanking.map((s) => s.amount));

  return (
    <MobileLayout title="数据看板" user={user} activeModule="dashboard">
      <div {...bindProps}>
        <div className="m-pull-indicator" style={{ height: refreshing ? 32 : pullDistance }}>
          {refreshing ? <><LoadingOutlined spin /> <span style={{ marginLeft: 6 }}>刷新中…</span></> : pullDistance > 0 ? (pullDistance >= 60 ? '松开刷新' : '下拉刷新') : null}
        </div>

        {/* 1. KPI Grid - 全部 5 张 */}
        <div className="m-kpi-grid">
          <div className="m-kpi">
            <div className="m-kpi-label">总订单数</div>
            <div className="m-kpi-value">{kpis.totalOrders}</div>
            <div className="m-kpi-sub">系统累计</div>
          </div>
          <div className="m-kpi">
            <div className="m-kpi-label">待审批</div>
            <div className="m-kpi-value">{kpis.pendingApproval}</div>
            <div className="m-kpi-sub">订单审批中</div>
          </div>
          <div className="m-kpi">
            <div className="m-kpi-label">生产中</div>
            <div className="m-kpi-value">{kpis.inProduction}</div>
            <div className="m-kpi-sub">车间在制</div>
          </div>
          <div className="m-kpi">
            <div className="m-kpi-label">待发货</div>
            <div className="m-kpi-value">{kpis.readyShip}</div>
            <div className="m-kpi-sub">仓库可发</div>
          </div>
          <div className="m-kpi" style={{ gridColumn: 'span 2' }}>
            <div className="m-kpi-label">累计营收</div>
            <div className="m-kpi-value">{formatWanCurrency(kpis.totalRevenue)}</div>
            <div className="m-kpi-sub">系统累计金额</div>
          </div>
        </div>

        {/* 2. 业绩对比 — 本月 vs 上月、本年 vs 上年 同屏呈现 */}
        <div className="m-section-head"><span className="m-section-head-title">业绩对比</span></div>
        <div className="m-card">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>本月金额</div>
              <div className="m-amount" style={{ fontSize: 22 }}>{formatWanCurrency(performance.currentMonth.amount)}</div>
              <div style={{ fontSize: 12, color: momAmount >= 0 ? '#dc2626' : '#059669' }}>
                {momAmount >= 0 ? '▲' : '▼'} {Math.abs(momAmount).toFixed(1)}% vs 上月
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>本月订单数</div>
              <div className="m-amount" style={{ fontSize: 22 }}>{performance.currentMonth.count}</div>
              <div style={{ fontSize: 12, color: momCount >= 0 ? '#dc2626' : '#059669' }}>
                {momCount >= 0 ? '▲' : '▼'} {Math.abs(momCount).toFixed(1)}% vs 上月
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>本年金额</div>
              <div className="m-amount" style={{ fontSize: 18 }}>{formatWanCurrency(performance.currentYear.amount)}</div>
              <div style={{ fontSize: 12, color: yoyAmount >= 0 ? '#dc2626' : '#059669' }}>
                {yoyAmount >= 0 ? '▲' : '▼'} {Math.abs(yoyAmount).toFixed(1)}% vs 去年
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>本年订单数</div>
              <div className="m-amount" style={{ fontSize: 18 }}>{performance.currentYear.count}</div>
              <div style={{ fontSize: 12, color: yoyCount >= 0 ? '#dc2626' : '#059669' }}>
                {yoyCount >= 0 ? '▲' : '▼'} {Math.abs(yoyCount).toFixed(1)}% vs 去年
              </div>
            </div>
          </div>
        </div>

        {/* 3. 流程状态 Pipeline */}
        <div className="m-section-head">
          <span className="m-section-head-title">流程状态</span>
          <span className="m-segbar" style={{ padding: 0 }}>
            <button type="button" className={`m-segbar-item${pipelineRange === 'last30Days' ? ' active' : ''}`} onClick={() => setPipelineRange('last30Days')} style={{ height: 26, fontSize: 12 }}>近30天</button>
            <button type="button" className={`m-segbar-item${pipelineRange === 'currentMonth' ? ' active' : ''}`} onClick={() => setPipelineRange('currentMonth')} style={{ height: 26, fontSize: 12 }}>本月</button>
          </span>
        </div>
        <div className="m-card">
          {pipelineData.map((p) => {
            const maxV = Math.max(1, ...pipelineData.map((x) => x.value));
            return (
              <div key={p.name} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#475569', marginBottom: 4 }}>
                  <span>{p.name}</span>
                  <span className="m-num">{p.value}</span>
                </div>
                <div style={{ height: 8, background: '#f3f4f6', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${(p.value / maxV) * 100}%`,
                    background: 'linear-gradient(90deg, rgb(190, 0, 0) 0%, rgba(190, 0, 0, 0.12) 100%)',
                    transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                  }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* 4. 2026 订单趋势 */}
        <div className="m-section-head"><span className="m-section-head-title">2026 订单趋势</span></div>
        <div className="m-card" style={{ padding: '14px 8px' }}>
          {monthlyData.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>暂无数据</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={monthlyData} margin={{ top: 6, right: 6, bottom: 0, left: -16 }}>
                <CartesianGrid stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} interval={0} angle={-30} textAnchor="end" height={36} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Line type="monotone" dataKey="count" stroke="#c4000b" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* 6. 业务员业绩排行 */}
        <div className="m-section-head"><span className="m-section-head-title">业务员业绩排行</span></div>
        <div className="m-card">
          {performance.salesRanking.length === 0 ? (
            <div style={{ padding: 12, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>暂无数据</div>
          ) : (
            performance.salesRanking.map((rep, idx) => (
              <div key={rep.name + idx} style={{ padding: '10px 0', borderTop: idx > 0 ? '1px dashed #f1f5f9' : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: 999,
                    background: idx < 3 ? '#c4000b' : '#e2e8f0',
                    color: idx < 3 ? '#fff' : '#475569',
                    fontSize: 12, fontWeight: 700,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}>{idx + 1}</span>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{rep.name}</span>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>{rep.count} 单</span>
                  <span className="m-order-amount">{formatWanCurrency(rep.amount)}</span>
                </div>
                <div style={{ height: 8, background: '#f3f4f6', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${(rep.amount / maxSalesAmt) * 100}%`,
                    background: 'linear-gradient(90deg, rgb(190, 0, 0) 0%, rgba(190, 0, 0, 0.12) 100%)',
                    transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                  }} />
                </div>
              </div>
            ))
          )}
        </div>

        {/* 7. 交期预警 */}
        <div className="m-section-head">
          <span className="m-section-head-title">交期预警</span>
          <span style={{ fontSize: 12, color: riskOrders.length > 0 ? '#dc2626' : '#94a3b8' }}>
            逾期 {overdueCount} · 7天内 {urgentCount}
          </span>
        </div>
        {riskOrders.length === 0 ? (
          <MEmpty text="暂无交期风险订单" />
        ) : (
          riskOrders.map((o) => (
            <div key={o.id} className={`m-card ${o.daysLeft < 0 ? 'm-card-rail-red' : 'm-card-rail-amber'}`} onClick={() => push('sales', { id: o.id })}>
              <div className="m-card-header">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="m-order-code">{o.contractNo || o.contractRef || `#${o.id}`}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{o.customer?.name}</div>
                </div>
                <span className={`m-status ${o.status}`}>{getOrderStatusLabel(o.status)}</span>
              </div>
              <div className="m-order-meta">
                <span style={{ fontSize: 12, color: '#94a3b8' }}>{o.riskReasons?.[0] || '即将到期'}</span>
                <span className={`m-order-due ${o.daysLeft < 0 ? 'danger' : 'warning'}`}>
                  {formatShortDate(o.deliveryDate)} · {o.daysLeft < 0 ? `逾期 ${Math.abs(o.daysLeft)} 天` : `${o.daysLeft} 天`}
                </span>
              </div>
            </div>
          ))
        )}

        {/* 8. 最近订单 */}
        <div className="m-section-head"><span className="m-section-head-title">最近订单</span></div>
        {recentOrders.length === 0 ? (
          <MEmpty text="暂无订单" />
        ) : (
          recentOrders.map((o) => (
            <div key={o.id} className="m-card" onClick={() => push('sales', { id: o.id })}>
              <div className="m-card-header">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="m-order-code">{o.contractNo || o.contractRef || `#${o.id}`}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{o.customer?.name}</div>
                </div>
                <span className={`m-status ${o.status}`}>{getOrderStatusLabel(o.status)}</span>
              </div>
              <div className="m-order-meta">
                <span style={{ fontSize: 12, color: '#94a3b8' }}>{o.salespersonName || o.createdBy || '—'}</span>
                <span className="m-order-amount">{formatWanCurrency(o.totalAmount)}</span>
              </div>
            </div>
          ))
        )}

        <div className="m-list-end">数据看板已展示全部模块 · 下拉刷新可更新</div>
      </div>
    </MobileLayout>
  );
}
