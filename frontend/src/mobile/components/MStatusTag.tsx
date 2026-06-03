import { getOrderStatusLabel } from '../../utils/order';

export default function MStatusTag({ status }: { status: string }) {
  return <span className={`m-status ${status}`}>{getOrderStatusLabel(status)}</span>;
}
