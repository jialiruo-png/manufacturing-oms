import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AddressInfo } from 'node:net';
import * as XLSX from 'xlsx';
import { signToken } from '../lib/jwt';
import { parseBestOrderSheet } from './excel';
import app from '../app';
import { prisma } from '../prisma';

type MultipartField = {
  name: string;
  value: string | Buffer;
  filename?: string;
  contentType?: string;
};

function sheetFromRows(rows: unknown[][]) {
  return XLSX.utils.aoa_to_sheet(rows);
}

function workbookBuffer(rows: unknown[][]) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheetFromRows(rows), '订单明细');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

function multipartBody(fields: MultipartField[]) {
  const boundary = `----oms-test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const chunks: Buffer[] = [];
  for (const field of fields) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    const filenamePart = field.filename ? `; filename="${field.filename}"` : '';
    chunks.push(Buffer.from(`Content-Disposition: form-data; name="${field.name}"${filenamePart}\r\n`));
    if (field.contentType) chunks.push(Buffer.from(`Content-Type: ${field.contentType}\r\n`));
    chunks.push(Buffer.from('\r\n'));
    chunks.push(Buffer.isBuffer(field.value) ? field.value : Buffer.from(field.value));
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

async function postMultipart(baseUrl: string, path: string, fields: MultipartField[]) {
  const { body, contentType } = multipartBody(fields);
  process.env.JWT_SECRET = 'test-jwt-secret-for-excel-route-tests-1234567890';
  const token = signToken({ userId: 1, role: 'sales', isAdmin: true, name: '测试管理员', tokenVersion: 0 });
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': contentType,
      'content-length': String(body.length),
    },
    body,
  });
}

function orderRows(customerName: string, productName: string) {
  return [
    ['生产计划单'],
    [`客户名称：${customerName}`, '交期要求：2026年6月18日'],
    ['序号', '产品名称', '详细要求', '数量', '单价', '金额'],
    ['1', productName, '动力型号：178F', '10', '1170', '11700'],
  ];
}

test('parseBestOrderSheet chooses the sheet with actual order items', () => {
  const parsed = {
    workbook: {} as XLSX.WorkBook,
    sheets: [
      {
        sheetName: '说明',
        sheet: sheetFromRows([
          ['这是客户说明页'],
          ['请以订单明细页为准'],
        ]),
      },
      {
        sheetName: '订单明细',
        sheet: sheetFromRows([
          ['生产计划单'],
          ['客户名称：测试客户', '交期要求：2026年6月18日'],
          ['序号', '产品名称', '详细要求', '数量', '单价', '金额'],
          ['1', '柴油水泵', '动力型号：178F', '10', '1170', '11700'],
          ['2', '柴油发电机', '动力型号：186F', '5', '3000', '15000'],
        ]),
      },
    ],
  };

  const best = parseBestOrderSheet(parsed, '测试客户订单.xlsx');

  assert.equal(best.sheetName, '订单明细');
  assert.equal(best.parsedSheet.items.length, 2);
  assert.deepEqual(best.parsedSheet.items.map((item) => item.productName), ['柴油水泵', '柴油发电机']);
});

test('import rejects stale preview items from a different Excel file', async (t) => {
  const originalFindFirst = prisma.user.findFirst;
  const originalCustomerFindUnique = prisma.customer.findUnique;
  t.after(() => {
    prisma.user.findFirst = originalFindFirst;
    prisma.customer.findUnique = originalCustomerFindUnique;
  });

  prisma.user.findFirst = (async () => ({
    id: 1,
    role: 'sales',
    managerSubRole: '',
    canApproveOrder: false,
    canManageUsers: false,
    isClerk: false,
    canCreateOrderForSales: false,
    isAdmin: true,
    name: '测试管理员',
    tokenVersion: 0,
    mustChangePassword: false,
  })) as unknown as typeof prisma.user.findFirst;
  prisma.customer.findUnique = (async () => ({ id: 1 })) as unknown as typeof prisma.customer.findUnique;

  const server = app.listen(0);
  t.after(() => server.close());
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  const fileA = workbookBuffer(orderRows('客户A', '订单A产品'));
  const fileB = workbookBuffer(orderRows('客户B', '订单B产品'));

  const previewResponse = await postMultipart(baseUrl, '/api/excel/preview', [{
    name: 'file',
    value: fileB,
    filename: '订单B.xlsx',
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }]);
  assert.equal(previewResponse.status, 200);
  const preview = await previewResponse.json() as { previewHash: string; items: unknown[] };
  assert.equal(preview.items.length, 1);

  const importResponse = await postMultipart(baseUrl, '/api/excel/import', [
    { name: 'file', value: fileA, filename: '订单A.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    { name: 'customerId', value: '1' },
    { name: 'deliveryDate', value: '2026-06-18' },
    { name: 'contractRef', value: '' },
    { name: 'previewHash', value: preview.previewHash },
    { name: 'items', value: JSON.stringify(preview.items) },
  ]);
  const payload = await importResponse.json() as { error?: string };

  assert.equal(importResponse.status, 400);
  assert.match(payload.error || '', /文件与预览结果不一致/);
});
