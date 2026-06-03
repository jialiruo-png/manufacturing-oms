import { lazy, Suspense, useState, useEffect, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Dropdown, Layout, Tabs, Button, Space, Badge, Typography, Tooltip, Modal, Form, Input, Alert, message, notification, Skeleton, Drawer } from 'antd';
import FeatureBanner, { resetDismissedFeatures } from './components/FeatureBanner';
import { FEATURE_CARDS } from './features';
import {
  BarChartOutlined,
  CarOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  ReloadOutlined,
  ShoppingOutlined,
  TeamOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import type { AccountRole, DataChangeReason, NotificationItem, RefreshableTab, Role, User } from './types';
import { clearApiCache, notificationsApi, usersApi } from './api';
import { ACCOUNT_ROLE_LABEL, canApproveOrder, canCreateOrder, canManageUsers, displayRole } from './utils/permissions';
import {
  ALL_REFRESHABLE_TABS,
  initialRefreshKeys,
  isSilentNotificationReason,
  tabsToRefreshFor,
  type RefreshKeys,
} from './utils/refreshCoordinator';
import {
  ACTIVE_TAB_STORAGE_KEY,
  AUTH_EXPIRED_EVENT,
  PASSWORD_CHANGE_REQUIRED_EVENT,
  clearAuthState,
  loadAuthState,
  saveAuthState,
  type AuthState,
} from './authStorage';
import ChunkErrorBoundary from './components/ChunkErrorBoundary';
import LoginPage from './pages/LoginPage';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Workbench = lazy(() => import('./pages/Workbench'));
const SalesView = lazy(() => import('./pages/SalesView'));
const GMView = lazy(() => import('./pages/GMView'));
const ProcurementView = lazy(() => import('./pages/ProcurementView'));
const ProductionView = lazy(() => import('./pages/ProductionView'));
const LogisticsView = lazy(() => import('./pages/LogisticsView'));
const UserReviewPage = lazy(() => import('./pages/UserReviewPage'));

const { Header, Content } = Layout;
const { Text } = Typography;
type ChangePasswordValues = { oldPassword: string; newPassword: string; confirmPassword: string };
type ActiveTab = Role | 'workbench' | 'user-review';
type BadgeTab = Role | 'user-review';
type HeaderProfile = { name: string; team: string; account: string; phone: string; avatarUrl?: string };

const ALL_TABS: { key: Role; label: string; icon: ReactNode }[] = [
  { key: 'dashboard',   label: '数据看板', icon: <BarChartOutlined /> },
  { key: 'sales',       label: '业务员',   icon: <FileTextOutlined /> },
  { key: 'procurement', label: '采购',     icon: <ShoppingOutlined /> },
  { key: 'production',  label: '生产',     icon: <ToolOutlined /> },
  { key: 'logistics',   label: '物流',     icon: <CarOutlined /> },
  { key: 'gm',          label: '审批管理', icon: <CheckCircleOutlined /> },
];

const ADMIN_TABS: Role[] = ['dashboard', 'sales', 'procurement', 'production', 'logistics', 'gm'];

function toAppRole(role: AccountRole): Role {
  if (role === 'purchase') return 'procurement';
  if (role === 'manager' || role === 'admin') return 'gm';
  return role;
}

function defaultTabForUser(user: User): ActiveTab {
  if (user.isAdmin || canManageUsers(user)) return 'user-review';
  if (user.isClerk) return 'dashboard';
  if (user.canApproveOrder) return 'gm';
  if (user.canCreateOrderForSales) return 'sales';
  return toAppRole(user.role);
}

function isActiveTab(value: unknown): value is ActiveTab {
  return ['dashboard', 'sales', 'procurement', 'production', 'logistics', 'gm', 'workbench', 'user-review'].includes(String(value));
}

function isPersistentTab(value: unknown): value is Exclude<ActiveTab, 'workbench'> {
  return isActiveTab(value) && value !== 'workbench';
}

function getHashTab(): ActiveTab | null {
  const value = window.location.hash.replace(/^#\/?/, '');
  return isActiveTab(value) ? value : null;
}

function getPersistentHashTab() {
  const tab = getHashTab();
  return isPersistentTab(tab) ? tab : null;
}

function tabsForUser(user: User) {
  if (user.isAdmin) return [...ADMIN_TABS, 'user-review' as const];
  if (user.isClerk) return [...ADMIN_TABS];
  const tabs: Array<Role | 'user-review'> = [];
  if (user.role === 'sales' || canCreateOrder(user)) tabs.push('sales');
  if (user.role === 'purchase') tabs.push('sales', 'procurement');
  if (user.role === 'production') tabs.push('production');
  if (user.role === 'logistics') tabs.push('logistics');
  if (canApproveOrder(user)) tabs.push('sales');
  if (canManageUsers(user)) tabs.push('sales');
  if (canApproveOrder(user) || canManageUsers(user)) tabs.push('dashboard');
  if (canApproveOrder(user)) tabs.push('gm');
  if (canManageUsers(user)) tabs.push('user-review');
  return [...new Set(tabs)];
}

function canAccessTab(user: User, tab: ActiveTab) {
  if (tab === 'workbench') return true;
  return tabsForUser(user).includes(tab);
}

function initialUser() {
  return loadAuthState()?.user ?? null;
}

function initialTab() {
  const user = initialUser();
  const hashTab = getPersistentHashTab();
  if (hashTab) return hashTab;
  const saved = localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
  if (isPersistentTab(saved)) return saved;
  return user ? defaultTabForUser(user) : 'sales';
}

function initialMountedTabs(): ActiveTab[] {
  const user = initialUser();
  const tab = initialTab();
  if (!user || user.mustChangePassword || !canAccessTab(user, tab)) return [];
  return [tab];
}

export default function App() {
  const [loggedInUser, setLoggedInUser] = useState<User | null>(initialUser);
  const [activeTab, setActiveTab]       = useState<ActiveTab>(initialTab);
  const [mountedTabs, setMountedTabs]   = useState<ActiveTab[]>(initialMountedTabs);
  const [badges, setBadges]             = useState<Partial<Record<BadgeTab, number>>>({});
  const [refreshKeys, setRefreshKeys]   = useState<RefreshKeys>(initialRefreshKeys);
  const [staleTabs, setStaleTabs]       = useState<Set<RefreshableTab>>(() => new Set());
  const [profileVersion, setProfileVersion] = useState(0);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordChanging, setPasswordChanging] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordForm] = Form.useForm<ChangePasswordValues>();
  const [notificationApi, notificationContextHolder] = notification.useNotification();
  const lastNotificationCountsRef = useRef<Record<string, number>>({});

  const notificationTargetToTab = (target: NotificationItem['target']): ActiveTab => target;

  const applyNotifications = (items: NotificationItem[], showToast: boolean) => {
    const nextBadges: Partial<Record<BadgeTab, number>> = {};
    for (const tab of ALL_TABS) nextBadges[tab.key] = 0;
    nextBadges['user-review'] = 0;
    for (const item of items) {
      nextBadges[item.target] = (nextBadges[item.target] || 0) + item.count;
    }
    setBadges(nextBadges);

    if (showToast) {
      const increased = items.find((item) => item.count > (lastNotificationCountsRef.current[item.id] ?? 0));
      if (increased) {
        notificationApi.open({
          message: increased.title,
          description: increased.content,
          type: increased.level === 'urgent' ? 'warning' : increased.level,
          duration: 4,
          onClick: () => {
            const target = notificationTargetToTab(increased.target);
            if (loggedInUser && canAccessTab(loggedInUser, target)) setActiveTab(target);
          },
        });
      }
    }

    lastNotificationCountsRef.current = Object.fromEntries(items.map((item) => [item.id, item.count]));
  };

  const fetchNotifications = async (showToast = false) => {
    if (loadAuthState()?.user.mustChangePassword) return;
    try {
      const data = await notificationsApi.list();
      applyNotifications(data.items, showToast);
    } catch {}
  };

  const bumpRefreshKey = (tab: RefreshableTab) => {
    setRefreshKeys((prev) => {
      const next = { ...prev };
      next[tab] += 1;
      return next;
    });
  };

  const markTabsStale = (tabs: readonly RefreshableTab[]) => {
    if (tabs.length === 0) return;
    setStaleTabs((prev) => {
      const next = new Set(prev);
      for (const tab of tabs) next.add(tab);
      return next;
    });
  };

  const handleDataChanged = (reason: DataChangeReason, source?: RefreshableTab) => {
    markTabsStale(tabsToRefreshFor(reason, source));
    if (!isSilentNotificationReason(reason)) fetchNotifications(false);
  };

  const refreshCurrentTab = () => {
    if (!loggedInUser) return;
    if (loggedInUser.mustChangePassword) return;
    if (isActiveTab(activeTab)) {
      bumpRefreshKey(activeTab as RefreshableTab);
      markTabsStale(ALL_REFRESHABLE_TABS.filter((tab) => tab !== activeTab));
    }
    fetchNotifications(false);
  };

  const handleLogin = (auth: AuthState) => {
    const user = auth.user;
    const defaultTab = defaultTabForUser(user);
    const nextTab = canAccessTab(user, defaultTab) ? defaultTab : tabsForUser(user)[0];
    clearApiCache();
    saveAuthState(auth);
    localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, nextTab);
    window.location.hash = `#/${nextTab}`;
    setLoggedInUser(user);
    setActiveTab(nextTab);
    setMountedTabs(user.mustChangePassword ? [] : [nextTab]);
    setRefreshKeys(initialRefreshKeys());
    setStaleTabs(new Set());
    if (user.mustChangePassword) setPasswordModalOpen(true);
    if (!user.mustChangePassword) fetchNotifications(false);
  };

  const resetToLogin = () => {
    clearApiCache();
    clearAuthState();
    window.location.hash = '';
    setLoggedInUser(null);
    setMountedTabs([]);
    setBadges({});
    setRefreshKeys(initialRefreshKeys());
    setStaleTabs(new Set());
    lastNotificationCountsRef.current = {};
    setPasswordModalOpen(false);
  };

  const openPasswordModal = () => {
    setPasswordError('');
    passwordForm.resetFields();
    setPasswordModalOpen(true);
  };

  const changePassword = async () => {
    const values = await passwordForm.validateFields();
    setPasswordChanging(true);
    setPasswordError('');
    try {
      const result = await usersApi.changePassword(values);
      clearApiCache();
      saveAuthState({ user: result.user, token: result.token });
      setLoggedInUser(result.user);
      setPasswordModalOpen(false);
      passwordForm.resetFields();
      message.success(result.message);
      fetchNotifications(false);
    } catch (error) {
      const response = (error as { response?: { data?: { error?: string } } })?.response;
      setPasswordError(response?.data?.error || '修改密码失败');
    } finally {
      setPasswordChanging(false);
    }
  };

  useEffect(() => {
    if (!loggedInUser) return;
    if (loggedInUser.mustChangePassword) return;
    fetchNotifications(false);
    const t = setInterval(() => fetchNotifications(true), 30000);
    return () => clearInterval(t);
  }, [loggedInUser?.id, loggedInUser?.mustChangePassword]);

  useEffect(() => {
    const handleExpired = () => {
      window.location.hash = '';
      setLoggedInUser(null);
      setMountedTabs([]);
      setBadges({});
      setRefreshKeys(initialRefreshKeys());
      setStaleTabs(new Set());
      lastNotificationCountsRef.current = {};
      setPasswordModalOpen(false);
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpired);
  }, []);

  useEffect(() => {
    const handleRequired = () => {
      setPasswordError('请先修改初始密码后再继续使用系统');
      setPasswordModalOpen(true);
    };
    window.addEventListener(PASSWORD_CHANGE_REQUIRED_EVENT, handleRequired);
    return () => window.removeEventListener(PASSWORD_CHANGE_REQUIRED_EVENT, handleRequired);
  }, []);

  useEffect(() => {
    if (loggedInUser?.mustChangePassword) setPasswordModalOpen(true);
  }, [loggedInUser?.mustChangePassword]);

  useEffect(() => {
    if (!loggedInUser || loggedInUser.mustChangePassword) {
      setMountedTabs([]);
      return;
    }
    if (!canAccessTab(loggedInUser, activeTab)) return;
    setMountedTabs((prev) => prev.includes(activeTab) ? prev : [...prev, activeTab]);
  }, [activeTab, loggedInUser?.id, loggedInUser?.mustChangePassword]);

  useEffect(() => {
    if (!loggedInUser || loggedInUser.mustChangePassword) return;
    if (!isActiveTab(activeTab)) return;
    if (!staleTabs.has(activeTab as RefreshableTab)) return;
    const tab = activeTab as RefreshableTab;
    bumpRefreshKey(tab);
    setStaleTabs((prev) => {
      const next = new Set(prev);
      next.delete(tab);
      return next;
    });
  }, [activeTab, loggedInUser?.id, loggedInUser?.mustChangePassword, staleTabs]);

  useEffect(() => {
    const handleHashChange = () => {
      const next = getPersistentHashTab();
      if (!next) return;
      if (loggedInUser && !canAccessTab(loggedInUser, next)) return;
      setActiveTab(next);
      localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, next);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [loggedInUser]);

  useEffect(() => {
    if (!loggedInUser) return;
    if (activeTab === 'workbench') return;
    const next = canAccessTab(loggedInUser, activeTab) ? activeTab : tabsForUser(loggedInUser)[0];
    if (next !== activeTab) {
      setActiveTab(next);
      return;
    }
    localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTab);
    if (window.location.hash !== `#/${activeTab}`) window.location.hash = `#/${activeTab}`;
  }, [activeTab, loggedInUser]);

  if (!loggedInUser) return <LoginPage onLogin={handleLogin} />;

  const loggedInRole = toAppRole(loggedInUser.role);
  const visibleRoleTabs = tabsForUser(loggedInUser).filter((tab): tab is Role => tab !== 'user-review');
  const visibleTabs = ALL_TABS.filter((t) => visibleRoleTabs.includes(t.key));
  const canReviewUsers = canManageUsers(loggedInUser);
  const salesReadOnly =
    loggedInUser.role === 'purchase'
    || ((canApproveOrder(loggedInUser) || canManageUsers(loggedInUser)) && !canCreateOrder(loggedInUser) && !loggedInUser.isAdmin);
  const currentProfile: HeaderProfile = {
    name: loggedInUser.name,
    team: loggedInUser.department,
    account: loggedInUser.phone,
    phone: loggedInUser.phone,
  };
  const contentStyle: CSSProperties = { maxWidth: 1360, margin: '0 auto', width: '100%', padding: '24px 14px' };

  const tabItems: { key: ActiveTab; label: ReactNode }[] = visibleTabs.map((t) => {
    const count = badges[t.key] ?? 0;
    return {
      key: t.key,
      label: (
        <Badge count={count} size="small" offset={[8, -6]}>
          <Space size={7} className="app-nav-tab-label">
            <span className="app-nav-tab-icon">{t.icon}</span>
            <span>{t.label}</span>
          </Space>
        </Badge>
      ),
    };
  });
  if (canReviewUsers) {
    const count = badges['user-review'] ?? 0;
    tabItems.push({
      key: 'user-review',
      label: (
        <Badge count={count} size="small" offset={[8, -6]}>
          <Space size={7} className="app-nav-tab-label">
            <span className="app-nav-tab-icon"><TeamOutlined /></span>
            <span>用户管理</span>
          </Space>
        </Badge>
      ),
    });
  }

  return (
    <Layout style={{ minHeight: '100vh', background: 'rgb(247, 247, 247)' }}>
      <Header className="app-top-nav">
        {/* Brand */}
        <div className="app-brand" aria-label="YMT DIESEL">
          <span className="app-brand-red">YMT</span>
          <span className="app-brand-dark">DIESEL</span>
        </div>

        <div className="app-nav-divider" />

        {/* Tabs */}
        <div className="app-nav-tabs">
          <Tabs
            activeKey={activeTab === 'workbench' ? '' : activeTab}
            onChange={(key) => setActiveTab(key as ActiveTab)}
            items={tabItems}
            size="small"
            className="app-main-tabs"
            style={{ marginBottom: 0 }}
            tabBarStyle={{ marginBottom: 0, border: 'none' }}
          />
        </div>

        {/* Right: profile + actions */}
        <Space size={10} className="app-nav-actions">
          <Tooltip title="刷新数据">
            <Button
              type="text"
              icon={<ReloadOutlined />}
              onClick={refreshCurrentTab}
              disabled={loggedInUser.mustChangePassword}
              size="small"
              className="app-refresh-button"
            />
          </Tooltip>
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'workbench', label: '我的工作台' },
                { key: 'changelog', label: '更新日志' },
                { key: 'change-password', label: '修改密码' },
                { key: 'logout', label: '退出登录', danger: true },
              ],
              onClick: ({ key }) => {
                if (key === 'logout') {
                  resetToLogin();
                  return;
                }
                if (key === 'change-password') {
                  openPasswordModal();
                  return;
                }
                if (key === 'changelog') {
                  setChangelogOpen(true);
                  return;
                }
                setActiveTab('workbench');
              },
            }}
          >
            <Space size={10} className="app-profile-trigger">
              <div style={{
                width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg, #c8251c, #e57373)',
                color: '#fff', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 13, fontWeight: 600,
              }}>
                {currentProfile.name.slice(0, 1)}
              </div>
              <div style={{ lineHeight: 1.15 }}>
                <Text strong className="app-profile-name">{currentProfile.name}</Text>
                <div className="app-profile-role">{displayRole(loggedInUser) || ACCOUNT_ROLE_LABEL[loggedInUser.role]}</div>
              </div>
            </Space>
          </Dropdown>
        </Space>
      </Header>

      <Content style={contentStyle}>
        <FeatureBanner />
        {loggedInUser.mustChangePassword ? (
          <Alert
            type="warning"
            showIcon
            message="请先修改密码"
            description="当前账号密码不符合现行规则，或仍在使用初始/重置密码，修改完成后即可进入业务页面。"
          />
        ) : (
          <ChunkErrorBoundary onResetAuth={resetToLogin}>
            <Suspense fallback={<Skeleton active paragraph={{ rows: 8 }} />}>
              {mountedTabs.includes('workbench') && (
                <div style={{ display: activeTab === 'workbench' ? 'block' : 'none' }}>
                  <Workbench refreshKey={refreshKeys.workbench} role={loggedInRole} user={loggedInUser} onNavigate={(target) => setActiveTab(target)} onProfileChange={() => setProfileVersion((v) => v + 1)} />
                </div>
              )}
              {mountedTabs.includes('dashboard') && (
                <div style={{ display: activeTab === 'dashboard' ? 'block' : 'none' }}>
                  <Dashboard refreshKey={refreshKeys.dashboard} />
                </div>
              )}
              {mountedTabs.includes('sales') && (
                <div style={{ display: activeTab === 'sales' ? 'block' : 'none' }}>
                  <SalesView refreshKey={refreshKeys.sales} onDataChanged={handleDataChanged} readOnly={salesReadOnly} role={loggedInUser.isAdmin ? 'admin' : loggedInRole} user={loggedInUser} />
                </div>
              )}
              {mountedTabs.includes('gm') && (
                <div style={{ display: activeTab === 'gm' ? 'block' : 'none' }}>
                  <GMView refreshKey={refreshKeys.gm} onDataChanged={handleDataChanged} />
                </div>
              )}
              {mountedTabs.includes('procurement') && (
                <div style={{ display: activeTab === 'procurement' ? 'block' : 'none' }}>
                  <ProcurementView refreshKey={refreshKeys.procurement} onDataChanged={handleDataChanged} />
                </div>
              )}
              {mountedTabs.includes('production') && (
                <div style={{ display: activeTab === 'production' ? 'block' : 'none' }}>
                  <ProductionView refreshKey={refreshKeys.production} onDataChanged={handleDataChanged} />
                </div>
              )}
              {mountedTabs.includes('logistics') && (
                <div style={{ display: activeTab === 'logistics' ? 'block' : 'none' }}>
                  <LogisticsView refreshKey={refreshKeys.logistics} onDataChanged={handleDataChanged} />
                </div>
              )}
              {mountedTabs.includes('user-review') && canReviewUsers && (
                <div style={{ display: activeTab === 'user-review' ? 'block' : 'none' }}>
                  <UserReviewPage refreshKey={refreshKeys['user-review']} currentUser={loggedInUser} onDataChanged={handleDataChanged} />
                </div>
              )}
            </Suspense>
          </ChunkErrorBoundary>
        )}
      </Content>
      {notificationContextHolder}

      <Modal
        open={passwordModalOpen}
        title={loggedInUser.mustChangePassword ? '请先修改密码' : '修改密码'}
        okText="保存新密码"
        cancelText="取消"
        confirmLoading={passwordChanging}
        maskClosable={!loggedInUser.mustChangePassword}
        closable={!loggedInUser.mustChangePassword}
        cancelButtonProps={{ disabled: loggedInUser.mustChangePassword }}
        onCancel={() => {
          if (loggedInUser.mustChangePassword) return;
          setPasswordModalOpen(false);
          setPasswordError('');
          passwordForm.resetFields();
        }}
        onOk={changePassword}
        destroyOnClose={false}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {loggedInUser.mustChangePassword && (
            <Alert
              type="warning"
              showIcon
              message="当前账号密码不符合现行规则，或仍在使用初始/重置密码，必须修改后才能继续使用业务功能。"
            />
          )}
          {passwordError && <Alert type="error" showIcon message={passwordError} />}
          <Form form={passwordForm} layout="vertical" requiredMark={false}>
            <Form.Item name="oldPassword" label="旧密码" rules={[{ required: true, message: '请输入旧密码' }]}>
              <Input.Password autoComplete="current-password" />
            </Form.Item>
            <Form.Item
              name="newPassword"
              label="新密码"
              rules={[
                { required: true, message: '请输入新密码' },
                {
                  validator(_, value) {
                    if (!value || value.length >= 8) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error('新密码不少于 8 位'));
                  },
                },
              ]}
            >
              <Input.Password autoComplete="new-password" placeholder="不少于 8 位" />
            </Form.Item>
            <Form.Item
              name="confirmPassword"
              label="确认新密码"
              dependencies={['newPassword']}
              rules={[
                { required: true, message: '请再次输入新密码' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                    return Promise.reject(new Error('两次输入的新密码不一致'));
                  },
                }),
              ]}
            >
              <Input.Password autoComplete="new-password" />
            </Form.Item>
          </Form>
        </Space>
      </Modal>

      <Drawer
        className="changelog-drawer"
        title="更新日志"
        placement="right"
        width={460}
        open={changelogOpen}
        onClose={() => setChangelogOpen(false)}
        extra={
          <Button
            size="small"
            onClick={() => {
              resetDismissedFeatures();
              message.success('已重置：所有更新提示横条会重新出现');
            }}
          >
            重新显示所有提示
          </Button>
        }
      >
        {FEATURE_CARDS.length === 0 ? (
          <Text type="secondary">暂无更新记录</Text>
        ) : (
          FEATURE_CARDS.map((card) => (
            <div key={card.id} className="changelog-entry">
              <div className="changelog-entry-head">
                <span className="changelog-version">{card.version}</span>
                <span className="changelog-date">{card.publishedAt}</span>
              </div>
              <div className="changelog-title">{card.title}</div>
              <div className="changelog-desc">{card.description}</div>
            </div>
          ))
        )}
      </Drawer>
    </Layout>
  );
}
