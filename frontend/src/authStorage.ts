import type { User } from './types';

export const AUTH_STORAGE_KEY = 'ymt.auth';
export const LEGACY_AUTH_STORAGE_KEY = 'ymt.currentUser';
export const ACTIVE_TAB_STORAGE_KEY = 'ymt.activeTab';
export const AUTH_EXPIRED_EVENT = 'ymt.authExpired';
export const PASSWORD_CHANGE_REQUIRED_EVENT = 'ymt.passwordChangeRequired';

export type AuthState = {
  user: User;
  token: string;
};

export function loadAuthState(): AuthState | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuthState>;
    if (!parsed.user || !parsed.token) return null;
    return parsed as AuthState;
  } catch {
    return null;
  }
}

export function saveAuthState(state: AuthState) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(state));
  localStorage.removeItem(LEGACY_AUTH_STORAGE_KEY);
}

export function clearAuthState() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  localStorage.removeItem(LEGACY_AUTH_STORAGE_KEY);
  localStorage.removeItem(ACTIVE_TAB_STORAGE_KEY);
}
