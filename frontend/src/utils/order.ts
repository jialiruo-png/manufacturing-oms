import dayjs from 'dayjs';
import type { Order } from '../types';

export const ORDER_STATUS_META: Record<string, { label: string; color: string }> = {
  draft: { label: '草稿', color: 'default' },
  pending_approval: { label: '等待审批中', color: 'blue' },
  procurement: { label: '备料中', color: 'orange' },
  production: { label: '生产中', color: 'cyan' },
  pending_ship_approval: { label: '待发货审批', color: 'purple' },
  ready_ship: { label: '待发货', color: 'volcano' },
  shipped: { label: '已发货', color: 'green' },
  rejected: { label: '已退回', color: 'red' },
};

export const ORDER_RESPONSIBLE_ROLE: Record<string, string> = {
  pending_approval: '经理层',
  procurement: '采购',
  production: '生产',
  pending_ship_approval: '经理层',
  ready_ship: '物流',
};

export function getOrderStatusMeta(status: string) {
  return ORDER_STATUS_META[status] ?? { label: status || '—', color: 'default' };
}

export function getOrderStatusLabel(status: string) {
  return getOrderStatusMeta(status).label;
}

export function getOrderProductSummary(order: Order, maxItems = 2) {
  if (order.orderItems?.length > 0) {
    const names = order.orderItems.slice(0, maxItems).map((item) => item.productName);
    const totalItems = order.itemCount || order.orderItems.length;
    const extra = totalItems > maxItems ? ` +${totalItems - maxItems}款` : '';
    return `${names.join('、')}${extra}`;
  }
  return order.product?.name || '—';
}

export function getOrderQuantity(order: Order) {
  return order.totalQuantity || order.quantity || 0;
}

export function getOrderAmount(order: Order) {
  return order.totalAmount || 0;
}

export function formatCurrency(value: number | null | undefined) {
  return `¥${Number(value || 0).toLocaleString('zh-CN')}`;
}

export function formatWanCurrency(value: number | null | undefined, fractionDigits = 1) {
  return `¥${(Number(value || 0) / 10000).toFixed(fractionDigits)}万`;
}

export function formatDate(value: string | Date | null | undefined, pattern = 'YYYY-MM-DD HH:mm', fallback = '—') {
  if (!value) return fallback;
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format(pattern) : fallback;
}

export function formatShortDate(value: string | Date | null | undefined, fallback = '—') {
  return formatDate(value, 'MM/DD', fallback);
}

export function getDaysLeft(value: string | Date | null | undefined) {
  if (!value) return 0;
  return dayjs(value).diff(dayjs(), 'day');
}
