export type OrderStatus =
  | 'draft'
  | 'pending_approval'
  | 'procurement'
  | 'pending_production'
  | 'production'
  | 'pending_ship_approval'
  | 'ready_ship'
  | 'shipped';

export type MaterialStatus = 'pending' | 'in_progress' | 'ready';

export interface Customer {
  id: number;
  name: string;
  contact: string;
  phone: string;
  email: string;
  address: string;
  rating: string;
  notes: string;
  salespersonId: number | null;
  salespersonName: string;
  createdAt: string;
  _count?: { orders: number; commLogs: number };
}

export type CustomerSearchResult = Pick<Customer, 'id' | 'name' | 'contact' | 'phone'>;

export interface CommLog {
  id: number;
  customerId: number;
  type: string;
  outcome: string;
  content: string;
  createdBy: string;
  createdAt: string;
}

export interface Product {
  id: number;
  code: string;
  name: string;
  description: string;
  unitPrice: number;
  bomItems: BomItem[];
}

export interface BomItem {
  id: number;
  productId: number;
  materialName: string;
  spec: string;
  unit: string;
  qty: number;
}

export interface Material {
  id: number;
  orderId: number;
  orderItemId?: number | null;
  name: string;
  spec: string;
  unit: string;
  required: number;
  status: MaterialStatus;
  urgent: boolean;
  expectedDate: string | null;
  notes: string;
  source?: string;
  orderItemDisplayName?: string;
}

export interface ApprovalLog {
  id: number;
  orderId: number;
  action: string;
  fromStage: string;
  toStage: string;
  operator: string;
  reason: string;
  createdAt: string;
}

export interface OrderItem {
  id: number;
  orderId: number;
  productId?: number | null;
  productName: string;
  displayName?: string;
  spec: string;
  customerBrand: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  remark: string;
  detailRequirement: string;
  sourceRowNo: string;
  ctnCount?: number | null;
  qtyPerCtn?: number | null;
  ctnVolume?: number | null;
  totalVolume?: number | null;
  ctnWeight?: number | null;
  totalWeight?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Order {
  id: number;
  customerId: number;
  productId: number | null;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  totalQuantity: number;
  itemCount: number;
  urgent: boolean;
  urgentSource: string;
  urgentReason: string;
  urgentConfirmed: boolean;
  deliveryDate: string;
  status: OrderStatus;
  progressPct: number;
  prevStatus: string;
  notes: string;
  contractNo: string;
  contractRef: string;
  createdBy: string;
  salespersonId: number | null;
  salespersonName: string;
  purchaserName?: string | null;
  orderDate?: string | null;
  createdAt: string;
  updatedAt: string;
  customer: {
    id: number;
    name: string;
    contact: string;
    phone?: string;
    salespersonId: number | null;
    salespersonName: string;
  };
  product: { id: number; name: string; code: string };
  materials: Material[];
  approvalLog: ApprovalLog[];
  orderItems: OrderItem[];
  materialSummary?: {
    total: number;
    ready: number;
    unready: number;
    urgentUnready: number;
  };
}

export interface DashboardData {
  kpis: {
    totalOrders: number;
    pendingApproval: number;
    inProduction: number;
    readyShip: number;
    totalRevenue: number;
  };
  performance: {
    currentMonth: { amount: number; count: number };
    previousMonth: { amount: number; count: number };
    currentYear: { amount: number; count: number };
    previousYear: { amount: number; count: number };
    annualMonthlyStats: { month: string; key: string; revenue: number; count: number }[];
    salesRanking: { name: string; amount: number; count: number; prevAmount: number; diff: number | null }[];
    pipelineCounts: Record<string, number>;
    pipelineCountsByRange?: {
      last30Days: Record<string, number>;
      currentMonth: Record<string, number>;
    };
  };
  recentOrders: Order[];
  riskOrders: (Order & { daysLeft: number; riskReasons: string[] })[];
  monthlyStats: { month: string; revenue: number; count: number }[];
}

export interface InventoryItem {
  id: number;
  name: string;
  spec: string;
  unit: string;
  quantity: number;
  safetyStock: number;
  notes: string;
  updatedAt: string;
}

export type Role = 'dashboard' | 'sales' | 'gm' | 'procurement' | 'production' | 'logistics';

export type RefreshableTab = Role | 'workbench' | 'user-review';

export type DataChangeReason =
  | 'sales_submit'
  | 'sales_order_changed'
  | 'gm_approve'
  | 'gm_reject'
  | 'gm_approve_ship'
  | 'gm_reject_ship'
  | 'procurement_start_production'
  | 'procurement_material_changed'
  | 'procurement_inventory_changed'
  | 'production_start_production'
  | 'production_finish'
  | 'logistics_ship'
  | 'user_management_changed';

export type DataChangeHandler = (reason: DataChangeReason, source?: RefreshableTab) => void;

export interface NotificationItem {
  id: string;
  title: string;
  content: string;
  count: number;
  target: Role | 'user-review';
  level: 'info' | 'warning' | 'urgent';
}

export interface NotificationsResponse {
  items: NotificationItem[];
  total: number;
  generatedAt: string;
}

export type AccountRole = 'sales' | 'purchase' | 'production' | 'logistics' | 'manager' | 'admin';
export type ManagerSubRole = 'approval_manager' | 'clerk' | 'system_admin' | '';
export type UserStatus = 'pending' | 'enabled' | 'rejected' | 'disabled';

export interface User {
  id: number;
  name: string;
  phone: string;
  department: string;
  role: AccountRole;
  managerSubRole: ManagerSubRole;
  canApproveOrder: boolean;
  canManageUsers: boolean;
  isClerk: boolean;
  canCreateOrderForSales: boolean;
  isAdmin: boolean;
  status: UserStatus;
  remark: string;
  lastLoginAt: string | null;
  mustChangePassword: boolean;
  passwordChangedAt: string | null;
  pendingPasswordResetRequestCount: number;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}
