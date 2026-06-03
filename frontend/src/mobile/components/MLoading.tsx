import { LoadingOutlined } from '@ant-design/icons';

export default function MLoading({ text }: { text?: string }) {
  return (
    <div className="m-loading">
      <LoadingOutlined spin />
      <span>{text ?? '加载中…'}</span>
    </div>
  );
}
