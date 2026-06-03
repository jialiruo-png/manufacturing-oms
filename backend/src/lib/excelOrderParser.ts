import * as XLSX from 'xlsx';
import { parseProductDescription } from './productDescriptionParser';

export type ExcelCell = string | number | boolean | Date | null | undefined;

export type ParsedExcelOrderItem = {
  productName: string;
  spec: string;
  customerBrand: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  remark: string;
  detailRequirement: string;
  sourceRowNo: string;
  ctnCount?: number | null;
  qtyPerCtn?: number | null;
  ctnVolume?: number | null;
  totalVolume?: number | null;
  ctnWeight?: number | null;
  totalWeight?: number | null;
};

export type ParsedExcelOrderSheet = {
  contractInfo: Record<string, string>;
  rows: Record<string, string>[];
  items: ParsedExcelOrderItem[];
  diagnostics: {
    parser: 'production-plan' | 'contract-table' | 'generic' | 'ai';
    canImport: boolean;
    missingRequiredFields: string[];
    warnings: string[];
  };
};

function normalizeCell(value: ExcelCell) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? '').replace(/\u3000/g, ' ').trim();
}

function normalizeRow(row: ExcelCell[]) {
  return row.map(normalizeCell);
}

function rowText(row: ExcelCell[]) {
  return normalizeRow(row).filter(Boolean).join(' ');
}

