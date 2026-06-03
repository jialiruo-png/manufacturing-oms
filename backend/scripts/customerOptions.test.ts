import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCustomerOrderOptions } from '../../frontend/src/utils/customerOptions';

test('customer order options use customer id as the unique value', () => {
  const options = buildCustomerOrderOptions([
    { id: 1, name: '同名客户', contact: '张三', phone: '13800000001' },
    { id: 2, name: '同名客户', contact: '李四', phone: '13800000002' },
  ]);

  assert.deepEqual(options.map((option) => option.value), [
    '同名客户 · 张三 · 13800000001',
    '同名客户 · 李四 · 13800000002',
  ]);
  assert.equal(options[1].customerId, 2);
});
