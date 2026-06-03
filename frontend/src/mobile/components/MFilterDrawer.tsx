import { Drawer } from 'antd';
import type { ReactNode } from 'react';

interface MFilterDrawerProps {
  open: boolean;
  title?: string;
  onClose: () => void;
  onReset?: () => void;
  onConfirm?: () => void;
  children: ReactNode;
}

export default function MFilterDrawer({ open, title = '筛选', onClose, onReset, onConfirm, children }: MFilterDrawerProps) {
  return (
    <Drawer
      title={title}
      placement="bottom"
      open={open}
      onClose={onClose}
      height="auto"
      destroyOnClose={false}
      styles={{ body: { padding: 16, paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' } }}
    >
      <div style={{ marginBottom: 16 }}>{children}</div>
      <div style={{ display: 'flex', gap: 10 }}>
        {onReset && (
          <button type="button" className="m-btn" onClick={onReset} style={{ flex: 1 }}>重置</button>
        )}
        <button type="button" className="m-btn m-btn-primary" onClick={() => { onConfirm?.(); onClose(); }} style={{ flex: 1 }}>确定</button>
      </div>
    </Drawer>
  );
}
