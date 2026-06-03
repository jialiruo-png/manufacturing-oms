import type { AccountRole, ManagerSubRole, User } from '../types';

export const ACCOUNT_ROLE_LABEL: Record<AccountRole, string> = {
  sales: '业务员',
  purchase: '采购',
  production: '生产',
  logistics: '物流',
  manager: '经理层',
  admin: '管理员',
};

export const MANAGER_SUB_ROLE_LABEL: Record<ManagerSubRole, string> = {
  '': '',
  approval_manager: '审批经理',
  clerk: '内勤跟单',
  system_admin: '系统管理员',
};

export const MANAGER_SUB_ROLE_OPTIONS = [
  { value: 'approval_manager', label: '审批经理' },
  { value: 'clerk', label: '内勤跟单' },
  { value: 'system_admin', label: '系统管理员' },
] satisfies { value: Exclude<ManagerSubRole, ''>; label: string }[];

export function displayRole(user: Pick<User, 'role' | 'managerSubRole' | 'isAdmin'>) {
  if (user.role === 'manager') {
    const subRole = MANAGER_SUB_ROLE_LABEL[user.managerSubRole] || '经理层';
    return `${subRole}（经理层）`;
  }
  if (user.role === 'admin' || user.isAdmin) return '管理员';
  return ACCOUNT_ROLE_LABEL[user.role];
}

export function canApproveOrder(user: User) {
  return user.isAdmin || user.canApproveOrder || user.isClerk;
}

export function canManageUsers(user: User) {
  return user.isAdmin || user.canManageUsers;
}

export function canCreateOrder(user: User) {
  return user.isAdmin || user.role === 'sales' || user.canCreateOrderForSales;
}
