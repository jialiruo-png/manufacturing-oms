import * as XLSX from 'xlsx';
import { parseDateText, type ParsedExcelOrderSheet, type ParsedExcelOrderItem } from './excelOrderParser';

const QWEN_ENDPOINT = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const QWEN_MODEL = process.env.DASHSCOPE_MODEL || 'qwen-turbo';
// qwen-turbo 端到端通常 5-15s；后端先于前端 axios timeout 触发，让前端能拿到 JSON 错误而不是裸 AbortError。
const QWEN_TIMEOUT_MS = 40_000;
const MAX_INPUT_CHARS = 24_000; // ~ 8k tokens 上限，足够覆盖典型 Excel 订单

const SYSTEM_PROMPT = `你是制造业订单 Excel 解析助手。给定 Excel 表格数据（CSV 文本），抽取关键字段并严格按指定 JSON Schema 输出，不要任何 markdown / 解释 / 多余字段。

输出 Schema：
{
  "customerName": "客户公司名称",
  "supplierName": "供应商/我方名称，可空",
  "contractRef": "合同号/PO 号/Invoice 号",
  "orderDate": "下单日期 YYYY-MM-DD，找不到返回 ''",
  "deliveryDate": "交货日期 YYYY-MM-DD，找不到返回 ''",
  "contact": "联系人姓名，可空",
  "phone": "联系电话/邮箱，可空",
  "items": [
    {
      "productName": "产品名（必填）",
      "spec": "规格型号",
      "customerBrand": "客户品牌，可空",
      "unit": "单位：件/台/套/PCS/箱 等",
      "quantity": 0,
      "unitPrice": 0,
      "subtotal": 0,
      "remark": "备注",
      "detailRequirement": "详细要求/技术说明",
      "sourceRowNo": "原 Excel 行号或编号",
      "ctnCount": null,
      "qtyPerCtn": null,
      "ctnVolume": null,
      "totalVolume": null,
      "ctnWeight": null,
      "totalWeight": null
    }
  ]
}

规则：
- 严格输出 JSON 对象，不要 \`\`\`json 代码块。
- 找不到的字符串字段返回空字符串 ""，找不到的数值返回 0 或 null。
- 日期统一为 YYYY-MM-DD（已经是这种格式直接用）。
- 客户名要鲁棒处理：中英文混杂、装饰符（".:"、"【】"等）、零宽字符、各种"客户名称."变体。
- items 数组要列出全部产品行（包括只在"详细要求"列出现的产品）。
- 数量/单价/小计必须是纯数字，不要 "RMB" "USD" "PCS" 等单位字符或千分位。
- 不要编造数据，找不到就用空值。`;

interface AIResult {
  customerName?: string;
  supplierName?: string;
  contractRef?: string;
  orderDate?: string;
  deliveryDate?: string;
  contact?: string;
  phone?: string;
  items?: Array<{
    productName?: string;
    spec?: string;
    customerBrand?: string;
    unit?: string;
    quantity?: number | string;
    unitPrice?: number | string;
    subtotal?: number | string;
    remark?: string;
    detailRequirement?: string;
    sourceRowNo?: string | number;
    ctnCount?: number | null;
    qtyPerCtn?: number | null;
    ctnVolume?: number | null;
    totalVolume?: number | null;
    ctnWeight?: number | null;
    totalWeight?: number | null;
  }>;
}

function sheetToCsvText(sheet: XLSX.WorkSheet): string {
  const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false, strip: true });
  if (csv.length > MAX_INPUT_CHARS) {
    return csv.slice(0, MAX_INPUT_CHARS) + '\n...[内容已截断]';
  }
  return csv;
}

function toNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(String(value).replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

function toOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function toOptionalInt(value: unknown): number | null {
  const n = toOptionalNumber(value);
  return n !== null && n > 0 ? Math.round(n) : null;
}

function safeString(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

async function callQwen(csvText: string, apiKey: string): Promise<AIResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), QWEN_TIMEOUT_MS);

  try {
    const response = await fetch(QWEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: QWEN_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `请解析以下 Excel 数据：\n\n${csvText}` },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new Error(`Qwen API 调用失败 (HTTP ${response.status}): ${errBody.slice(0, 200)}`);
    }

    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('Qwen API 返回内容为空');
    }

    try {
      return JSON.parse(content) as AIResult;
    } catch {
      // 兜底：尝试从内容里抽出第一个 {...} JSON 块
      const match = content.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]) as AIResult;
      throw new Error('Qwen API 返回非 JSON 内容');
    }
  } finally {
    clearTimeout(timeout);
  }
}

function aiResultToItems(items: AIResult['items']): ParsedExcelOrderItem[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((raw) => safeString(raw?.productName))
    .map((raw) => {
      const quantity = Math.max(1, Math.round(toNumber(raw.quantity, 1)));
      const unitPrice = toNumber(raw.unitPrice, 0);
      const subtotalRaw = toNumber(raw.subtotal, 0);
      const subtotal = subtotalRaw > 0 ? subtotalRaw : quantity * unitPrice;
      return {
        productName: safeString(raw.productName),
        spec: safeString(raw.spec),
        customerBrand: safeString(raw.customerBrand),
        unit: safeString(raw.unit) || '件',
        quantity,
        unitPrice,
        subtotal,
        remark: safeString(raw.remark),
        detailRequirement: safeString(raw.detailRequirement),
        sourceRowNo: safeString(raw.sourceRowNo),
        ctnCount: toOptionalInt(raw.ctnCount),
        qtyPerCtn: toOptionalInt(raw.qtyPerCtn),
        ctnVolume: toOptionalNumber(raw.ctnVolume),
        totalVolume: toOptionalNumber(raw.totalVolume),
        ctnWeight: toOptionalNumber(raw.ctnWeight),
        totalWeight: toOptionalNumber(raw.totalWeight),
      };
    });
}

function buildRows(ai: AIResult, items: ParsedExcelOrderItem[]): Record<string, string>[] {
  const contractTitle = safeString(ai.contractRef);
  const customerName = safeString(ai.customerName);
  return items.map((item) => ({
    合同编号: contractTitle,
    客户名称: customerName,
    下单日期: parseDateText(safeString(ai.orderDate)) || safeString(ai.orderDate),
    交货日期: parseDateText(safeString(ai.deliveryDate)) || safeString(ai.deliveryDate),
    Excel行号: item.sourceRowNo,
    产品名称: item.productName,
    详细要求: item.detailRequirement,
    数量: String(item.quantity),
    单价: String(item.unitPrice),
    小计: String(item.subtotal),
  }));
}

export async function parseOrderSheetWithAI(
  sheet: XLSX.WorkSheet,
  options: { filename?: string } = {},
): Promise<ParsedExcelOrderSheet> {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new Error('未配置 DASHSCOPE_API_KEY，无法使用 AI 智能解析');
  }

  const csvText = sheetToCsvText(sheet);
  const ai = await callQwen(csvText, apiKey);

  const items = aiResultToItems(ai.items);
  const customerName = safeString(ai.customerName);
  const orderDate = parseDateText(safeString(ai.orderDate)) || safeString(ai.orderDate);
  const deliveryDate = parseDateText(safeString(ai.deliveryDate)) || safeString(ai.deliveryDate);
  const contractRef = safeString(ai.contractRef);

  const warnings: string[] = ['🪄 AI 智能解析（千问 qwen-turbo）'];
  if (options.filename) {
    warnings.push(`源文件：${options.filename}`);
  }

  const missingRequiredFields = [
    !customerName ? 'customerName' : '',
    !deliveryDate ? 'deliveryDate' : '',
    items.length === 0 ? 'items' : '',
  ].filter(Boolean);

  return {
    contractInfo: {
      contractTitle: contractRef,
      contractRef,
      customerName,
      supplierName: safeString(ai.supplierName),
      orderDate,
      deliveryDate,
    },
    rows: buildRows(ai, items),
    items,
    diagnostics: {
      parser: 'ai',
      canImport: missingRequiredFields.length === 0,
      missingRequiredFields,
      warnings,
    },
  };
}
