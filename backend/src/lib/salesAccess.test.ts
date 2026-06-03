import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canSalesAccessOrderByOwner, salesOrderWhere } from './salesAccess';

const salesUser = {
  userId: 8,
  name: '业务员A',
  role: 'sales',
  managerSubRole: '',
  isAdmin: false,
  canApproveOrder: false,
  canManageUsers: false,
  isClerk: false,
  canCreateOrderForSales: false,
  tokenVersion: 0,
  mustChangePassword: false,
} as const;

test('filters sales orders by order owner fields instead of customer owner', () => {
  const where = salesOrderWhere({
    ...salesUser,
  });

  assert.deepEqual(where, {
    OR: [
      { salespersonId: 8 },
      {
        salespersonId: null,
        OR: [
          { salespersonName: '业务员A' },
          { createdBy: '业务员A' },
        ],
      },
    ],
  });
});

test('allows sales users to access legacy orders by the order own name fields', () => {
  assert.equal(canSalesAccessOrderByOwner(salesUser, {
    salespersonId: 8,
    salespersonName: '其他人',
    createdBy: '其他人',
  }), true);
  assert.equal(canSalesAccessOrderByOwner(salesUser, {
    salespersonId: null,
    salespersonName: '业务员A',
    createdBy: '其他人',
  }), true);
  assert.equal(canSalesAccessOrderByOwner(salesUser, {
    salespersonId: null,
    salespersonName: '',
    createdBy: '业务员A',
  }), true);
  assert.equal(canSalesAccessOrderByOwner(salesUser, {
    salespersonId: null,
    salespersonName: '业务员B',
    createdBy: '业务员B',
  }), false);
});
