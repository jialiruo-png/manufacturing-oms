import { lazy, Suspense, useEffect, useState } from 'react';
import { App as AntApp, ConfigProvider, message } from 'antd';
import {
  AUTH_EXPIRED_EVENT,
  PASSWORD_CHANGE_REQUIRED_EVENT,
  clearAuthState,
  loadAuthState,
  saveAuthState,
  type AuthState,
} from '../authStorage';
import { clearApiCache } from '../api';
import type { User } from '../types';
import {
  canAccessModule,
  clearPersistedRoute,
  defaultModuleForUser,
  getCurrentRoute,
  parseHash,
  persistRoute,
  push,
  readPersistedRoute,
  replace,
  type MobileRoute,
} from './router';
import MLoading from './components/MLoading';
import './styles/mobile.css';

const MLogin = lazy(() => import('./pages/MLogin'));
const MWorkbench = lazy(() => import('./pages/MWorkbench'));
const MProfile = lazy(() => import('./pages/MProfile'));
const MSalesList = lazy(() => import('./pages/MSalesList'));
const MSalesDetail = lazy(() => import('./pages/MSalesDetail'));
const MSalesForm = lazy(() => import('./pages/MSalesForm'));
const MCustomerList = lazy(() => import('./pages/MCustomerList'));
const MCustomerDetail = lazy(() => import('./pages/MCustomerDetail'));
const MProcurementList = lazy(() => import('./pages/MProcurementList'));
const MProcurementDetail = lazy(() => import('./pages/MProcurementDetail'));
const MInventory = lazy(() => import('./pages/MInventory'));
const MProductionList = lazy(() => import('./pages/MProductionList'));
const MProductionDetail = lazy(() => import('./pages/MProductionDetail'));
const MLogisticsList = lazy(() => import('./pages/MLogisticsList'));
const MLogisticsDetail = lazy(() => import('./pages/MLogisticsDetail'));
const MDashboard = lazy(() => import('./pages/MDashboard'));
const MGMList = lazy(() => import('./pages/MGMList'));
const MGMApprovalDetail = lazy(() => import('./pages/MGMApprovalDetail'));
const MUserReview = lazy(() => import('./pages/MUserReview'));

function loaderFallback() {
  return (
    <div className="m-layout">
      <div className="m-layout-scroll no-dock"><MLoading /></div>
    </div>
  );
}

