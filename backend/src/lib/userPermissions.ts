export const REGISTER_ROLES = ['sales', 'purchase', 'production', 'logistics', 'manager'] as const;
export const ACCOUNT_ROLES = [...REGISTER_ROLES, 'admin'] as const;
export const ACCOUNT_STATUSES = ['pending', 'enabled', 'rejected', 'disabled'] as const;
export const MANAGER_SUB_ROLES = ['approval_manager', 'clerk', 'system_admin'] as const;

export type AccountRole = typeof ACCOUNT_ROLES[number];
export type AccountStatus = typeof ACCOUNT_STATUSES[number];
export type ManagerSubRole = typeof MANAGER_SUB_ROLES[number];

export const ROLE_LABEL: Record<AccountRole, string> = {
  sales: '业务员',
  purchase: '采购',
  production: '生产',
  logistics: '物流',
  manager: '经理层',
  admin: '管理员',
};

export const MANAGER_SUB_ROLE_LABEL: Record<ManagerSubRole, string> = {
  approval_manager: '审批经理',
  clerk: '内勤跟单',
  system_admin: '系统管理员',
};

export function isAccountRole(value: string): value is AccountRole {
  return (ACCOUNT_ROLES as readonly string[]).includes(value);
}

export function isRegisterRole(value: string) {
  return (REGISTER_ROLES as readonly string[]).includes(value);
}

export function isAccountStatus(value: string): value is AccountStatus {
  return (ACCOUNT_STATUSES as readonly string[]).includes(value);
}

export function isManagerSubRole(value: string): value is ManagerSubRole {
  return (MANAGER_SUB_ROLES as readonly string[]).includes(value);
}

export function deriveManagerPermissions(input: {
  role: string;
  managerSubRole?: string;
  canApproveOrder?: boolean;
}) {
  if (input.role !== 'manager') {
    return {
      managerSubRole: '',
      canApproveOrder: false,
      canManageUsers: false,
      isClerk: false,
      canCreateOrderForSales: false,
    };
  }

  if (input.managerSubRole === 'approval_manager') {
    return {
      managerSubRole: 'approval_manager',
      canApproveOrder: true,
      canManageUsers: false,
      isClerk: false,
      canCreateOrderForSales: false,
    };
  }

  if (input.managerSubRole === 'clerk') {
    return {
      managerSubRole: 'clerk',
      canApproveOrder: false,
      canManageUsers: false,
      isClerk: true,
      canCreateOrderForSales: true,
    };
  }

  if (input.managerSubRole === 'system_admin') {
    return {
      managerSubRole: 'system_admin',
      canApproveOrder: true,
      canManageUsers: true,
      isClerk: false,
      canCreateOrderForSales: true,
    };
  }

  return {
    managerSubRole: '',
    canApproveOrder: false,
    canManageUsers: false,
    isClerk: false,
    canCreateOrderForSales: false,
  };
}

export function canApproveOrder(user?: { isAdmin: boolean; canApproveOrder?: boolean; isClerk?: boolean }) {
  return !!user && (user.isAdmin || user.canApproveOrder === true || user.isClerk === true);
}

// 发货审批专用：admin、经理层-内勤跟单（isClerk）、经理层-系统管理员（system_admin）可批准/驳回。
// 通知/红点只发给 admin + isClerk，避免打扰其他经理层；system_admin 进入页面手动审批仍允许。
export function canApproveShipment(user?: { isAdmin: boolean; isClerk?: boolean; managerSubRole?: string }) {
  return !!user && (user.isAdmin || user.isClerk === true || user.managerSubRole === 'system_admin');
}

export function canManageUsers(user?: { isAdmin: boolean; canManageUsers?: boolean }) {
  return !!user && (user.isAdmin || user.canManageUsers === true);
}

// 业务员订单写权限的最低门槛。包含：创建草稿、修改草稿、提交审批、撤回审批、删除草稿。
// 内勤跟单可跨业务员处理订单；如未来需要限制为“仅自己代建的”，需要给 Order 增加创建人 ID 后再做归属校验。
export function canCreateOrderForSales(user?: {
  role: string;
  isAdmin: boolean;
  canCreateOrderForSales?: boolean;
}) {
  return !!user && (user.isAdmin || user.role === 'sales' || user.canCreateOrderForSales === true);
}

export function canHandleProcurement(user?: { role: string; isAdmin: boolean; isClerk?: boolean }) {
  return !!user && (user.isAdmin || user.role === 'purchase' || user.isClerk === true);
}

export function canHandleProduction(user?: { role: string; isAdmin: boolean; isClerk?: boolean }) {
  return !!user && (user.isAdmin || user.role === 'production' || user.isClerk === true);
}

export function canHandleLogistics(user?: { role: string; isAdmin: boolean; isClerk?: boolean }) {
  return !!user && (user.isAdmin || user.role === 'logistics' || user.isClerk === true);
}

export function canViewOrders(user?: {
  role: string;
  isAdmin: boolean;
  canApproveOrder?: boolean;
  canManageUsers?: boolean;
  isClerk?: boolean;
}) {
  if (!user) return false;
  if (user.isAdmin) return true;
  return ['sales', 'purchase', 'production', 'logistics'].includes(user.role)
    || user.canApproveOrder === true
    || user.canManageUsers === true
    || user.isClerk === true;
}

export function canViewCustomers(user?: {
  role: string;
  isAdmin: boolean;
  canApproveOrder?: boolean;
  canManageUsers?: boolean;
  isClerk?: boolean;
}) {
  if (!user) return false;
  if (user.isAdmin) return true;
  return user.role === 'sales'
    || user.role === 'purchase'
    || user.isClerk === true
    || user.canApproveOrder === true
    || user.canManageUsers === true;
}
