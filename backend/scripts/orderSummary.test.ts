import assert from 'node:assert/strict';
import { toOrderListSummary } from '../src/lib/orderSummary';

const fullOrder = {
  id: 1,
  customerId: 10,
  productId: null,
  quantity: 12,
  unitPrice: 3000,
  totalAmount: 50000,
  totalQuantity: 12,
  itemCount: 4,
  urgent: true,
  deliveryDate: new Date('2026-05-20T00:00:00.000Z'),
  status: 'procurement',
  progressPct: 0,
  prevStatus: '',
  notes: '客户要求加急',
  contractNo: 'HT202605090001',
  contractRef: '',
  createdBy: '张三',
  purchaserName: '李四',
  createdAt: new Date('2026-05-09T08:00:00.000Z'),
  updatedAt: new Date('2026-05-09T09:00:00.000Z'),
  customer: {
    id: 10,
    name: '测试客户',
    contact: '王总',
    salespersonId: 3,
    salespersonName: '张三',
  },
  product: null,
  materials: [
    { id: 1, orderId: 1, name: '电机', spec: '2kW', unit: '台', required: 2, status: 'ready', urgent: false, expectedDate: null, notes: '', updatedAt: new Date() },
    { id: 2, orderId: 1, name: '油箱', spec: '20L', unit: '个', required: 2, status: 'pending', urgent: true, expectedDate: null, notes: '催供应商', updatedAt: new Date() },
    { id: 3, orderId: 1, name: '线束', spec: '', unit: '套', required: 2, status: 'in_progress', urgent: false, expectedDate: null, notes: '', updatedAt: new Date() },
  ],
  approvalLog: [
    { id: 1, orderId: 1, action: 'contract_generated', fromStage: 'draft', toStage: 'draft', operator: '系统', reason: '生成合同', createdAt: new Date('2026-05-09T08:00:00.000Z') },
    { id: 2, orderId: 1, action: 'submit', fromStage: 'draft', toStage: 'pending_approval', operator: '张三', reason: '', createdAt: new Date('2026-05-09T08:30:00.000Z') },
    { id: 3, orderId: 1, action: 'approve', fromStage: 'pending_approval', toStage: 'procurement', operator: '经理层', reason: '', createdAt: new Date('2026-05-09T09:00:00.000Z') },
  ],
  orderItems: [
    { id: 1, orderId: 1, productName: '2kW家用发电机', spec: '2kW', customerBrand: '', quantity: 3, unitPrice: 3000, subtotal: 9000, remark: '', createdAt: new Date(), updatedAt: new Date() },
    { id: 2, orderId: 1, productName: '5kW柴油发电机', spec: '5kW', customerBrand: '', quantity: 3, unitPrice: 4000, subtotal: 12000, remark: '', createdAt: new Date(), updatedAt: new Date() },
    { id: 3, orderId: 1, productName: '8kW静音发电机', spec: '8kW', customerBrand: '', quantity: 3, unitPrice: 5000, subtotal: 15000, remark: '', createdAt: new Date(), updatedAt: new Date() },
    { id: 4, orderId: 1, productName: '10kW工程发电机', spec: '10kW', customerBrand: '', quantity: 3, unitPrice: 4666.67, subtotal: 14000, remark: '', createdAt: new Date(), updatedAt: new Date() },
  ],
};

const summary = toOrderListSummary(fullOrder);

assert.equal(summary.materials.length, 0, 'list summaries should not include full material rows');
assert.deepEqual(summary.materialSummary, {
  total: 3,
  ready: 1,
  unready: 2,
  urgentUnready: 1,
});
assert.equal(summary.approvalLog.length, 1, 'list summaries should include only latest approval log');
assert.equal(summary.approvalLog[0]?.action, 'approve');
assert.equal(summary.orderItems.length, 3, 'list summaries should cap order item previews');
assert.equal(summary.itemCount, 4);
assert.equal(summary.product.name, '2kW家用发电机');

console.log('order summary tests passed');
