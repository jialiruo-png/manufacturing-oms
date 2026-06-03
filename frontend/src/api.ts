import axios from 'axios';
import type { Customer, CustomerSearchResult, Order, Product, DashboardData, CommLog, InventoryItem, AccountRole, ManagerSubRole, User, NotificationsResponse } from './types';
import { AUTH_EXPIRED_EVENT, PASSWORD_CHANGE_REQUIRED_EVENT, clearAuthState, loadAuthState } from './authStorage';

const api = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL || '/api' });

export type Paged<T> = { data: T[]; total: number; page: number; pageSize: number };
type CacheEntry<T> = { data: T; expiresAt: number };

const apiCache = new Map<string, CacheEntry<unknown>>();
const PRODUCTS_CACHE_TTL_MS = 10 * 60 * 1000;
const CUSTOMERS_CACHE_TTL_MS = 5 * 60 * 1000;
const INVENTORY_CACHE_TTL_MS = 60 * 1000;

export function unwrapList<T>(res: T[] | Paged<T>): T[] {
  return Array.isArray(res) ? res : res.data;
}

export function getTotal<T>(res: T[] | Paged<T>): number {
  return Array.isArray(res) ? res.length : res.total;
}

export function getApiErrorMessage(error: unknown, fallback = '操作失败，请稍后重试') {
  const response = (error as {
    response?: {
      data?: {
        error?: string;
        details?: { path?: string; message?: string }[];
      };
    };
    message?: string;
  })?.response;
  const data = response?.data;
  const detailMessages = Array.isArray(data?.details)
    ? data.details
        .map((detail) => detail.message || detail.path)
        .filter(Boolean)
    : [];

  if (detailMessages.length > 0) return detailMessages.join('；');
  if (data?.error) return data.error;

  const code = (error as { code?: string })?.code;
  const message = (error as { message?: string })?.message;
  if (message === 'Network Error') return '网络连接失败，请检查后端服务或网络';
  if (code === 'ECONNABORTED' || code === 'ERR_CANCELED' || /aborted|timeout/i.test(message || '')) {
    return '请求超时，请稍后重试';
  }
  if (message) return message;
  return fallback;
}

function currentAuthMarker() {
  const auth = loadAuthState();
  if (!auth?.token || !auth.user) return 'anonymous';
  return `${auth.user.id}:${auth.user.role}:${auth.user.isAdmin ? 'admin' : 'user'}:${auth.token.slice(-12)}`;
}

function normalizeParams(params?: Record<string, unknown>) {
  if (!params) return '';
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('&');
}

function stableCacheKey(prefix: string, params?: Record<string, unknown>, userMarker = currentAuthMarker()) {
  const query = normalizeParams(params);
  return `${prefix}:${userMarker}${query ? `:${query}` : ''}`;
}

function cachedGet<T>(key: string, ttlMs: number, fetcher: () => Promise<T>, force = false): Promise<T> {
  const hit = apiCache.get(key) as CacheEntry<T> | undefined;
  if (!force && hit && hit.expiresAt > Date.now()) return Promise.resolve(hit.data);
  return fetcher().then((data) => {
    apiCache.set(key, { data, expiresAt: Date.now() + ttlMs });
    return data;
  });
}

function clearCache(prefix: string) {
  for (const key of apiCache.keys()) {
    if (key.startsWith(prefix)) apiCache.delete(key);
  }
}

export function clearApiCache() {
  apiCache.clear();
}

