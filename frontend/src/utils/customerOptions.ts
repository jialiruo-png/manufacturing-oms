import type { CustomerSearchResult } from '../types';

export function buildCustomerOrderOptions(customers: CustomerSearchResult[]) {
  return customers.map((customer) => ({
    label: `${customer.name} · ${customer.contact}`,
    value: [customer.name, customer.contact, customer.phone].filter(Boolean).join(' · '),
    customerId: customer.id,
    customerName: customer.name,
  }));
}
