import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canAssignOrderSalesperson, resolveOrderSalesperson } from './orderSalesperson';

test('allows only privileged non-sales users to assign an order salesperson', () => {
  assert.equal(canAssignOrderSalesperson({
    isAdmin: false,
    canCreateOrderForSales: false,
    canManageUsers: false,
    canApproveOrder: false,
  }), false);

  assert.equal(canAssignOrderSalesperson({
    isAdmin: false,
    canCreateOrderForSales: true,
    canManageUsers: false,
    canApproveOrder: false,
  }), true);

  assert.equal(canAssignOrderSalesperson({
    isAdmin: true,
    canCreateOrderForSales: false,
    canManageUsers: false,
    canApproveOrder: false,
  }), true);
});

test('requires privileged non-sales users to choose an order salesperson', async () => {
  const tx = {} as Parameters<typeof resolveOrderSalesperson>[0];
  const user = {
    userId: 9,
    name: '内勤',
    phone: '13800000000',
    role: 'manager',
    managerSubRole: 'clerk',
    isAdmin: false,
    isClerk: true,
    mustChangePassword: false,
    tokenVersion: 0,
    canApproveOrder: false,
    canHandleProcurement: false,
    canHandleProduction: false,
    canHandleLogistics: false,
    canManageUsers: false,
    canViewDashboard: false,
    canCreateOrderForSales: true,
  } as Parameters<typeof resolveOrderSalesperson>[1];

  await assert.rejects(
    () => resolveOrderSalesperson(tx, user, undefined),
    /请选择订单业务员/,
  );
});