function parseMoney(value: string) {
  const normalized = value.replace(/,/g, '').replace(/[^\d.-]/g, '');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function parsePositiveInt(value: string, fallback = 0) {
  const n = parseMoney(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
}

function parseOptionalNumber(value: string) {
  if (!String(value || '').trim()) return null;
  const n = parseMoney(value);
  return Number.isFinite(n) ? n : null;
}

function parseOptionalInt(value: string) {
  const n = parseOptionalNumber(value);
  return n !== null && n > 0 ? Math.round(n) : null;
}

function formatDateParts(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseDateText(value: string) {
  const text = value.trim();
  if (!text) return '';

  const serial = Number(text);
  if (Number.isFinite(serial) && serial > 20000) {
    const parsed = XLSX.SSF.parse_date_code(serial);
    if (parsed) return formatDateParts(parsed.y, parsed.m, parsed.d);
  }

  const chinese = text.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*(?:日|号)?/);
  if (chinese) return formatDateParts(Number(chinese[1]), Number(chinese[2]), Number(chinese[3]));

  const numeric = text.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (numeric) return formatDateParts(Number(numeric[1]), Number(numeric[2]), Number(numeric[3]));

  const compact = text.match(/(20\d{2})(\d{2})(\d{2})/);
  if (compact) return formatDateParts(Number(compact[1]), Number(compact[2]), Number(compact[3]));

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';
  const withoutYear = text.replace(/20\d{2}/g, '');
  const hasMonthOrDaySignal = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b|\d{1,2}|月|日|号/i.test(withoutYear);
  if (!hasMonthOrDaySignal) return '';
  return formatDateParts(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
}

function extractAfterLabel(text: string, label: RegExp) {
  const match = text.match(label);
  // 不再按 ，,；;。 截断 —— 英文/西文公司名常含 "ABC, Inc."、"XYZ Co., Ltd." 这类标点
  return match?.[1]?.trim() ?? '';
}

function findHeaderIndex(allRows: ExcelCell[][]) {
  for (let i = 0; i < Math.min(35, allRows.length); i++) {
    const row = normalizeRow(allRows[i]);
    const joined = row.join(' ');
    const hasProduct = row.some((cell) => /description\s*of\s*goods|产品名称|品名|货物|货品|描述|description|详细要求/i.test(cell));
    const hasQty = row.some((cell) => /t\.?\s*t\.?\s*qty|总数量|数量|qty/i.test(cell));
    const hasPrice = row.some((cell) => /unit\s*price|单价|price/i.test(cell));
    const hasAmount = row.some((cell) => /total\s*amount|金额|小计|合计|subtotal|amount/i.test(cell));
    if (hasProduct && (hasQty || hasPrice || hasAmount)) return i;
    if (/description\s*of\s*goods/i.test(joined) && /t\.?\s*t\.?\s*qty/i.test(joined)) return i;
  }
  return -1;
}

function findColumn(headers: string[], patterns: RegExp[]) {
  return headers.findIndex((header) => patterns.some((pattern) => pattern.test(header)));
}

function readColumn(row: string[], index: number) {
  return index >= 0 ? normalizeCell(row[index]) : '';
}

function hasCell(row: string[], index: number) {
  return index >= 0 && Boolean(readColumn(row, index));
}

function expandMergedCells(sheet: XLSX.WorkSheet, rows: ExcelCell[][]) {
  const merges = sheet['!merges'] || [];
  for (const merge of merges) {
    const source = rows[merge.s.r]?.[merge.s.c];
    if (source === undefined || source === null || source === '') continue;
    for (let r = merge.s.r; r <= merge.e.r; r++) {
      rows[r] ||= [];
      for (let c = merge.s.c; c <= merge.e.c; c++) {
        if (rows[r][c] === undefined || rows[r][c] === null || rows[r][c] === '') {
          rows[r][c] = source;
        }
      }
    }
  }
  return rows;
}

function joinHeaderWithUnit(header: string, unit: string, index: number) {
  if (!header && !unit) return `列${index + 1}`;
  if (!header) return unit;
  if (!unit) return header;
  return `${header} (${unit})`;
}

function isUnitRow(headers: string[], row: string[]) {
  const joined = row.join(' ');
  const hasProduct = headers.some((header) => /description\s*of\s*goods|产品名称|品名|描述|description|货物|货品|详细要求/i.test(header));
  return hasProduct && /CTNS|PCS|RMB|CBM|KG/i.test(joined) && !row.some((cell) => /ATC-|TOTAL|合计/i.test(cell));
}

function parserName(headers: string[], topText: string): ParsedExcelOrderSheet['diagnostics']['parser'] {
  const joined = `${headers.join(' ')} ${topText}`;
  if (/生产计划|客户名称|详细要求|其他要求|production\s*plan/i.test(joined)) return 'production-plan';
  if (/description\s*of\s*goods|CTNS|CBM|KG|需方|sales\s*contract|purchase\s*order|p\.?\s*o\.?\s*no\.?|proforma\s*invoice/i.test(joined)) return 'contract-table';
  return 'generic';
}

// 客户名抓取终止哨兵：遇到下一个常见字段 label 时截断，避免把整行吞掉
// 中文字段：下单/订单/签订/合同/制单日期、交期/交货、供方/需方、产品/品名/规格/数量等
// 英文字段：date 类、supplier/seller/from、product/qty/description/spec
const CUSTOMER_TERMINATOR = '(?=\\s+(?:下单|订单|签订|合同|制单|交期|交货|供方|需方|产品|品名|规格|数量|单价|金额|\\b(?:order\\s*date|po\\s*date|issue\\s*date|contract\\s*date|delivery\\s*date|ship\\s*date|etd|eta|supplier|seller|vendor|from|product|qty|quantity|description|spec|unit\\s*price|amount)\\b)|\\s{4,}|$)';

function buildCustomerValuePattern() {
  return `([^\\n\\r]+?)${CUSTOMER_TERMINATOR}`;
}

const CUSTOMER_VALUE_PATTERN = buildCustomerValuePattern();

function inferCustomer(topTexts: string[], filename = '') {
  // 先把不可见空白（零宽空格 U+200B、不间断空格 U+00A0、字节序标记 U+FEFF）规范化掉，
  // 否则正则的空白匹配会被这些字符破坏。
  const sanitize = (s: string) => s.replace(/[ ​﻿]/g, ' ');
  const joined = sanitize(topTexts.join(' '));
  // 标签与冒号之间允许出现 . ． 。 · - _ – — 等装饰标点（兼容"客户名称.: xxx"）
  const LABEL_SEP = '[\\s.．。·\\-_–—]*[:：]\\s*';
  const labelMatch =
    // 中文标签
    extractAfterLabel(joined, new RegExp(`客户名称${LABEL_SEP}${CUSTOMER_VALUE_PATTERN}`, 'i'))
    || extractAfterLabel(joined, new RegExp(`客户${LABEL_SEP}${CUSTOMER_VALUE_PATTERN}`, 'i'))
    || extractAfterLabel(joined, /需方\s*[:：]\s*(.+?)(?:\s+供方|$)/)
    // 英文标签
    || extractAfterLabel(joined, new RegExp(`\\b(?:customer\\s*name|customer|buyer|consignee|bill\\s*to|sold\\s*to|ship\\s*to|company)${LABEL_SEP}${CUSTOMER_VALUE_PATTERN}`, 'i'))
    // 最宽容的兜底：客户名称 + 最多 8 个非冒号字符 + 冒号
    // 覆盖 "客户名称(简称):xxx"、"客户名称【正式】：xxx" 等异常装饰
    || extractAfterLabel(joined, new RegExp(`客户名称[^:：\\n\\r]{0,8}[:：]\\s*${CUSTOMER_VALUE_PATTERN}`, 'i'));
  if (labelMatch) return { customerName: labelMatch, inferredFromFilename: false };

  // 文件名兜底：剥离常见后缀关键词，再按分隔符切片
  // 兜底前先做 mojibake 检测：如果文件名包含 UTF-8 字节被 latin1 误解读后的典型字符序列
  // (例如 "è®¢å è¯¦æ")，直接放弃 filename 兜底，避免把乱码塞给前端
  const safeFilename = isLikelyMojibake(filename) ? '' : filename;
  const filenameBase = safeFilename
    .replace(/\.(xlsx|xls)$/i, '')
    .replace(/[-_—\s]*(order|contract|purchase\s*order|po|invoice|sheet|订单|合同|生产计划)[-_—\s]*$/i, '')
    .trim();
  const parts = filenameBase
    .split(/[-_—]/)
    .map((part) => part.trim())
    .filter((part) => part && !/^\d+$/.test(part) && !/^(?:order|contract|po|invoice)$/i.test(part));
  return { customerName: parts[0] || '', inferredFromFilename: Boolean(parts[0]) };
}

// 检测 latin1-decoded UTF-8 mojibake：典型模式是 0xC2-0xC3 / 0xE0-0xEF 字符
// 紧跟着 0x80-0xBF 区间的 "控制带音符" 字符（latin1 0x80-0x9F + 拉丁补充 0xA0-0xBF）。
// 真正的法语/西文也含 à é 等，但极少连续两三个高位字符紧贴。
function isLikelyMojibake(text: string): boolean {
  if (!text) return false;
  // 至少连续两个 latin1 高位字节字符且其中包含 UTF-8 起始字节区 (0xC2-0xEF) 的连续段
  const mojibakeRun = /[Â-ï][-¿]{1,3}/;
  // 至少出现 2 次这种模式才判为乱码（单个 é 是正常法语字符不算）
  let count = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(mojibakeRun.source, 'g');
  while ((m = re.exec(text)) !== null) {
    count++;
    if (count >= 2) return true;
  }
  return false;
}

function findDateByLabels(texts: string[], labels: RegExp[]) {
  for (const text of texts) {
    if (!labels.some((label) => label.test(text))) continue;
    const parsed = parseDateText(text);
    if (parsed) return parsed;
  }
  return '';
}

function inferDates(topTexts: string[], filename = '') {
  const orderDate = findDateByLabels(topTexts, [
    /下单日期|订单日期|下单时间|签订日期|合同日期|制单日期/,
    /\b(?:order\s*date|po\s*date|issue\s*date|contract\s*date|date\s*of\s*issue)\b/i,
  ])
    || parseDateText(filename);
  const deliveryDate = inferDeliveryDateFromTopText(topTexts)
    || findDateByLabels(topTexts, [
      /交期要求|交货时间|交货日期|交期/,
      /\b(?:delivery\s*date|ship\s*date|etd|eta|required\s*by|delivery\s*time|shipment\s*date)\b/i,
    ]);
  return { orderDate, deliveryDate };
}

function inferDeliveryDateFromTopText(topTexts: string[]) {
  const deliveryLabel = /交期要求|交货时间|交货日期|交期|\b(?:delivery|ship\s*date|etd|eta)\b/i;
  for (const text of topTexts) {
    if (!deliveryLabel.test(text)) continue;
    const withoutOrderDate = text.replace(/下单日期\s*[:：]?\s*20\d{2}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*(?:日|号)?/g, '');
    const dates = Array.from(withoutOrderDate.matchAll(/20\d{2}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*(?:日|号)?|20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}/g))
      .map((match) => parseDateText(match[0]))
      .filter(Boolean);
    if (dates.length > 0) return dates[dates.length - 1];
  }
  return '';
}

function compactDetail(parts: string[]) {
  return parts.map((part) => part.trim()).filter(Boolean).join('；');
}

function normalizeUnit(raw: string) {
  const text = raw.trim();
  if (!text) return '件';
  const lower = text.toLowerCase();
  if (/^pc?s?$|^piece(?:s)?$/.test(lower)) return '件';
  if (/^set(?:s)?$/.test(lower)) return '套';
  if (/^pair(?:s)?$/.test(lower)) return '对';
  if (/^kg$|^kgs$/.test(lower)) return '千克';
  if (/^g$|^gram(?:s)?$/.test(lower)) return '克';
  if (/^m$|^meter(?:s)?$/.test(lower)) return '米';
  if (/^box(?:es)?$|^ctn(?:s)?$/.test(lower)) return '箱';
  return text;
}

export function parseOrderSheet(sheet: XLSX.WorkSheet, options: { filename?: string } = {}): ParsedExcelOrderSheet {
  const allRows = expandMergedCells(sheet, XLSX.utils.sheet_to_json<ExcelCell[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
  }) as ExcelCell[][]);

  const headerIdx = findHeaderIndex(allRows);
  const topRows = allRows.slice(0, headerIdx >= 0 ? headerIdx : Math.min(10, allRows.length));
  const topTexts = topRows.map(rowText).filter(Boolean);
  const title = topTexts[0] ?? '';
  const { customerName, inferredFromFilename } = inferCustomer(topTexts, options.filename);
  const supplierName = extractAfterLabel(topTexts.join(' '), /供方\s*[:：]\s*(.+?)(?:\s+|$)/)
    || extractAfterLabel(topTexts.join(' '), new RegExp(`\\b(?:supplier|seller|vendor|from)\\s*[:：]\\s*${CUSTOMER_VALUE_PATTERN}`, 'i'));
  const { orderDate, deliveryDate } = inferDates(topTexts, options.filename);
  const warnings: string[] = [];
  if (orderDate && parseDateText(options.filename || '') === orderDate && !findDateByLabels(topTexts, [
    /下单日期|订单日期|下单时间|签订日期|合同日期|制单日期/,
    /\b(?:order\s*date|po\s*date|issue\s*date|contract\s*date|date\s*of\s*issue)\b/i,
  ])) {
    warnings.push('下单日期从文件名推断');
  }
  if (inferredFromFilename) {
    warnings.push('客户从文件名推断');
  }

  if (headerIdx < 0) {
    const missingRequiredFields = [
      !customerName ? 'customerName' : '',
      !deliveryDate ? 'deliveryDate' : '',
      'items',
    ].filter(Boolean);
    return {
      contractInfo: { contractTitle: title, contractRef: title, customerName, supplierName, orderDate, deliveryDate },
      rows: [],
      items: [],
      diagnostics: { parser: 'generic', canImport: false, missingRequiredFields, warnings: ['未识别到明细表头'] },
    };
  }

  const headerRow = normalizeRow(allRows[headerIdx]);
  const possibleUnitRow = normalizeRow(allRows[headerIdx + 1] ?? []);
  const unitRow = isUnitRow(headerRow, possibleUnitRow) ? possibleUnitRow : [];
  const dataStartIdx = headerIdx + (unitRow.length > 0 ? 2 : 1);
  const maxColCount = Math.max(headerRow.length, unitRow.length);
  const headers = Array.from({ length: maxColCount }, (_value, idx) => joinHeaderWithUnit(headerRow[idx] ?? '', unitRow[idx] ?? '', idx));
  const noIdx = findColumn(headers, [/^no\.?(?:\s*\(.+\))?$/i, /^序号(?:\s*\(.+\))?$/, /^编号(?:\s*\(.+\))?$/]);
  const nameIdx = findColumn(headers, [/description\s*of\s*goods|产品名称|品名|描述|description|货物|货品/i]);
  const detailIdx = findColumn(headers, [/详细要求|产品要求|要求/i]);
  const otherReqIdx = findColumn(headers, [/其他要求|备注|remark|note/i]);
  let qtyIdx = findColumn(headers, [/^t\.?\s*t\.?\s*qty/i, /总数量|总数/i]);
  if (qtyIdx < 0) qtyIdx = headers.findIndex((header) => /数量|qty/i.test(header) && !/qty\/ctn|每箱/i.test(header));
  const priceIdx = findColumn(headers, [/unit\s*price|单价/i]);
  const amountIdx = findColumn(headers, [/total\s*amount|小计|合计|金额|subtotal/i]);
  const unitIdx = findColumn(headers, [/^单位$|^unit$|u\/m|measure|uom/i]);
  const ctnCountIdx = findColumn(headers, [/CTNS|箱数|箱量/i]);
  const qtyPerCtnIdx = findColumn(headers, [/QTY\/CTN|PCS\/CTN|每箱|装箱数/i]);
  const ctnVolumeIdx = findColumn(headers, [/CTN\/CBM|CBM\/CTN|单箱体积/i]);
  const totalVolumeIdx = findColumn(headers, [/T\.?T\.?\s*CBM|TOTAL\s*CBM|总体积|总立方/i]);
  const ctnWeightIdx = findColumn(headers, [/CTN\/KG|KG\/CTN|单箱重量/i]);
  const totalWeightIdx = findColumn(headers, [/T\.?T\.?\s*KG|TOTAL\s*KG|总重量/i]);

  const rows: Record<string, string>[] = [];
  const items: ParsedExcelOrderItem[] = [];
  let lastProductName = '';

  for (const rawRow of allRows.slice(dataStartIdx)) {
    const row = normalizeRow(rawRow);
    if (row.filter(Boolean).length === 0) continue;

    const sourceRowNo = readColumn(row, noIdx);
    const description = readColumn(row, nameIdx);
    const detailCell = readColumn(row, detailIdx);
    const otherReq = readColumn(row, otherReqIdx);
    const hasQuantity = hasCell(row, qtyIdx);
    const hasAmount = hasCell(row, amountIdx);
    const joined = row.join(' ');
    if (/^total$/i.test(sourceRowNo) || /^合计$/.test(sourceRowNo) || /^total$/i.test(description) || /^合计$/.test(description)) continue;
    if (!description && !detailCell && !hasQuantity && !hasAmount) continue;

    const parsedDescription = parseProductDescription(description);
    // 续行：产品名列为空但有数量/金额时沿用上一行产品名（合并单元格已在 expandMergedCells 处理过）
    const productName = parsedDescription.productName || lastProductName;
    if (!productName || /^(?:ATC-\d+|\d+|No\.?)$/i.test(productName)) continue;
    if (parsedDescription.productName) {
      lastProductName = productName;
    }

    const quantity = parsePositiveInt(readColumn(row, qtyIdx), 1);
    const unitPrice = parseMoney(readColumn(row, priceIdx));
    const parsedSubtotal = parseMoney(readColumn(row, amountIdx));
    const subtotal = parsedSubtotal > 0 ? parsedSubtotal : quantity * unitPrice;
    const detailRequirement = compactDetail([parsedDescription.detailRequirement, detailCell, otherReq]);
    const unit = normalizeUnit(readColumn(row, unitIdx));
    const originalColumns = Object.fromEntries(headers.map((header, idx) => [header, readColumn(row, idx)]));
    const item: ParsedExcelOrderItem = {
      productName,
      spec: '',
      customerBrand: '',
      unit,
      quantity,
      unitPrice,
      subtotal,
      remark: otherReq,
      detailRequirement,
      sourceRowNo,
      ctnCount: parseOptionalInt(readColumn(row, ctnCountIdx)),
      qtyPerCtn: parseOptionalInt(readColumn(row, qtyPerCtnIdx)),
      ctnVolume: parseOptionalNumber(readColumn(row, ctnVolumeIdx)),
      totalVolume: parseOptionalNumber(readColumn(row, totalVolumeIdx)),
      ctnWeight: parseOptionalNumber(readColumn(row, ctnWeightIdx)),
      totalWeight: parseOptionalNumber(readColumn(row, totalWeightIdx)),
    };

    rows.push({
      合同编号: title,
      客户名称: customerName,
      下单日期: orderDate,
      交货日期: deliveryDate,
      Excel行号: sourceRowNo,
      产品名称: productName,
      详细要求: detailRequirement,
      数量: String(quantity),
      单价: String(unitPrice),
      小计: String(subtotal),
      ...originalColumns,
    });
    items.push(item);

    if (/total|合计/i.test(joined)) continue;
  }

  const missingRequiredFields = [
    !customerName ? 'customerName' : '',
    !deliveryDate ? 'deliveryDate' : '',
    items.length === 0 ? 'items' : '',
  ].filter(Boolean);

  return {
    contractInfo: {
      contractTitle: title,
      contractRef: title,
      customerName,
      supplierName,
      orderDate,
      deliveryDate,
    },
    rows,
    items,
    diagnostics: {
      parser: parserName(headers, topTexts.join(' ')),
      canImport: missingRequiredFields.length === 0,
      missingRequiredFields,
      warnings,
    },
  };
}
