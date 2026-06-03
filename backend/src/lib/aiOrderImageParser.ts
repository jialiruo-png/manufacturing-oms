import { parseDateText, type ParsedExcelOrderSheet, type ParsedExcelOrderItem } from './excelOrderParser';

const QWEN_ENDPOINT = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const QWEN_VL_MODEL = process.env.DASHSCOPE_VL_MODEL || 'qwen-vl-plus';
// 视觉模型推理略慢，给到 60s；前端 axios 超时设为 75s 以兜底
const QWEN_VL_TIMEOUT_MS = 60_000;
// 图片最大 10MB（multer 上游已限），data URL 转换后 base64 体积约 4/3 倍，保留余量
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const SYSTEM_PROMPT = `你是制造业订单图片识别助手。用户会提供一张订单图片（可能是手写、打印、扫描或截图），请从中抽取关键字段并严格按指定 JSON Schema 输出，不要任何 markdown / 解释 / 多余字段。

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
      "sourceRowNo": "图片中行号或编号",
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
- 严格输出 JSON 对象，不要 \`\`\`json 代码块、不要任何前后说明。
- 找不到的字符串字段返回空字符串 ""，找不到的数值字段返回 0 或 null。
- 日期统一 YYYY-MM-DD。
- 客户名要鲁棒：手写体、印章遮挡、中英文混杂均尽量识别；完全无法识别返回 ""。
- items 数组要包含图片中可见的所有产品行（包括手写续行）。
- 数量/单价/小计必须是纯数字，不要 "RMB" "USD" "PCS" 等单位字符或千分位。
- 不要编造数据，识别不出来就用空值。
- 如果图片不是订单（如截图错图、纯文字说明），返回 customerName="" 且 items=[]。`;

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

async function callQwenVL(dataUrl: string, apiKey: string): Promise<AIResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), QWEN_VL_TIMEOUT_MS);

  try {
    const response = await fetch(QWEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: QWEN_VL_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: dataUrl } },
              { type: 'text', text: '请识别这张订单图片，按上面的 JSON Schema 输出。' },
            ],
          },
        ],
        temperature: 0,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new Error(`Qwen VL API 调用失败 (HTTP ${response.status}): ${errBody.slice(0, 200)}`);
    }

    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error('Qwen VL API 返回内容为空');

    try {
      return JSON.parse(content) as AIResult;
    } catch {
      // VL 模型可能在 JSON 前后带说明文字，兜底抽出第一段 {...}
      const match = content.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]) as AIResult;
      throw new Error('Qwen VL API 返回非 JSON 内容');
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

export async function parseOrderImageWithAI(
  imageBuffer: Buffer,
  mimeType: string,
  options: { filename?: string } = {},
): Promise<ParsedExcelOrderSheet> {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new Error('未配置 DASHSCOPE_API_KEY，无法使用 AI 图片识别');
  }

  if (imageBuffer.length === 0) throw new Error('图片文件为空');
  if (imageBuffer.length > MAX_IMAGE_BYTES) throw new Error('图片体积超过 10MB');

  const base64 = imageBuffer.toString('base64');
  const dataUrl = `data:${mimeType};base64,${base64}`;
  const ai = await callQwenVL(dataUrl, apiKey);

  const items = aiResultToItems(ai.items);
  const customerName = safeString(ai.customerName);
  const orderDate = parseDateText(safeString(ai.orderDate)) || safeString(ai.orderDate);
  const deliveryDate = parseDateText(safeString(ai.deliveryDate)) || safeString(ai.deliveryDate);
  const contractRef = safeString(ai.contractRef);

  const warnings: string[] = [`🪄 AI 图片识别（千问 ${QWEN_VL_MODEL}）`];
  if (options.filename) warnings.push(`源文件：${options.filename}`);

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