api.interceptors.request.use((config) => {
  const auth = loadAuthState();
  if (auth?.token) config.headers.Authorization = `Bearer ${auth.token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestUrl = String(error?.config?.url || '');
    const isLoginRequest = requestUrl.includes('/users/login');
    const code = error?.response?.data?.code;
    if (error?.response?.status === 403 && code === 'PASSWORD_CHANGE_REQUIRED') {
      window.dispatchEvent(new Event(PASSWORD_CHANGE_REQUIRED_EVENT));
    }
    if (error?.response?.status === 401 && !isLoginRequest) {
      clearApiCache();
      clearAuthState();
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
    return Promise.reject(error);
  },
);

export const dashboardApi = {
  get: () => api.get<DashboardData>('/dashboard').then((r) => r.data),
};

export const notificationsApi = {
  list: () => api.get<NotificationsResponse>('/notifications').then((r) => r.data),
};

export const customersApi = {
  list: (params?: { salespersonId?: number; salespersonName?: string; communicatedWithin?: string }) =>
    cachedGet(
      stableCacheKey('customers:list', params),
      CUSTOMERS_CACHE_TTL_MS,
      () => api.get<Customer[]>('/customers', { params }).then((r) => r.data),
    ),
  recent: () => api.get<CustomerSearchResult[]>('/customers/recent').then((r) => r.data),
  search: (q: string) => api.get<CustomerSearchResult[]>('/customers/search', { params: { q } }).then((r) => r.data),
  get: (id: number) => api.get<Customer & { orders: Order[]; commLogs: CommLog[] }>(`/customers/${id}`).then((r) => r.data),
  create: (data: Partial<Customer>) => api.post<Customer>('/customers', data).then((r) => {
    clearCache('customers:');
    return r.data;
  }),
  update: (id: number, data: Partial<Customer>) => api.put<Customer>(`/customers/${id}`, data).then((r) => {
    clearCache('customers:');
    return r.data;
  }),
  delete: (id: number) => api.delete<{ message: string }>(`/customers/${id}`).then((r) => {
    clearCache('customers:');
    return r.data;
  }),
  addLog: (id: number, data: Partial<CommLog>) => api.post<CommLog>(`/customers/${id}/logs`, data).then((r) => {
    clearCache('customers:');
    return r.data;
  }),
};

export const productsApi = {
  list: () => cachedGet(
    stableCacheKey('products:list'),
    PRODUCTS_CACHE_TTL_MS,
    () => api.get<Product[]>('/products').then((r) => r.data),
  ),
  create: (data: { name: string; code: string; unitPrice?: number; description?: string }) =>
    api.post<Product>('/products', data).then((r) => {
      clearCache('products:');
      return r.data;
    }),
};

export const ordersApi = {
  // Compatibility helper for legacy callers that still expect an array.
  // New list screens should use listPaged() and handle total/page/pageSize explicitly.
  list: (params?: { status?: string; customerId?: number; range?: string; sort?: string }) =>
    api.get<Order[] | Paged<Order>>('/orders', { params: { page: 1, pageSize: 50, ...params } }).then((r) => unwrapList(r.data)),
  listPaged: (params: {
    status?: string;
    customerId?: number;
    range?: string;
    sort?: string;
    page: number;
    pageSize: number;
    search?: string;
    searchField?: string;
    deliveryDateFrom?: string;
    deliveryDateTo?: string;
    shipDateFrom?: string;
    shipDateTo?: string;
  }) =>
    api.get<Paged<Order>>('/orders', { params }).then((r) => r.data),
  get: (id: number) => api.get<Order>(`/orders/${id}`).then((r) => r.data),
  create: (data: {
    customerId: number;
    salespersonId?: number;
    deliveryDate: string;
    notes?: string;
    contractRef?: string;
    urgent?: boolean;
    urgentReason?: string;
    items: { productId?: number | null; productName: string; spec?: string; customerBrand?: string; quantity: number; unitPrice: number; remark?: string }[];
  }) => api.post<Order>('/orders', data).then((r) => {
    clearCache('customers:');
    return r.data;
  }),
  update: (id: number, data: {
    deliveryDate?: string;
    notes?: string;
    urgent?: boolean;
    urgentReason?: string;
    items?: { productId?: number | null; productName: string; spec?: string; customerBrand?: string; quantity: number; unitPrice: number; remark?: string }[];
    quantity?: number;
    unitPrice?: number;
    totalAmount?: number;
  }) => api.put<Order>(`/orders/${id}`, data).then((r) => r.data),
  action: (id: number, action: string, reason?: string, extra?: { urgent?: boolean; urgentReason?: string }) =>
    api.post<Order>(`/orders/${id}/action`, { action, reason, ...extra }).then((r) => r.data),
  updateProgress: (id: number, progressPct: number) =>
    api.patch<Order>(`/orders/${id}/progress`, { progressPct }).then((r) => r.data),
  delete: (id: number) => api.delete<{ message: string }>(`/orders/${id}`).then((r) => {
    clearCache('customers:');
    return r.data;
  }),
  parseRequirements: (id: number) =>
    api.post<{ candidates: Array<{ orderItemId?: number; name: string; spec: string; unit: string; required: number; notes: string }> }>(`/orders/${id}/parse-requirements`).then((r) => r.data),
};

export type AISuggestedMaterial = {
  name: string;
  spec: string;
  unit: string;
  estimatedQty: number | null;
  notes: string;
};

export type AISuggestionGroup = {
  orderItemId: number;
  productName: string;
  materials: AISuggestedMaterial[];
};

export const materialsApi = {
  create: (data: { orderId: number; orderItemId?: number; name: string; spec?: string; unit?: string; required: number; notes?: string }) =>
    api.post('/materials', data).then((r) => r.data),
  update: (id: number, data: Partial<{ status: string; urgent: boolean; expectedDate: string | null; notes: string; name: string; spec: string; unit: string; required: number }>) =>
    api.put(`/materials/${id}`, data).then((r) => r.data),
  delete: (id: number) =>
    api.delete(`/materials/${id}`).then((r) => r.data),
  aiSuggest: (orderId: number) =>
    api.post<{ groups: AISuggestionGroup[] }>(`/materials/ai-suggest/${orderId}`, undefined, { timeout: 50_000 }).then((r) => r.data),
};

export const inventoryApi = {
  list: () => cachedGet(
    stableCacheKey('inventory:list'),
    INVENTORY_CACHE_TTL_MS,
    () => api.get<InventoryItem[]>('/inventory').then((r) => r.data),
  ),
  create: (data: Partial<InventoryItem>) => api.post<InventoryItem>('/inventory', data).then((r) => {
    clearCache('inventory:');
    return r.data;
  }),
  update: (id: number, data: Partial<InventoryItem>) => api.put<InventoryItem>(`/inventory/${id}`, data).then((r) => {
    clearCache('inventory:');
    return r.data;
  }),
  adjust: (id: number, delta: number) => api.post<InventoryItem>(`/inventory/${id}/adjust`, { delta }).then((r) => {
    clearCache('inventory:');
    return r.data;
  }),
  delete: (id: number) => api.delete(`/inventory/${id}`).then((r) => {
    clearCache('inventory:');
    return r.data;
  }),
};

export type ParsedExcelItem = {
  productName: string;
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
};

export const excelApi = {
  preview: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<{
      contractInfo: Record<string, string>;
      previewHash: string;
      rows: Record<string, string>[];
      items: ParsedExcelItem[];
      totalRows: number;
      sheetName: string;
      diagnostics: {
        parser: string;
        canImport: boolean;
        missingRequiredFields: string[];
        warnings: string[];
      };
    }>('/excel/preview', form).then((r) => r.data);
  },
  aiParse: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<{
      contractInfo: Record<string, string>;
      previewHash: string;
      rows: Record<string, string>[];
      items: ParsedExcelItem[];
      totalRows: number;
      sheetName: string;
      diagnostics: {
        parser: string;
        canImport: boolean;
        missingRequiredFields: string[];
        warnings: string[];
      };
    }>('/excel/ai-parse', form, { timeout: 50_000 }).then((r) => r.data);
  },
  aiParseImage: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<{
      contractInfo: Record<string, string>;
      previewHash: string;
      rows: Record<string, string>[];
      items: ParsedExcelItem[];
      totalRows: number;
      sheetName: string;
      diagnostics: {
        parser: string;
        canImport: boolean;
        missingRequiredFields: string[];
        warnings: string[];
      };
    }>('/excel/ai-parse-image', form, { timeout: 75_000 }).then((r) => r.data);
  },
  import: (file: File, params: { customerId: number; salespersonId?: number; contractRef: string; deliveryDate: string; previewHash?: string; items?: ParsedExcelItem[] }) => {
    const form = new FormData();
    form.append('file', file);
    const { items, ...rest } = params;
    Object.entries(rest).forEach(([k, v]) => {
      if (v !== undefined && v !== null) form.append(k, String(v));
    });
    if (items && items.length > 0) form.append('items', JSON.stringify(items));
    return api.post<{ success: boolean; imported: number; errors: string[]; orders: unknown[] }>('/excel/import', form).then((r) => {
      clearCache('customers:');
      return r.data;
    });
  },
};

export const usersApi = {
  register: (data: {
    name: string;
    phone: string;
    password: string;
    confirmPassword: string;
    department: string;
    role: Exclude<AccountRole, 'admin'>;
    managerSubRole?: ManagerSubRole;
    remark?: string;
  }) => api.post<{ message: string; user: User }>('/users/register', data).then((r) => r.data),
  registerDemo: (data?: { name?: string }) =>
    api.post<{ message: string; user: User; token: string }>('/users/register-demo', data ?? {}).then((r) => r.data),
  login: (data: { login: string; password: string }) =>
    api.post<{ user: User; token: string }>('/users/login', data).then((r) => r.data),
  requestPasswordReset: (data: { identifier: string }) =>
    api.post<{ message: string }>('/users/password-reset-requests', data).then((r) => r.data),
  changePassword: (data: { oldPassword: string; newPassword: string; confirmPassword: string }) =>
    api.patch<{ message: string; user: User; token: string }>('/users/me/password', data).then((r) => r.data),
  list: (params?: { status?: string; role?: string; q?: string }) =>
    api.get<User[]>('/users', { params }).then((r) => r.data),
  review: (id: number, data: { action: 'approve' | 'reject' | 'disable'; role?: AccountRole; managerSubRole?: ManagerSubRole; canApproveOrder?: boolean }) =>
    api.patch<{ message: string; user: User }>(`/users/${id}/review`, data).then((r) => r.data),
  create: (data: { name: string; phone: string; role: AccountRole; managerSubRole?: ManagerSubRole; canApproveOrder?: boolean; password: string; remark?: string }) =>
    api.post<{ message: string; user: User }>('/users', data).then((r) => r.data),
  manage: (id: number, data: { action: 'update_role' | 'enable' | 'disable' | 'reset_password'; role?: AccountRole; managerSubRole?: ManagerSubRole; canApproveOrder?: boolean }) =>
    api.patch<{ message: string; user: User }>(`/users/${id}/manage`, data).then((r) => r.data),
  delete: (id: number) => api.delete<{ message: string }>(`/users/${id}`).then((r) => r.data),
};
