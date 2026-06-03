import type { DataChangeReason, RefreshableTab } from '../types';

export const ALL_REFRESHABLE_TABS: RefreshableTab[] = [
  'workbench',
  'dashboard',
  'sales',
  'gm',
  'procurement',
  'production',
  'logistics',
  'user-review',
];

export type RefreshKeys = Record<RefreshableTab, number>;

export const initialRefreshKeys = (): RefreshKeys => Object.fromEntries(
  ALL_REFRESHABLE_TABS.map((tab) => [tab, 0]),
) as RefreshKeys;

const SILENT_NOTIFICATION_REASONS = new Set<DataChangeReason>([
  'procurement_material_changed',
  'procurement_inventory_changed',
]);

const STALE_TABS_BY_REASON: Record<DataChangeReason, RefreshableTab[]> = {
  sales_submit: ['gm', 'dashboard', 'workbench'],
  sales_order_changed: ['gm', 'procurement', 'production', 'logistics', 'dashboard', 'workbench'],
  gm_approve: ['sales', 'procurement', 'production', 'dashboard', 'workbench'],
  gm_reject: ['sales', 'dashboard', 'workbench'],
  gm_approve_ship: ['logistics', 'production', 'sales', 'dashboard', 'workbench'],
  gm_reject_ship: ['production', 'sales', 'dashboard', 'workbench'],
  procurement_start_production: ['production', 'dashboard', 'workbench'],
  procurement_material_changed: ['production', 'dashboard', 'workbench'],
  procurement_inventory_changed: ['production', 'workbench'],
  production_start_production: ['procurement', 'dashboard', 'workbench'],
  production_finish: ['gm', 'dashboard', 'workbench'],
  logistics_ship: ['sales', 'dashboard', 'workbench'],
  user_management_changed: ['sales', 'workbench'],
};

export function tabsToRefreshFor(reason: DataChangeReason, source?: RefreshableTab) {
  return STALE_TABS_BY_REASON[reason].filter((tab) => tab !== source);
}

export function isSilentNotificationReason(reason: DataChangeReason) {
  return SILENT_NOTIFICATION_REASONS.has(reason);
}
