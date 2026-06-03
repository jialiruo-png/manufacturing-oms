import type { ReactNode } from 'react';
import { Tag, Card, Statistic, Empty as AntEmpty, Modal as AntModal, Typography, Space, Badge } from 'antd';
import dayjs from 'dayjs';
import { formatCurrency, formatShortDate, getDaysLeft, getOrderStatusLabel, getOrderStatusMeta } from '../utils/order';

const { Title, Text } = Typography;

export function StatusBadge({ status }: { status: string }) {
  const s = getOrderStatusMeta(status);
  return <Tag color={s.color} className={`ymt-status-badge ymt-status-${status || 'unknown'}`}>{s.label}</Tag>;
}

export function StatusLabel(status: string): string {
  return getOrderStatusLabel(status);
}

// ─── Page header ─────────────────────────────────────────────────────────────
interface PageHeaderProps {
  title: string;
  subtitle?: string;
  badge?: string;
  right?: ReactNode;
}

export function PageHeader({ title, subtitle, badge, right }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <Space align="center" size={8}>
          <Title level={4} style={{ margin: 0 }}>{title}</Title>
          {badge && <Badge count={badge} color="blue" style={{ fontSize: 11 }} />}
        </Space>
        {subtitle && <Text type="secondary" style={{ fontSize: 13, display: 'block', marginTop: 2 }}>{subtitle}</Text>}
      </div>
      <Space>
        {right}
        <Text type="secondary" style={{ fontSize: 12 }}>{dayjs().format('YYYY年MM月DD日')}</Text>
      </Space>
    </div>
  );
}

// ─── Stat card ───────────────────────────────────────────────────────────────
interface StatCardProps {
  label: string;
  value: string | number;
  desc?: string;
  icon?: string;
  accent?: 'blue' | 'amber' | 'sky' | 'orange' | 'green' | 'red' | 'slate';
}

const ACCENT_COLOR: Record<string, string> = {
  blue: '#2563eb', amber: '#f59e0b', sky: '#0ea5e9',
  orange: '#f97316', green: '#22c55e', red: '#ef4444', slate: '#64748b',
};

