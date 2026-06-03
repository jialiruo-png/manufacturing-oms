import { useEffect, useRef, useState } from 'react';
import { BarChart, LineChart } from 'echarts/charts';
import {
  GridComponent,
  GraphicComponent,
  TooltipComponent,
  type GridComponentOption,
  type GraphicComponentOption,
  type TooltipComponentOption,
} from 'echarts/components';
import { graphic, init, use, type ECharts, type ComposeOption } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { Skeleton } from 'antd';
import dayjs from 'dayjs';
import { dashboardApi } from '../api';
import type { DashboardData } from '../types';
import {
  ORDER_RESPONSIBLE_ROLE,
  formatDate,
  getOrderProductSummary,
  getOrderQuantity,
} from '../utils/order';
import './dashboard.css';

use([BarChart, LineChart, GridComponent, GraphicComponent, TooltipComponent, CanvasRenderer]);

type DashboardChartOption = ComposeOption<
  GridComponentOption | GraphicComponentOption | TooltipComponentOption
>;
type LeafletModule = typeof import('leaflet');
type LeafletMap = import('leaflet').Map;

// ─── Constants ────────────────────────────────────────────────────────────────
const ANNUAL_TARGET = 10_000_000; // 年度目标 1000万

const PIPELINE_STAGES = [
  { status: 'pending_approval',      label: '待审批',     color: '#8f1115' },
  { status: 'procurement',           label: '备料中',     color: '#a91f23' },
  { status: 'pending_production',    label: '待排产',     color: '#b62a2f' },
  { status: 'production',            label: '在产',       color: '#c53a3d' },
  { status: 'pending_ship_approval', label: '待发货审批', color: '#d95c5d' },
  { status: 'ready_ship',            label: '待发货',     color: '#e98282' },
  { status: 'shipped',               label: '已发货',     color: '#f1aaa8' },
] as const;

type PipelineRange = 'last30Days' | 'currentMonth';

function spRankClass(i: number) {
  return i === 0 ? 'r1' : i === 1 ? 'r2' : i === 2 ? 'r3' : 'rn';
}

function monthOverMonth(current: number, previous: number) {
  if (previous > 0) return ((current - previous) / previous) * 100;
  if (current > 0) return 100;
  return 0;
}

