import React, { lazy, Suspense, useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import App from './App';
import { MOBILE_BREAKPOINT, isMobileViewport } from './hooks/useIsMobile';
import './index.css';

const AppMobile = lazy(() => import('./mobile/AppMobile'));

dayjs.locale('zh-cn');

function Root() {
  const [mobile, setMobile] = useState<boolean>(isMobileViewport);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const handler = (event: MediaQueryListEvent) => {
      if (event.matches !== mobile) window.location.reload();
    };
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handler);
      return () => mql.removeEventListener('change', handler);
    }
    mql.addListener(handler);
    return () => mql.removeListener(handler);
  }, [mobile]);

  if (mobile) {
    return (
      <Suspense fallback={null}>
        <AppMobile />
      </Suspense>
    );
  }
  return <App />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#2563eb',
          borderRadius: 8,
          // AntD 5 控件字体栈：与 body --ymt-font-sans 对齐。
          // 通过 var() 引用 :root 变量，保证 Win 上 AntD 也用 NotoSansSC + Inter。
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif, "Apple Color Emoji", "Segoe UI Emoji"',
        },
      }}
    >
      <Root />
    </ConfigProvider>
  </React.StrictMode>,
);