export function StatCard({ label, value, desc, icon, accent = 'blue' }: StatCardProps) {
  return (
    <Card size="small" style={{ height: '100%' }}>
      <div className="flex items-center gap-3">
        {icon && (
          <div style={{
            width: 40, height: 40, borderRadius: 10, display: 'flex',
            alignItems: 'center', justifyContent: 'center', fontSize: 18,
            background: ACCENT_COLOR[accent] + '18',
          }}>
            {icon}
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>{label}</Text>
          <Statistic
            value={value}
            valueStyle={{ fontSize: 22, fontWeight: 700, color: ACCENT_COLOR[accent], lineHeight: 1.2 }}
          />
          {desc && <Text type="secondary" style={{ fontSize: 11 }}>{desc}</Text>}
        </div>
      </div>
    </Card>
  );
}

// ─── Order card ──────────────────────────────────────────────────────────────
interface OrderCardProps {
  customerName: string;
  productName: string;
  quantity: number;
  totalAmount: number;
  deliveryDate: string;
  status: string;
  contractNo?: string;
  urgent?: boolean;
  reReview?: boolean;
  tags?: ReactNode[];
  actions?: ReactNode;
  extra?: ReactNode;
}

export function OrderCard({
  customerName, productName, quantity, totalAmount,
  deliveryDate, status, contractNo, urgent, reReview, tags, actions, extra,
}: OrderCardProps) {
  const daysLeft = getDaysLeft(deliveryDate);
  const overdue = daysLeft < 0;
  const soon = daysLeft >= 0 && daysLeft <= 5;
  const borderClass = overdue || urgent ? 'order-card-red' : 'order-card-blue';

  return (
    <Card
      size="small"
      className={borderClass}
      style={{ marginBottom: 0 }}
      bodyStyle={{ padding: '16px 20px' }}
    >
      <div className="flex justify-between items-start">
        <div style={{ minWidth: 0 }}>
          <Space size={6} wrap style={{ marginBottom: 4 }}>
            {contractNo && <code className={contractNo ? 'sales-table-code' : 'sales-table-code is-empty'}>{contractNo}</code>}
            {reReview && <Tag color="orange">复审</Tag>}
            {urgent && <Tag color="red">加急</Tag>}
            <StatusBadge status={status} />
            {tags}
          </Space>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{customerName}</div>
          <Text type="secondary" style={{ fontSize: 13 }}>{productName} × {quantity} 台</Text>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 16 }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{formatCurrency(totalAmount)}</div>
          <div style={{ fontSize: 12, marginTop: 2, fontWeight: 500, color: overdue ? '#ef4444' : soon ? '#f59e0b' : '#64748b' }}>
            {overdue ? `逾期 ${-daysLeft} 天` : `剩 ${daysLeft} 天`}
          </div>
          <Text type="secondary" style={{ fontSize: 11 }}>{formatShortDate(deliveryDate)}</Text>
        </div>
      </div>
      {extra && <div style={{ marginTop: 12 }}>{extra}</div>}
      {actions && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f1f5f9', display: 'flex', gap: 8 }}>
          {actions}
        </div>
      )}
    </Card>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────
interface EmptyProps {
  icon?: string;
  title: string;
  desc?: string;
  action?: ReactNode;
}

export function Empty({ icon = '📋', title, desc, action }: EmptyProps) {
  return (
    <Card>
      <AntEmpty
        image={<span style={{ fontSize: 48 }}>{icon}</span>}
        imageStyle={{ height: 56 }}
        description={
          <div>
            <div style={{ fontWeight: 500, color: '#374151' }}>{title}</div>
            {desc && <Text type="secondary" style={{ fontSize: 13 }}>{desc}</Text>}
          </div>
        }
      >
        {action}
      </AntEmpty>
    </Card>
  );
}

// ─── Section title ────────────────────────────────────────────────────────────
interface SectionTitleProps {
  title: string;
  count?: number;
  accent?: 'blue' | 'amber' | 'red' | 'sky' | 'green' | 'slate';
}

const ACCENT_TAG_COLOR: Record<string, string> = {
  blue: 'blue', amber: 'orange', red: 'red', sky: 'cyan', green: 'green', slate: 'default',
};

export function SectionTitle({ title, count, accent = 'blue' }: SectionTitleProps) {
  return (
    <Space align="center" style={{ marginBottom: 12 }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: ACCENT_COLOR[accent] }} />
      <Text strong style={{ fontSize: 14, color: '#374151' }}>{title}</Text>
      {count !== undefined && <Tag color={ACCENT_TAG_COLOR[accent]}>{count}</Tag>}
    </Space>
  );
}

// ─── Modal wrapper (keeps existing API) ──────────────────────────────────────
interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: string | number;
}

export function Modal({ title, onClose, children, width = 520 }: ModalProps) {
  return (
    <AntModal
      open
      title={title}
      onCancel={onClose}
      footer={null}
      width={typeof width === 'string' ? parseInt(width) : width}
      destroyOnClose
    >
      {children}
    </AntModal>
  );
}

// ─── Form field wrapper ───────────────────────────────────────────────────────
export function FormField({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: '#4b5563', marginBottom: 4 }}>
        {label}{required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
      </div>
      {children}
    </div>
  );
}

// ─── Delivery date cell ───────────────────────────────────────────────────────
export function DeliveryCell({ date, shipped }: { date: string; shipped?: boolean }) {
  const daysLeft = getDaysLeft(date);
  if (shipped) return <Text type="secondary">{formatShortDate(date)}</Text>;
  return (
    <Space size={4}>
      <Text style={{ fontWeight: 500, color: daysLeft < 0 ? '#ef4444' : daysLeft <= 5 ? '#f59e0b' : '#374151' }}>
        {formatShortDate(date)}
      </Text>
      <Text type="secondary" style={{ fontSize: 11 }}>
        {daysLeft < 0 ? `逾${-daysLeft}d` : `${daysLeft}d`}
      </Text>
    </Space>
  );
}