// ─── Hardcoded customer geo distribution (no real geo API) ───────────────────
const CUSTOMER_POINTS = [
  // China — major cities
  { city: '上海', lat: 31.23, lng: 121.47, n: 85 },
  { city: '北京', lat: 39.90, lng: 116.41, n: 72 },
  { city: '深圳', lat: 22.54, lng: 114.06, n: 70 },
  { city: '广州', lat: 23.13, lng: 113.26, n: 65 },
  { city: '成都', lat: 30.57, lng: 104.07, n: 42 },
  { city: '杭州', lat: 30.29, lng: 120.15, n: 40 },
  { city: '苏州', lat: 31.32, lng: 120.62, n: 38 },
  { city: '南京', lat: 32.06, lng: 118.80, n: 36 },
  { city: '武汉', lat: 30.52, lng: 114.31, n: 35 },
  { city: '天津', lat: 39.13, lng: 117.21, n: 30 },
  { city: '东莞', lat: 23.02, lng: 113.75, n: 32 },
  { city: '重庆', lat: 29.56, lng: 106.55, n: 28 },
  { city: '佛山', lat: 23.03, lng: 113.12, n: 28 },
  { city: '宁波', lat: 29.87, lng: 121.56, n: 26 },
  { city: '西安', lat: 34.27, lng: 108.95, n: 26 },
  { city: '青岛', lat: 36.07, lng: 120.38, n: 24 },
  { city: '厦门', lat: 24.48, lng: 118.09, n: 22 },
  { city: '郑州', lat: 34.76, lng: 113.64, n: 22 },
  { city: '长沙', lat: 28.23, lng: 112.94, n: 21 },
  { city: '合肥', lat: 31.87, lng: 117.28, n: 20 },
  { city: '福州', lat: 26.08, lng: 119.30, n: 19 },
  { city: '昆明', lat: 25.04, lng: 102.83, n: 16 },
  { city: '沈阳', lat: 41.80, lng: 123.43, n: 17 },
  { city: '哈尔滨', lat: 45.75, lng: 126.64, n: 14 },
  // East Asia
  { city: '东京', lat: 35.69, lng: 139.69, n: 32 },
  { city: '首尔', lat: 37.57, lng: 126.98, n: 28 },
  { city: '新加坡', lat: 1.35, lng: 103.82, n: 30 },
  { city: '曼谷', lat: 13.76, lng: 100.52, n: 26 },
  { city: '吉隆坡', lat: 3.14, lng: 101.69, n: 22 },
  { city: '胡志明市', lat: 10.82, lng: 106.63, n: 20 },
  { city: '大阪', lat: 34.69, lng: 135.50, n: 18 },
  { city: '河内', lat: 21.03, lng: 105.83, n: 16 },
  { city: '雅加达', lat: -6.21, lng: 106.81, n: 17 },
  { city: '釜山', lat: 35.10, lng: 129.04, n: 13 },
  { city: '马尼拉', lat: 14.60, lng: 120.98, n: 13 },
  // South Asia
  { city: '孟买', lat: 19.07, lng: 72.88, n: 19 },
  { city: '德里', lat: 28.64, lng: 77.22, n: 16 },
  { city: '班加罗尔', lat: 12.97, lng: 77.59, n: 13 },
  { city: '卡拉奇', lat: 24.86, lng: 67.01, n: 10 },
  { city: '达卡', lat: 23.72, lng: 90.41, n: 8 },
  // Middle East
  { city: '迪拜', lat: 25.20, lng: 55.27, n: 18 },
  { city: '利雅得', lat: 24.69, lng: 46.67, n: 10 },
  // Africa
  { city: '拉各斯', lat: 6.45, lng: 3.38, n: 13 },
  { city: '开罗', lat: 30.06, lng: 31.24, n: 11 },
  { city: '内罗毕', lat: -1.29, lng: 36.82, n: 9 },
  { city: '约翰内斯堡', lat: -26.20, lng: 28.04, n: 9 },
  { city: '卡萨布兰卡', lat: 33.59, lng: -7.59, n: 7 },
  { city: '达累斯萨拉姆', lat: -6.79, lng: 39.27, n: 5 },
  // Europe
  { city: '伦敦', lat: 51.51, lng: -0.13, n: 20 },
  { city: '柏林', lat: 52.52, lng: 13.40, n: 17 },
  { city: '巴黎', lat: 48.85, lng: 2.35, n: 16 },
  { city: '阿姆斯特丹', lat: 52.37, lng: 4.90, n: 14 },
  { city: '汉堡', lat: 53.55, lng: 9.99, n: 11 },
  { city: '罗马', lat: 41.90, lng: 12.50, n: 10 },
  { city: '伊斯坦布尔', lat: 41.01, lng: 28.95, n: 13 },
  { city: '马德里', lat: 40.42, lng: -3.70, n: 8 },
  { city: '华沙', lat: 52.23, lng: 21.02, n: 8 },
  // Americas
  { city: '纽约', lat: 40.71, lng: -74.01, n: 9 },
  { city: '洛杉矶', lat: 34.05, lng: -118.24, n: 7 },
  { city: '圣保罗', lat: -23.55, lng: -46.63, n: 7 },
];

