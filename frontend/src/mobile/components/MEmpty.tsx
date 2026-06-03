import type { ReactNode } from 'react';
import { InboxOutlined } from '@ant-design/icons';

export default function MEmpty({ text, icon }: { text?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="m-empty">
      <div className="m-empty-icon">{icon ?? <InboxOutlined />}</div>
      <div>{text ?? '暂无数据'}</div>
    </div>
  );
}
