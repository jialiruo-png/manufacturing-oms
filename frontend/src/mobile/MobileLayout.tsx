import { forwardRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import type { User } from '../types';
import MTopBar from './components/MTopBar';
import MBottomNav from './components/MBottomNav';
import type { MobileModule } from './router';

interface MobileLayoutProps {
  title?: ReactNode;
  brand?: boolean;
  showBack?: boolean;
  onBack?: () => void;
  topRight?: ReactNode;
  tallTop?: boolean;
  user?: User | null;
  activeModule?: MobileModule;
  showTabBar?: boolean;
  badges?: Partial<Record<MobileModule, number>>;
  children?: ReactNode;
  scrollRef?: RefObject<HTMLDivElement | null>;
}

const MobileLayout = forwardRef<HTMLDivElement, MobileLayoutProps>(function MobileLayout(
  {
    title,
    brand,
    showBack,
    onBack,
    topRight,
    tallTop,
    user,
    activeModule,
    showTabBar = true,
    badges,
    children,
    scrollRef,
  },
  fwdRef
) {
  const showNav = showTabBar && user && activeModule;
  return (
    <div className="m-layout">
      <MTopBar
        title={title}
        brand={brand}
        showBack={showBack}
        onBack={onBack}
        right={topRight}
        tall={tallTop}
      />
      <div
        ref={(node) => {
          if (typeof fwdRef === 'function') fwdRef(node);
          else if (fwdRef) (fwdRef as { current: HTMLDivElement | null }).current = node;
          if (scrollRef) (scrollRef as { current: HTMLDivElement | null }).current = node;
        }}
        className={`m-layout-scroll${showNav ? '' : ' no-dock'}`}
      >
        {children}
      </div>
      {showNav && (
        <MBottomNav user={user!} active={activeModule!} badges={badges} />
      )}
    </div>
  );
});

export default MobileLayout;