// ─── Component ────────────────────────────────────────────────────────────────
export default function Dashboard({ refreshKey = 0 }: { refreshKey?: number }) {
  const [dashData, setDashData]   = useState<DashboardData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [pipelineRange, setPipelineRange] = useState<PipelineRange>('last30Days');

  // Chart / map container refs
  const pipelineContainerRef = useRef<HTMLDivElement>(null);
  const trendContainerRef    = useRef<HTMLDivElement>(null);
  const mapContainerRef      = useRef<HTMLDivElement>(null);

  // Instance refs (survive re-renders)
  const pipelineChartRef = useRef<ECharts | null>(null);
  const trendChartRef    = useRef<ECharts | null>(null);
  const mapInstanceRef   = useRef<LeafletMap | null>(null);
  const leafletRef       = useRef<LeafletModule | null>(null);

  // ── Data loading ──────────────────────────────────────────────────────────
  useEffect(() => {
    dashboardApi.get()
      .then(setDashData)
      .finally(() => setLoading(false));
  }, [refreshKey]);

  // ── Pipeline chart (ECharts horizontal bar) ───────────────────────────────
  useEffect(() => {
    if (!pipelineContainerRef.current || !dashData) return;

    // Re-init if the instance is stale (container was re-mounted)
    if (
      !pipelineChartRef.current ||
      pipelineChartRef.current.getDom() !== pipelineContainerRef.current
    ) {
      pipelineChartRef.current?.dispose();
      pipelineChartRef.current = init(pipelineContainerRef.current);
    }

    const pc = dashData.performance.pipelineCountsByRange?.[pipelineRange]
      || dashData.performance.pipelineCounts;
    const stages = [...PIPELINE_STAGES].reverse();

    const option: DashboardChartOption = {
      grid: { left: 88, right: 46, top: 4, bottom: 4, containLabel: false },
      xAxis: {
        type: 'value',
        min: 0,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
        splitLine: { lineStyle: { color: '#f4f5f7', type: 'dashed' } },
      },
      yAxis: {
        type: 'category',
        data: stages.map((s) => s.label),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { fontSize: 12, color: '#4b5563', fontWeight: 500 },
      },
      series: [{
        type: 'bar',
        showBackground: true,
        backgroundStyle: {
          color: '#f7f7f7',
          borderRadius: [0, 7, 7, 0],
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: stages.map((s) => ({
          value: pc[s.status] ?? 0,
          itemStyle: { color: s.color, borderRadius: [0, 7, 7, 0] },
        })),
        label: {
          show: true,
          position: 'right',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter: (p: any) => `${p.value} 单`,
          fontSize: 11,
          color: '#6b7280',
          fontWeight: 500,
        },
        barMaxWidth: 14,
      }],
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'none' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: (p: any) => `${p[0].name}：<b>${p[0].value}</b> 单`,
      },
    };
    pipelineChartRef.current.setOption(option);
  }, [dashData, pipelineRange]);

  // ── Trend chart (ECharts line + gradient area) ────────────────────────────
  useEffect(() => {
    if (!trendContainerRef.current || !dashData) return;

    if (
      !trendChartRef.current ||
      trendChartRef.current.getDom() !== trendContainerRef.current
    ) {
      trendChartRef.current?.dispose();
      trendChartRef.current = init(trendContainerRef.current);
    }

    const stats  = dashData.performance.annualMonthlyStats;
    const trendX = stats.map((d) => {
      const [yr, mo] = d.key.split('-');
      return `${yr.slice(2)}/${mo}`;
    });
    const trendY  = stats.map((d) => parseFloat((d.revenue / 10000).toFixed(1)));
    const nonZero = trendY.filter((v) => v > 0);
    const avg     = nonZero.length > 0
      ? parseFloat((nonZero.reduce((a, b) => a + b, 0) / nonZero.length).toFixed(1))
      : 0;

    const option: DashboardChartOption = {
      grid: { left: 52, right: 28, top: 24, bottom: 36 },
      tooltip: {
        trigger: 'axis',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: (p: any) =>
          `${p[0].name}&nbsp;&nbsp;<span style="font-weight:700;color:#c8251c">¥${p[0].value}万</span>`,
      },
      xAxis: {
        type: 'category',
        data: trendX,
        axisLine: { lineStyle: { color: '#e5e7eb' } },
        axisTick: { show: false },
        axisLabel: { fontSize: 11, color: '#9ca3af' },
        boundaryGap: false,
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          fontSize: 11,
          color: '#9ca3af',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter: (v: any) => `${v}万`,
        },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: '#f3f4f6' } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        min: (val: any) => Math.floor((val.min - 20) / 10) * 10,
      },
      series: [
        {
          type: 'line',
          data: trendY,
          smooth: 0.4,
          symbol: 'circle',
          symbolSize: 6,
          lineStyle: { color: '#c8251c', width: 2 },
          itemStyle: { color: '#c8251c', borderColor: '#fff', borderWidth: 2 },
          areaStyle: {
            color: new graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(200,37,28,0.18)' },
              { offset: 1, color: 'rgba(200,37,28,0.01)' },
            ]),
          },
        },
        ...(avg > 0 ? [{
          type: 'line' as const,
          data: trendY.map(() => avg),
          symbol: 'none',
          silent: true,
          lineStyle: { color: '#faad14', width: 1.5, type: 'dashed' as const },
          tooltip: { show: false },
        }] : []),
      ],
      ...(avg > 0 ? {
        graphic: [{
          type: 'text',
          right: 28,
          top: 5,
          style: {
            text: `月均 ${avg}万`,
            fontSize: 11,
            fill: '#faad14',
            fontWeight: 500,
          },
        }],
      } : {}),
    };
    trendChartRef.current.setOption(option);
  }, [dashData]);

  // ── Leaflet world map ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;
    let cancelled = false;

    const initMap = async () => {
      await import('leaflet/dist/leaflet.css');
      const leaflet = leafletRef.current ?? await import('leaflet');
      leafletRef.current = leaflet;
      if (cancelled || !mapContainerRef.current || mapInstanceRef.current) return;

      const map = leaflet.map(mapContainerRef.current, {
        center: [25, 80],
        zoom: 2,
        minZoom: 2,
        maxZoom: 7,
        scrollWheelZoom: false,
        zoomControl: true,
      });

      leaflet.tileLayer(
        'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        { attribution: '© OpenStreetMap © CARTO', subdomains: 'abcd', maxZoom: 19 },
      ).addTo(map);

      CUSTOMER_POINTS.forEach((d) => {
        const r = Math.sqrt(d.n) * 2.4 + 4;
        const c = d.n >= 50 ? '#ef4444' : d.n >= 25 ? '#2f66ff' : d.n >= 15 ? '#7c3aed' : '#10b981';
        leaflet.circleMarker([d.lat, d.lng], {
          radius: r,
          fillColor: c,
          color: '#fff',
          weight: 1.5,
          opacity: 1,
          fillOpacity: 0.78,
        }).addTo(map).bindPopup(`<b>${d.city}</b><br/>客户数：<b>${d.n}</b> 家`);
      });

      mapInstanceRef.current = map;
    };

    initMap();

    return () => {
      cancelled = true;
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
    };
  }, [dashData]);

  // ── Window resize ─────────────────────────────────────────────────────────
  useEffect(() => {
    const handleResize = () => {
      pipelineChartRef.current?.resize();
      trendChartRef.current?.resize();
      mapInstanceRef.current?.invalidateSize();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      pipelineChartRef.current?.dispose();
      pipelineChartRef.current = null;
      trendChartRef.current?.dispose();
      trendChartRef.current = null;
    };
  }, []);

  // ── Loading / error states ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="db-loading">
        <div className="db-kpi-grid" style={{ marginBottom: 16 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="db-kpi-card">
              <Skeleton active paragraph={{ rows: 2 }} title={{ width: '60%' }} />
            </div>
          ))}
        </div>
        <div className="db-card">
          <Skeleton active paragraph={{ rows: 9 }} />
        </div>
      </div>
    );
  }

  if (!dashData) {
    return <div className="db-error">数据加载失败，请刷新页面重试</div>;
  }

  // ── Computed values ───────────────────────────────────────────────────────
  const now        = dayjs();
  const { performance, riskOrders } = dashData;

  const monthAmount = performance.currentMonth.amount;
  const monthCount  = performance.currentMonth.count;
  const yearAmount  = performance.currentYear.amount;
  const achievePct  = Math.min(Math.round((yearAmount / ANNUAL_TARGET) * 100), 100);

  const currentYearStr = now.format('YYYY');
  const momAmount = monthOverMonth(monthAmount, performance.previousMonth.amount);
  const momCount  = monthOverMonth(monthCount, performance.previousMonth.count);

  // Pipeline in-transit
  const pc = performance.pipelineCounts;
  const inTransitCount  = ['pending_approval', 'procurement', 'pending_production', 'production', 'pending_ship_approval', 'ready_ship']
    .reduce((sum, s) => sum + (pc[s] || 0), 0);
  const productionCount  = (pc['production']  || 0) + (pc['pending_production'] || 0);
  const procurementCount = pc['procurement'] || 0;
  const maxSalesAmt = Math.max(...performance.salesRanking.map((s) => s.amount), 1);

  // Risk order breakdown
  const overdueCount      = riskOrders.filter((o) => o.daysLeft < 0).length;
  const urgentSevenCount  = riskOrders.filter((o) => o.daysLeft >= 0 && o.daysLeft <= 7).length;

  // Trend badge text
  const nonZeroStats   = performance.annualMonthlyStats.filter((d) => d.revenue > 0);
  const trendBadgeText = nonZeroStats.length > 0
    ? `${nonZeroStats[0].key.slice(2).replace('-', '/')} — ${nonZeroStats[nonZeroStats.length - 1].key.slice(2).replace('-', '/')}  年累计 ${(yearAmount / 10000).toFixed(0)}万`
    : `${currentYearStr.slice(2)}/01 — ${currentYearStr.slice(2)}/12  年累计 0万`;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>

      {/* ── KPI Cards ── */}
      <div className="db-kpi-grid">

        {/* Card 1: 当月订单金额 */}
        <div className="db-kpi-card">
          <div className="db-kpi-label">
            <div className="db-kpi-icon" style={{ background: '#eff6ff', color: '#2f66ff' }}>¥</div>
            当月订单金额
          </div>
          <div className="db-kpi-value">
            {(monthAmount / 10000).toFixed(1)}<span className="db-unit"> 万</span>
          </div>
          <div className={`db-kpi-change ${momAmount >= 0 ? 'up' : 'down'}`}>
            {momAmount >= 0 ? '▲' : '▼'} {Math.abs(momAmount).toFixed(1)}%&nbsp; 环比上月
          </div>
        </div>

        {/* Card 2: 当月订单笔数 */}
        <div className="db-kpi-card">
          <div className="db-kpi-label">
            <div className="db-kpi-icon" style={{ background: '#f0fdf4', color: '#16a34a', fontSize: '11px' }}>单</div>
            当月订单笔数
          </div>
          <div className="db-kpi-value">
            {monthCount}<span className="db-unit"> 笔</span>
          </div>
          <div className={`db-kpi-change ${momCount >= 0 ? 'up' : 'down'}`}>
            {momCount >= 0 ? '▲' : '▼'} {Math.abs(momCount).toFixed(1)}%&nbsp; 环比上月
          </div>
        </div>

        {/* Card 3: 年度累计 */}
        <div className="db-kpi-card">
          <div className="db-kpi-label">
            <div className="db-kpi-icon" style={{ background: '#fefce8', color: '#ca8a04', fontSize: '10px' }}>目标</div>
            年度累计金额
          </div>
          <div className="db-kpi-value">
            {(yearAmount / 10000).toFixed(0)}<span className="db-unit"> 万</span>
          </div>
          <div className="db-kpi-change info">年度达成率 {achievePct}%</div>
          <div className="db-kpi-progress">
            <div className="db-kpi-progress-fill" style={{ width: `${achievePct}%` }} />
          </div>
        </div>

        {/* Card 4: 在途订单 */}
        <div className="db-kpi-card">
          <div className="db-kpi-label">
            <div className="db-kpi-icon" style={{ background: '#faf5ff', color: '#7c3aed', fontSize: '11px' }}>途</div>
            当前在途订单
          </div>
          <div className="db-kpi-value">
            {inTransitCount}<span className="db-unit"> 个</span>
          </div>
          <div className="db-kpi-sub">
            生产中 {productionCount} 个 &nbsp;·&nbsp; 备料中 {procurementCount} 个
          </div>
        </div>

        {/* Card 5: 交期预警 */}
        <div className="db-kpi-card">
          <div className="db-kpi-label">
            <div className="db-kpi-icon" style={{ background: '#fff7ed', color: '#ea580c', fontSize: '11px' }}>⚠</div>
            交期预警
          </div>
          <div className="db-kpi-value">
            {riskOrders.length}<span className="db-unit"> 个</span>
          </div>
          <div className={`db-kpi-sub ${riskOrders.length > 0 ? 'warn' : ''}`}>
            {riskOrders.length > 0
              ? `7天内到期 ${urgentSevenCount} 个 · 逾期 ${overdueCount} 个`
              : '暂无预警，交期正常'}
          </div>
        </div>

      </div>

      {/* ── Middle Grid: Pipeline | Map | Salesperson ── */}
      <div className="db-middle-grid">

        {/* Left: Pipeline chart */}
        <div className="db-card db-pipeline-card">
          <div className="db-card-title">
            <div className="db-card-title-text">
              <span className="db-card-title-dot" />
              订单全流程状态
            </div>
            <div className="db-pipeline-range-toggle" aria-label="订单全流程状态时间范围">
              <button
                type="button"
                className={pipelineRange === 'last30Days' ? 'active' : ''}
                onClick={() => setPipelineRange('last30Days')}
              >
                近30天
              </button>
              <button
                type="button"
                className={pipelineRange === 'currentMonth' ? 'active' : ''}
                onClick={() => setPipelineRange('currentMonth')}
              >
                本月
              </button>
            </div>
          </div>
          <div ref={pipelineContainerRef} className="db-pipeline-chart" />
        </div>

        {/* Center: World map */}
        <div className="db-card">
          <div className="db-card-title">
            <div className="db-card-title-text">
              <span className="db-card-title-dot" />
              全球客户分布
            </div>
            <span className="db-card-badge">523 家客户 · 18 个国家/地区</span>
          </div>
          <div ref={mapContainerRef} className="db-map-container" />
          <div className="db-map-legend">
            <div className="db-legend-item">
              <div className="db-legend-dot" style={{ background: '#ef4444' }} />
              重点城市 (≥50)
            </div>
            <div className="db-legend-item">
              <div className="db-legend-dot" style={{ background: '#2f66ff' }} />
              主要城市 (25–49)
            </div>
            <div className="db-legend-item">
              <div className="db-legend-dot" style={{ background: '#7c3aed' }} />
              普通城市 (15–24)
            </div>
            <div className="db-legend-item">
              <div className="db-legend-dot" style={{ background: '#10b981' }} />
              新兴市场 (&lt;15)
            </div>
          </div>
          <div className="db-map-stats-row">
            <div className="db-map-stat">
              <div className="db-map-stat-val">49%</div>
              <div className="db-map-stat-lbl">境内客户</div>
            </div>
            <div className="db-map-stat">
              <div className="db-map-stat-val">51%</div>
              <div className="db-map-stat-lbl">境外客户</div>
            </div>
            <div className="db-map-stat">
              <div className="db-map-stat-val">东亚</div>
              <div className="db-map-stat-lbl">最大海外区域</div>
            </div>
            <div className="db-map-stat">
              <div className="db-map-stat-val">18</div>
              <div className="db-map-stat-lbl">覆盖国家/地区</div>
            </div>
          </div>
        </div>

        {/* Right: Salesperson ranking */}
        <div className="db-card db-sales-ranking-card">
          <div className="db-card-title">
            <div className="db-card-title-text">
              <span className="db-card-title-dot" />
              业务员月度业绩排行
            </div>
            <span className="db-card-badge">{now.format('YYYY年M月')}</span>
          </div>
          <div className="db-sp-list">
            {performance.salesRanking.length === 0 ? (
              <div className="db-sp-empty">当月暂无订单数据</div>
            ) : (
              performance.salesRanking.map((rep, idx) => (
                <div key={rep.name} className="db-sp-item">
                  <div className={`db-sp-rank ${spRankClass(idx)}`}>{idx + 1}</div>
                  <div className="db-sp-info">
                    <div className="db-sp-row">
                      <span className="db-sp-name">{rep.name}</span>
                      <span className="db-sp-amt">{(rep.amount / 10000).toFixed(1)}万</span>
                    </div>
                    <div className="db-sp-bar-bg">
                      <div
                        className="db-sp-bar-fill"
                        style={{ width: `${(rep.amount / maxSalesAmt * 100).toFixed(1)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* ── 年度销售趋势 ── */}
      <div className="db-card db-trend-section">
        <div className="db-card-title">
          <div className="db-card-title-text">
            <span className="db-card-title-dot" />
            {now.format('YYYY')}年度销售趋势
          </div>
          <span className="db-card-badge">{trendBadgeText}</span>
        </div>
        <div ref={trendContainerRef} className="db-trend-chart" />
      </div>

      {/* ── 交期预警看板 ── */}
      <div className="db-card db-warning-section">
        <div className="db-card-title">
          <div className="db-card-title-text">
            <span className="db-card-title-dot" style={{ background: '#ef4444' }} />
            交期预警看板
          </div>
          {riskOrders.length > 0 && (
            <span className="db-card-badge warn">
              {riskOrders.length} 个预警（逾期 {overdueCount} · 7天内 {urgentSevenCount}）
            </span>
          )}
        </div>

        {riskOrders.length === 0 ? (
          <div className="db-warning-empty">暂无交期风险订单，一切正常 ✓</div>
        ) : (
          <table className="db-warning-table">
            <thead>
              <tr>
                <th>合同编号</th>
                <th>客户</th>
                <th>产品</th>
                <th>款数/数量</th>
                <th>交期</th>
                <th>剩余天数</th>
                <th>状态</th>
                <th>责任人</th>
              </tr>
            </thead>
            <tbody>
              {riskOrders.map((o) => {
                const daysLeft   = o.daysLeft;
                const isOverdue  = daysLeft < 0;
                const isUrgent   = !isOverdue && daysLeft <= 7;
                const statusCls  = isOverdue ? 's-overdue' : isUrgent ? 's-urgent' : 's-normal';
                const statusLbl  = isOverdue ? '逾期' : isUrgent ? '即将到期' : '正常';
                const remCls     = isOverdue ? 'overdue' : isUrgent ? 'urgent' : 'normal';
                const remTxt     = isOverdue
                  ? (daysLeft === 0 ? '今日到期' : `逾期 ${Math.abs(daysLeft)} 天`)
                  : `${daysLeft} 天`;
                const itemCount  = o.itemCount || o.orderItems?.length || 1;
                const qty        = getOrderQuantity(o);
                return (
                  <tr key={o.id}>
                    <td>
                      <span className={o.contractNo ? 'db-contract-code' : 'db-contract-code is-empty'}>{o.contractNo || '—'}</span>
                    </td>
                    <td title={o.customer?.name || ''}>{o.customer?.name || '—'}</td>
                    <td title={getOrderProductSummary(o)}>{getOrderProductSummary(o, 1)}</td>
                    <td style={{ color: '#6b7280' }}>{itemCount} 款 / {qty} 台</td>
                    <td>{formatDate(o.deliveryDate, 'YYYY-MM-DD')}</td>
                    <td><span className={`db-rem ${remCls}`}>{remTxt}</span></td>
                    <td><span className={`db-status-badge ${statusCls}`}>{statusLbl}</span></td>
                    <td>{ORDER_RESPONSIBLE_ROLE[o.status] || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

    </div>
  );
}