export default function AppMobile() {
  const [user, setUser] = useState<User | null>(() => loadAuthState()?.user ?? null);
  const [route, setRoute] = useState<MobileRoute>(() => {
    const fromHash = getCurrentRoute();
    if (fromHash.module !== 'login') return fromHash;
    const persisted = readPersistedRoute();
    return persisted ?? fromHash;
  });

  useEffect(() => {
    const onRouteChange = () => {
      const next = parseHash(window.location.hash) ?? getCurrentRoute();
      setRoute(next);
    };
    window.addEventListener('hashchange', onRouteChange);
    window.addEventListener('popstate', onRouteChange);
    return () => {
      window.removeEventListener('hashchange', onRouteChange);
      window.removeEventListener('popstate', onRouteChange);
    };
  }, []);

  // 移动端 mount 时给 html/body 加 .m-mobile，让 mobile.css 接管高度与滚动
  // 关键修复：微信 X5 / 部分老 WebView 不支持 100dvh，且 body 默认 auto 高度
  // 会导致 .m-layout 内部 flex:1 + overflow-y:auto 没滚动空间
  useEffect(() => {
    document.documentElement.classList.add('m-mobile');
    document.body.classList.add('m-mobile');
    return () => {
      document.documentElement.classList.remove('m-mobile');
      document.body.classList.remove('m-mobile');
    };
  }, []);

  useEffect(() => {
    const applyViewportHeight = () => {
      const height = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty('--m-viewport-h', `${height}px`);
    };
    applyViewportHeight();
    window.visualViewport?.addEventListener('resize', applyViewportHeight);
    window.addEventListener('resize', applyViewportHeight);
    window.addEventListener('orientationchange', applyViewportHeight);
    return () => {
      window.visualViewport?.removeEventListener('resize', applyViewportHeight);
      window.removeEventListener('resize', applyViewportHeight);
      window.removeEventListener('orientationchange', applyViewportHeight);
      document.documentElement.style.removeProperty('--m-viewport-h');
    };
  }, []);

  // 首屏：根据 user + hash 决定起始路由
  useEffect(() => {
    const hash = window.location.hash;
    const current = parseHash(hash);
    if (!user) {
      if (!current || current.module !== 'login') replace('login');
      return;
    }
    if (!current || current.module === 'login') {
      const persisted = readPersistedRoute();
      if (persisted && canAccessModule(user, persisted.module)) {
        replace(persisted.module, { action: persisted.action, id: persisted.id });
      } else {
        replace(defaultModuleForUser(user));
      }
    } else if (!canAccessModule(user, current.module)) {
      replace(defaultModuleForUser(user));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (route.module !== 'login') persistRoute(route);
  }, [route]);

  useEffect(() => {
    const handleExpired = () => {
      message.warning('登录状态已过期，请重新登录');
      clearAuthState();
      clearPersistedRoute();
      setUser(null);
      replace('login');
    };
    const handlePasswordRequired = () => {
      message.warning('需要先修改初始密码');
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpired);
    window.addEventListener(PASSWORD_CHANGE_REQUIRED_EVENT, handlePasswordRequired);
    return () => {
      window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpired);
      window.removeEventListener(PASSWORD_CHANGE_REQUIRED_EVENT, handlePasswordRequired);
    };
  }, []);

  const handleLogin = (auth: AuthState) => {
    clearApiCache();
    saveAuthState(auth);
    setUser(auth.user);
    const target = defaultModuleForUser(auth.user);
    push(target);
  };

  const handleLogout = () => {
    clearApiCache();
    clearAuthState();
    clearPersistedRoute();
    setUser(null);
    replace('login');
  };

  const handleUserChange = (next: User) => {
    const auth = loadAuthState();
    if (auth) saveAuthState({ ...auth, user: next });
    setUser(next);
  };

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#2f66ff',
          borderRadius: 8,
          fontSize: 14,
        },
      }}
    >
      <AntApp>
        <div className="m-app">
          <Suspense fallback={loaderFallback()}>{renderRoute(route, user, handleLogin, handleLogout, handleUserChange)}</Suspense>
        </div>
      </AntApp>
    </ConfigProvider>
  );
}

function renderRoute(
  route: MobileRoute,
  user: User | null,
  onLogin: (auth: AuthState) => void,
  onLogout: () => void,
  onUserChange: (user: User) => void
) {
  if (!user || route.module === 'login') {
    return <MLogin onLogin={onLogin} />;
  }
  const common = { user, onUserChange };
  switch (route.module) {
    case 'workbench':
      return <MWorkbench {...common} />;
    case 'dashboard':
      return <MDashboard user={user} />;
    case 'sales':
      if (route.action === 'new') return <MSalesForm mode="new" user={user} />;
      if (route.action === 'edit' && route.id) return <MSalesForm mode="edit" orderId={route.id} user={user} />;
      if (route.id) return <MSalesDetail orderId={route.id} user={user} />;
      return <MSalesList user={user} />;
    case 'customers':
      if (route.action === 'new') return <MCustomerDetail mode="new" user={user} />;
      if (route.id) return <MCustomerDetail mode="view" customerId={route.id} user={user} />;
      return <MCustomerList user={user} />;
    case 'procurement':
      if (route.id) return <MProcurementDetail orderId={route.id} user={user} />;
      return <MProcurementList user={user} />;
    case 'inventory':
      return <MInventory user={user} />;
    case 'production':
      if (route.id) return <MProductionDetail orderId={route.id} user={user} />;
      return <MProductionList user={user} />;
    case 'logistics':
      if (route.id) return <MLogisticsDetail orderId={route.id} user={user} />;
      return <MLogisticsList user={user} />;
    case 'gm':
      if (route.id) return <MGMApprovalDetail orderId={route.id} user={user} />;
      return <MGMList user={user} />;
    case 'user-review':
      return <MUserReview currentUser={user} />;
    case 'profile':
      return <MProfile user={user} onLogout={onLogout} onUserChange={onUserChange} />;
    default:
      return null;
  }
}
