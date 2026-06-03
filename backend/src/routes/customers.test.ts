import assert from 'node:assert/strict';
import { test } from 'node:test';
import { publicCustomerSearchSelectForTest, relatedOrderOwnerWhereForTest } from './customers';

test('customer search select exposes only order form fields', () => {
  assert.deepEqual(Object.keys(publicCustomerSearchSelectForTest()).sort(), [
    'contact',
    'id',
    'name',
    'phone',
  ]);
});

test('recent customer owner filter includes legacy orders by order own name fields', () => {
  const where = relatedOrderOwnerWhereForTest({
    user: {
      userId: 8,
      name: '业务员A',
      role: 'sales',
      managerSubRole: '',
      isAdmin: false,
      isClerk: false,
      canApproveOrder: false,
      canManageUsers: false,
      canCreateOrderForSales: false,
      tokenVersion: 0,
      mustChangePassword: false,
    },
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
