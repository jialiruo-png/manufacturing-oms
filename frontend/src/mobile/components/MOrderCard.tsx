import type { Order } from '../../types';
import { formatWanCurrency, getDaysLeft } from '../../utils/order';
import MStatusTag from './MStatusTag';

interface MOrderCardProps {
  order: Order;
  onClick?: (order: Order) => void;
  showSalesperson?: boolean;
}

export default function MOrderCard({ order, onClick, showSalesperson }: MOrderCardProps) {
  const daysLeft = getDaysLeft(order.deliveryDate);
  const dueClass = daysLeft < 0 ? 'danger' : daysLeft <= 3 ? 'warning' : '';
  const rail = order.urgent
    ? 'm-card-rail-red'
    : daysLeft < 0
      ? 'm-card-rail-orange'
      : daysLeft <= 3
        ? 'm-card-rail-amber'
        : order.status === 'shipped' ? 'm-card-rail-green' : '';

  const firstItem = order.orderItems?.[0];
  const summary = firstItem
    ? `${firstItem.displayName || firstItem.productName}${order.orderItems.length > 1 ? ` 等 ${order.orderItems.length} 项` : ''}`
    : order.product?.name || '产品未指定';

  return (
    <div className={`m-order-card ${rail}`} onClick={() => onClick?.(order)}>
      <div className="m-order-card-head">
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="m-order-code">{order.contractNo || order.contractRef || `#${order.id}`}</div>
          <div className="m-order-customer">{order.customer?.name || '未知客户'}</div>
        </div>
        <MStatusTag status={order.status} />
      </div>
      <div className="m-order-summary">{summary}</div>
      <div className="m-order-meta">
        <span className="m-order-amount">{formatWanCurrency(order.totalAmount)}</span>
        <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {showSalesperson && order.salespersonName && (
            <span style={{ color: '#94a3b8' }}>{order.salespersonName}</span>
          )}
          <span className={`m-order-due ${dueClass}`}>
            {daysLeft < 0
              ? `逾期 ${Math.abs(daysLeft)} 天`
              : daysLeft === 0
                ? '今日交付'
                : `${daysLeft} 天交付`}
          </span>
        </span>
      </div>
    </div>
  );
}
