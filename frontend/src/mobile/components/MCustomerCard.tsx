import type { Customer } from '../../types';

interface MCustomerCardProps {
  customer: Customer;
  onClick?: (c: Customer) => void;
}

const RATING_TEXT: Record<string, { label: string; cls: string }> = {
  A: { label: 'A 优质', cls: 'success' },
  B: { label: 'B 良好', cls: '' },
  C: { label: 'C 一般', cls: 'warning' },
  D: { label: 'D 关注', cls: 'urgent' },
};

export default function MCustomerCard({ customer, onClick }: MCustomerCardProps) {
  const tag = RATING_TEXT[customer.rating] ?? { label: customer.rating || '—', cls: '' };
  return (
    <div className="m-card" onClick={() => onClick?.(customer)}>
      <div className="m-card-header" style={{ marginBottom: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="m-card-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {customer.name}
          </div>
        </div>
        <span className={`m-tag ${tag.cls}`}>{tag.label}</span>
      </div>
      <div style={{ fontSize: 13, color: '#64748b' }}>
        {customer.contact ? `${customer.contact}` : '—'}
        {customer.phone ? ` · ${customer.phone}` : ''}
      </div>
      <div className="m-card-footer">
        <span>{customer.salespersonName ? `业务员 ${customer.salespersonName}` : '未指派'}</span>
        <span className="m-card-footer-cta">
          订单 {customer._count?.orders ?? 0} 单
        </span>
      </div>
    </div>
  );
}
