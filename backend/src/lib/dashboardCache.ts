const DASHBOARD_CACHE_TTL_MS = 30_000;

type CacheEntry = {
  data: unknown;
  expiresAt: number;
};

const dashboardCache = new Map<string, CacheEntry>();

export function dashboardCacheKey() {
  return 'dashboard:global:v1';
}

export function getDashboardCache(key: string) {
  const cached = dashboardCache.get(key);
  if (!cached || cached.expiresAt <= Date.now()) return null;
  return cached.data;
}

export function setDashboardCache(key: string, data: unknown) {
  dashboardCache.set(key, {
    data,
    expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS,
  });
}

export function clearDashboardCache() {
  dashboardCache.clear();
}
