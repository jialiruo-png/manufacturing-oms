import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as XLSX from 'xlsx';
import { parseOrderSheet } from './excelOrderParser';

function sheetFromRows(rows: unknown[][]) {
  return XLSX.utils.aoa_to_sheet(rows);
}

test('parses production plan rows and keeps split diesel pump items separate', () => {
  const sheet = sheetFromRows([
    ['生产计划单'],
    ['客户名称：Asaman', '下单日期：2026年5月10日', '交期要求：2026年5月17日'],
    ['序号', '产品名称', '详细要求', '数量', '单价', '金额'],
    ['1', '柴油水泵', '产品型号：3寸小油箱清水泵；动力型号：178F 螺纹轴 手启动；泵体规格：3寸铝壳泵；颜色要求：蓝色油箱导风罩；品牌要求：Asaman品牌油箱转印贴花，中性英文纸箱包装', '10', '1170', '11700'],
    ['2', '柴油水泵', '产品型号：4寸小油箱清水泵；动力型号：186F 螺纹轴 手启动；泵体规格：4寸铝壳泵；颜色要求：蓝色油箱导风罩；品牌要求：Asaman品牌油箱转印贴花，中性英文纸箱包装', '10', '1360', '13600'],
  ]);

  const parsed = parseOrderSheet(sheet, { filename: 'Asaman生产计划.xlsx' });

  assert.equal(parsed.contractInfo.customerName, 'Asaman');
  assert.equal(parsed.contractInfo.orderDate, '2026-05-10');
  assert.equal(parsed.contractInfo.deliveryDate, '2026-05-17');
  assert.equal(parsed.diagnostics.canImport, true);
  assert.equal(parsed.items.length, 2);
  assert.deepEqual(parsed.items.map((item) => item.sourceRowNo), ['1', '2']);
  assert.deepEqual(parsed.items.map((item) => item.productName), ['柴油水泵', '柴油水泵']);
  assert.deepEqual(parsed.items.map((item) => item.quantity), [10, 10]);
  assert.deepEqual(parsed.items.map((item) => item.subtotal), [11700, 13600]);
  assert.match(parsed.items[0].detailRequirement, /178F/);
  assert.match(parsed.items[1].detailRequirement, /186F/);
});

test('parses contract table row ids as source row numbers, not product names', () => {
  const sheet = sheetFromRows([
    ['柴油发电机组订单合同20260320'],
    ['需方：示例外贸客户A 客户联系人A', '供方：YMT'],
    ['交货时间：2026-03-30'],
    ['No.', 'Description of Goods', 'T.T QTY', 'Unit Price', 'Total Amount', 'CTNS', 'QTY/CTN', 'CTN/CBM', 'T.T CBM', 'CTN/KG', 'T.T KG'],
    ['', '', 'PCS', 'RMB', 'RMB', 'CTNS', 'PCS', 'CBM', 'CBM', 'KG', 'KG'],
    ['ATC-1', '单相柴油静音发电机组5KW/黄色具体款式如图/外箱中性英文纸箱', '10', '2850', '28500', '10', '1', '0.400', '4.000', '175', '1750'],
  ]);

  const parsed = parseOrderSheet(sheet, { filename: '示例订单合同20260320.xlsx' });

  assert.equal(parsed.contractInfo.customerName, '示例外贸客户A 客户联系人A');
  assert.equal(parsed.contractInfo.orderDate, '2026-03-20');
  assert.equal(parsed.contractInfo.deliveryDate, '2026-03-30');
  assert.equal(parsed.items[0].sourceRowNo, 'ATC-1');
  assert.equal(parsed.items[0].productName, '单相柴油静音发电机组5KW');
  assert.equal(parsed.items[0].ctnCount, 10);
  assert.equal(parsed.items[0].qtyPerCtn, 1);
  assert.equal(parsed.items[0].ctnVolume, 0.4);
  assert.equal(parsed.items[0].totalVolume, 4);
  assert.equal(parsed.items[0].ctnWeight, 175);
  assert.equal(parsed.items[0].totalWeight, 1750);
});

test('does not treat delivery date as order date when no explicit order-date label exists', () => {
  const sheet = sheetFromRows([
    ['普通合同'],
    ['客户名称：测试客户', '交货日期：2026年6月8日'],
    ['序号', '产品名称', '数量', '单价', '金额'],
    ['1', '柴油水泵', '2', '100', '200'],
  ]);

  const parsed = parseOrderSheet(sheet, { filename: '测试合同.xlsx' });

  assert.equal(parsed.contractInfo.deliveryDate, '2026-06-08');
  assert.equal(parsed.contractInfo.orderDate, '');
});

test('parses complete English dates but rejects bare years', () => {
  assert.equal(parseOrderSheet(sheetFromRows([
    ['Contract'],
    ['Customer: Demo Customer', 'Delivery Date: May 10, 2026'],
    ['No.', 'Description of Goods', 'T.T QTY', 'Unit Price', 'Total Amount'],
    ['1', 'Diesel generator', '1', '100', '100'],
  ])).contractInfo.deliveryDate, '2026-05-10');

  assert.equal(parseOrderSheet(sheetFromRows([
    ['Contract'],
    ['Customer: Demo Customer', 'Delivery Date: 2026'],
    ['No.', 'Description of Goods', 'T.T QTY', 'Unit Price', 'Total Amount'],
    ['1', 'Diesel generator', '1', '100', '100'],
  ])).contractInfo.deliveryDate, '');
});

test('expands merged product cells and parses all quantity rows', () => {
  const sheet = sheetFromRows([
    ['生产计划单'],
    ['客户名称：测试客户', '交期要求：2026年6月18日'],
    ['序号', '产品名称', '详细要求', '数量', '单价', '金额'],
    ['1', '柴油水泵', '产品型号：3寸清水泵；动力型号：178F', '10', '1170', '11700'],
    ['2', '', '产品型号：4寸清水泵；动力型号：186F', '20', '1360', '27200'],
  ]);
  sheet['!merges'] = [{ s: { r: 3, c: 1 }, e: { r: 4, c: 1 } }];

  const parsed = parseOrderSheet(sheet, { filename: '测试客户生产计划.xlsx' });

  assert.equal(parsed.items.length, 2);
  assert.deepEqual(parsed.items.map((item) => item.quantity), [10, 20]);
  assert.match(parsed.items[0].detailRequirement, /178F/);
  assert.match(parsed.items[1].detailRequirement, /186F/);
});

test('parses continuation rows when product name is omitted but detail and quantity exist', () => {
  const sheet = sheetFromRows([
    ['生产计划单'],
    ['客户名称：测试客户', '交期要求：2026年6月18日'],
    ['序号', '产品名称', '详细要求', '数量', '单价', '金额'],
    ['1', '柴油水泵', '产品型号：3寸清水泵；动力型号：178F', '10', '1170', '11700'],
    ['2', '', '产品型号：4寸清水泵；动力型号：186F', '20', '1360', '27200'],
  ]);

  const parsed = parseOrderSheet(sheet, { filename: '测试客户生产计划.xlsx' });

  assert.equal(parsed.items.length, 2);
  assert.deepEqual(parsed.items.map((item) => item.productName), ['柴油水泵', '柴油水泵']);
  assert.deepEqual(parsed.items.map((item) => item.quantity), [10, 20]);
});

