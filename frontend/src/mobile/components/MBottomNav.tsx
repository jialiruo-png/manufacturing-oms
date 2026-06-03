import { useMemo } from 'react';
import {
  AppstoreOutlined,
  BarChartOutlined,
  CarOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  HomeOutlined,
  ShoppingOutlined,
  TeamOutlined,
  ToolOutlined,
  UserOutlined,
} from '@ant-design/icons';
import type { User } from '../../types';
import { canApproveOrder, canCreateOrder, canManageUsers } from '../../utils/permissions';
import { push, type MobileModule } from '../router';

interface MBottomNavProps {
  user: User;
  active: MobileModule;
  badges?: Partial<Record<MobileModule, number>>;
}

interface Slot {
  module: MobileModule;
  label: string;
  icon: typeof HomeOutlined;
}

function slotsForUser(user: User): Slot[] {
  if (user.isAdmin) {
    return [
      { module: 'workbench', label: '工作台', icon: HomeOutlined },
      { module: 'dashboard', label: '看板', icon: BarChartOutlined },
      { module: 'sales', label: '业务', icon: FileTextOutlined },
      { module: 'user-review', label: '用户', icon: TeamOutlined },
      { module: 'profile', label: '我的', icon: UserOutlined },
    ];
  }
  if (user.isClerk) {
    return [
      { module: 'workbench', label: '工作台', icon: HomeOutlined },
      { module: 'dashboard', label: '看板', icon: BarChartOutlined },
      { module: 'sales', label: '订单', icon: FileTextOutlined },
      { module: 'procurement', label: '采购', icon: ShoppingOutlined },
      { module: 'profile', label: '我的', icon: UserOutlined },
    ];
  }
  if (canManageUsers(user)) {
    return [
      { module: 'workbench', label: '工作台', icon: HomeOutlined },
      { module: 'dashboard', label: '看板', icon: BarChartOutlined },
      { module: 'user-review', label: '用户', icon: TeamOutlined },
      { module: 'profile', label: '我的', icon: UserOutlined },
    ];
  }
  if (canApproveOrder(user)) {
    return [
      { module: 'workbench', label: '工作台', icon: HomeOutlined },
      { module: 'dashboard', label: '看板', icon: BarChartOutlined },
      { module: 'gm', label: '审批', icon: CheckCircleOutlined },
      { module: 'sales', label: '订单', icon: FileTextOutlined },
      { module: 'profile', label: '我的', icon: UserOutlined },
    ];
  }
  if (user.role === 'sales' || canCreateOrder(user)) {
    return [
      { module: 'workbench', label: '工作台', icon: HomeOutlined },
      { module: 'sales', label: '订单', icon: FileTextOutlined },
      { module: 'customers', label: '客户', icon: TeamOutlined },
      { module: 'profile', label: '我的', icon: UserOutlined },
    ];
  }
  if (user.role === 'purchase') {
    return [
      { module: 'workbench', label: '工作台', icon: HomeOutlined },
      { module: 'sales', label: '订单', icon: FileTextOutlined },
      { module: 'procurement', label: '采购', icon: ShoppingOutlined },
      { module: 'inventory', label: '库存', icon: AppstoreOutlined },
      { module: 'profile', label: '我的', icon: UserOutlined },
    ];
  }
  if (user.role === 'production') {
    return [
      { module: 'workbench', label: '工作台', icon: HomeOutlined },
      { module: 'production', label: '生产', icon: ToolOutlined },
      { module: 'profile', label: '我的', icon: UserOutlined },
    ];
  }
  if (user.role === 'logistics') {
    return [
      { module: 'workbench', label: '工作台', icon: HomeOutlined },
      { module: 'logistics', label: '物流', icon: CarOutlined },
      { module: 'profile', label: '我的', icon: UserOutlined },
    ];
  }
  return [
    { module: 'workbench', label: '工作台', icon: HomeOutlined },
    { module: 'profile', label: '我的', icon: UserOutlined },
  ];
}

export default function MBottomNav({ user, active, badges }: MBottomNavProps) {
  const slots = useMemo(() => slotsForUser(user), [user]);
  return (
    <div className="m-dock" data-ymt-dock="true">
      <div className="m-dock-grid">
        {slots.map((slot) => {
          const Icon = slot.icon;
          const isActive = slot.module === active;
          const count = badges?.[slot.module] ?? 0;
          return (
            <button
              key={slot.module}
              type="button"
              className={`m-dock-item${isActive ? ' active' : ''}`}
              onClick={() => push(slot.module)}
            >
              <span className="m-dock-figure">
                <Icon />
                {count > 0 && count <= 99 && <span className="m-badge-count">{count}</span>}
                {count > 99 && <span className="m-badge-count">99+</span>}
              </span>
              <span className="m-dock-caption">{slot.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
