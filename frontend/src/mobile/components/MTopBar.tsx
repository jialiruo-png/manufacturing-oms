import type { ReactNode } from 'react';
import { LeftOutlined } from '@ant-design/icons';
import { back } from '../router';

interface MTopBarProps {
  title?: ReactNode;
  showBack?: boolean;
  onBack?: () => void;
  right?: ReactNode;
  brand?: boolean;
  tall?: boolean;
}

export default function MTopBar({ title, showBack, onBack, right, brand, tall }: MTopBarProps) {
  const handleBack = () => {
    if (onBack) onBack();
    else back();
  };
  return (
    <header className="m-topbar">
      <div className={`m-topbar-inner${tall ? ' tall' : ''}`}>
        <div className="m-topbar-left">
          {showBack && (
            <button type="button" className="m-topbar-back" onClick={handleBack} aria-label="返回">
              <LeftOutlined />
            </button>
          )}
        </div>
        {brand ? (
          <div className="m-topbar-brand">
            <span className="m-topbar-brand-red">YMT</span>
            <span className="m-topbar-brand-dark"> DIESEL</span>
          </div>
        ) : (
          <div className="m-topbar-title">{title}</div>
        )}
        <div className="m-topbar-right">{right}</div>
      </div>
    </header>
  );
}
