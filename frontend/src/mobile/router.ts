import type { AccountRole, Role, User } from '../types';
import { canApproveOrder, canCreateOrder, canManageUsers } from '../utils/permissions';

export const ACTIVE_MOBILE_ROUTE_KEY = 'ymt.activeMobileRoute';
const MOBILE_HISTORY_MARK = '__ymtMobileRoute';
const MOBILE_HISTORY_DEPTH = '__ymtMobileDepth';

export type MobileModule =
  | 'login'
  | 'workbench'
  | 'dashboard'
  | 'sales'
  | 'customers'
  | 'procurement'
  | 'inventory'
  | 'production'
  | 'logistics'
  | 'gm'
  | 'user-review'
  | 'profile';

export interface MobileRoute {
  module: MobileModule;
  action?: 'new' | 'edit';
  id?: number;
  raw: string;
}

const ROUTE_REGEX = /^#\/m\/([a-z-]+)(?:\/(new|edit|\d+))?(?:\/(\d+))?$/;

const DEFAULT_LOGGED_OUT: MobileRoute = { module: 'login', raw: '#/m/login' };
const DEFAULT_LOGGED_IN: MobileRoute = { module: 'workbench', raw: '#/m/workbench' };

function isValidModule(value: string): value is MobileModule {
  return [
    'login', 'workbench', 'dashboard', 'sales', 'customers',
    'procurement', 'inventory', 'production', 'logistics',
    'gm', 'user-review', 'profile',
  ].includes(value);
}

export function parseHash(hash: string): MobileRoute | null {
  const match = hash.match(ROUTE_REGEX);
  if (!match) return null;
  const [, mod, seg2, seg3] = match;
  if (!isValidModule(mod)) return null;
  const route: MobileRoute = { module: mod, raw: hash };
  if (seg2 === 'new') route.action = 'new';
  else if (seg2 === 'edit' && seg3) {
    route.action = 'edit';
    route.id = Number(seg3);
  } else if (seg2 && /^\d+$/.test(seg2)) {
    route.id = Number(seg2);
  }
  return route;
}

export function buildHash(module: MobileModule, options?: { action?: 'new' | 'edit'; id?: number }): string {
  const parts: string[] = ['#/m', module];
  if (options?.action === 'new') parts.push('new');
  else if (options?.action === 'edit' && options.id != null) parts.push('edit', String(options.id));
  else if (options?.id != null) parts.push(String(options.id));
  return parts.join('/');
}

export function getCurrentRoute(): MobileRoute {
  return parseHash(window.location.hash) ?? DEFAULT_LOGGED_OUT;
}

export function push(module: MobileModule, options?: { action?: 'new' | 'edit'; id?: number }) {
  const hash = buildHash(module, options);
  if (window.location.hash === hash) return;
  const url = `${window.location.pathname}${window.location.search}${hash}`;
  window.history.pushState(buildMobileHistoryState(getMobileHistoryDepth() + 1), '', url);
  notifyRouteChange();
}

export function replace(module: MobileModule, options?: { action?: 'new' | 'edit'; id?: number }) {
  const hash = buildHash(module, options);
  const url = `${window.location.pathname}${window.location.search}${hash}`;
  window.history.replaceState(buildMobileHistoryState(getMobileHistoryDepth()), '', url);
  notifyRouteChange();
}

export function back(fallback: MobileModule = 'workbench') {
  if (getMobileHistoryDepth() > 0) {
    window.history.back();
    return;
  }
  replace(fallback);
}

export function persistRoute(route: MobileRoute) {
  if (route.module === 'login') return;
  localStorage.setItem(ACTIVE_MOBILE_ROUTE_KEY, route.raw);
}

export function readPersistedRoute(): MobileRoute | null {
  const raw = localStorage.getItem(ACTIVE_MOBILE_ROUTE_KEY);
  if (!raw) return null;
  return parseHash(raw);
}

export function clearPersistedRoute() {
  localStorage.removeItem(ACTIVE_MOBILE_ROUTE_KEY);
}

export function defaultRouteForUser(user: User): MobileRoute {
  const m = defaultModuleForUser(user);
  return { module: m, raw: buildHash(m) };
}

export function defaultModuleForUser(user: User): MobileModule {
  if (user.isAdmin || canManageUsers(user)) return 'user-review';
  if (user.isClerk) return 'dashboard';
  if (canApproveOrder(user)) return 'gm';
  if (user.role === 'sales' || canCreateOrder(user)) return 'sales';
  return toMobileModule(user.role);
}

export function toMobileModule(role: AccountRole): MobileModule {
  if (role === 'purchase') return 'procurement';
  if (role === 'manager' || role === 'admin') return 'gm';
  if (role === 'demo') return 'dashboard';
  return role;
}

export function modulesForUser(user: User): MobileModule[] {
  const set = new Set<MobileModule>();
  set.add('workbench');
  if (user.isAdmin) {
    set.add('dashboard'); set.add('sales'); set.add('procurement');
    set.add('production'); set.add('logistics'); set.add('gm');
    set.add('inventory'); set.add('customers'); set.add('user-review');
  } else if (user.isClerk) {
    set.add('dashboard'); set.add('sales'); set.add('procurement');
    set.add('production'); set.add('logistics'); set.add('gm');
    set.add('inventory'); set.add('customers');
  } else {
    if (user.role === 'sales' || canCreateOrder(user)) {
      set.add('sales'); set.add('customers');
    }
    if (user.role === 'purchase') {
      set.add('sales'); set.add('procurement'); set.add('inventory');
    }
    if (user.role === 'production') set.add('production');
    if (user.role === 'logistics') set.add('logistics');
    if (canApproveOrder(user)) { set.add('sales'); set.add('gm'); set.add('dashboard'); }
    if (canManageUsers(user)) { set.add('user-review'); set.add('dashboard'); }
  }
  set.add('profile');
  return Array.from(set);
}

export function canAccessModule(user: User, mod: MobileModule): boolean {
  return modulesForUser(user).includes(mod);
}

export { DEFAULT_LOGGED_OUT, DEFAULT_LOGGED_IN };

function notifyRouteChange() {
  try {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } catch {
    window.dispatchEvent(new Event('hashchange'));
  }
}

function buildMobileHistoryState(depth: number) {
  return {
    [MOBILE_HISTORY_MARK]: true,
    [MOBILE_HISTORY_DEPTH]: Math.max(0, depth),
  };
}

function getMobileHistoryDepth() {
  const state = window.history.state as Record<string, unknown> | null;
  if (!state?.[MOBILE_HISTORY_MARK]) return 0;
  const depth = state[MOBILE_HISTORY_DEPTH];
  return typeof depth === 'number' && Number.isFinite(depth) ? depth : 0;
}
