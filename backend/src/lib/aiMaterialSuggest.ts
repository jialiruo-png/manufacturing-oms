// AI 物料建议：把 OrderItem 的 detailRequirement 喂给千问，让它从详细要求里抽取候选物料。
// 设计原则：
// - 这只是辅助。AI 失败/返回空都不抛错，调用方拿到空数组就好。
// - 永远不直接写库；前端拿到建议后由采购勾选确认，再调用现有 POST /api/materials 入库。
// - 单次调用按"产品列表"批量传入，减少 token 与网络往返。

const QWEN_ENDPOINT = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const QWEN_MODEL = process.env.DASHSCOPE_MODEL || 'qwen-turbo';
const QWEN_TIMEOUT_MS = 40_000;

const SYSTEM_PROMPT = `你是制造业采购助手。给定订单产品明细，从每个产品的"详细要求"里抽取采购侧需要购买的关键物料。

输出 Schema：
{
  "items": [
    {
      "orderItemId": 0,
      "materials": [
        { "name": "物料名（必填）", "spec": "规格/型号", "unit": "件/套/个/台/张", "estimatedQty": 0, "notes": "可选简短说明" }
      ]
    }
  ]
}

规则：
- 严格输出 JSON 对象，不要 \`\`\`json 代码块、不要解释。
- 一个产品通常拆出 3-8 类物料，例如：动力（柴油机/电机）、泵体/机壳、油箱/水箱、控制箱、外观贴花/品牌、纸箱包装、附件等。
- 不要重复同名物料；不要把"产品本身"列为物料。
- estimatedQty 按订单数量等比给（如果详细要求里说"每台 1 个"且订单 10 台，给 10）。无法判断就给 null。
- 详细要求为空或无法识别，对应 materials 给空数组 []。
- 只输出可在采购侧采购的物理物料，不输出"包装方式""颜色要求"等非采购条目（颜色可作为 spec 备注）。`;

interface SuggestedMaterial {
  name: string;
  spec: string;
  unit: string;
  estimatedQty: number | null;
  notes: string;
}

export interface MaterialSuggestionGroup {
  orderItemId: number;
  productName: string;
  materials: SuggestedMaterial[];
}

interface RawAIResponse {
  items?: Array<{
    orderItemId?: number;
    materials?: Array<{
      name?: string;
      spec?: string;
      unit?: string;
      estimatedQty?: number | string | null;
      notes?: string;
    }>;
  }>;
}

export interface OrderItemForSuggest {
  id: number;
  productName: string;
  detailRequirement: string;
  quantity: number;
  unit: string;
}

function safeString(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

function toOptionalQty(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/[^\d.\-]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

function buildUserPrompt(items: OrderItemForSuggest[]): string {
  const lines = items.map((item) => `- orderItemId=${item.id}, 产品="${item.productName}", 订单数量=${item.quantity}${item.unit || '件'}, 详细要求="${item.detailRequirement || '(空)'}"`);
  return `请根据下列订单产品明细抽取每个产品的采购物料候选：\n${lines.join('\n')}`;
}

async function callQwen(prompt: string, apiKey: string): Promise<RawAIResponse> {
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
          { role: 'user', content: prompt },
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
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return {};
    try {
      return JSON.parse(content) as RawAIResponse;
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]) as RawAIResponse;
      return {};
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function suggestMaterialsForOrder(items: OrderItemForSuggest[]): Promise<MaterialSuggestionGroup[]> {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new Error('未配置 DASHSCOPE_API_KEY，无法使用 AI 物料建议');
  }
  if (items.length === 0) return [];

  const raw = await callQwen(buildUserPrompt(items), apiKey);
  type RawMaterials = NonNullable<NonNullable<RawAIResponse['items']>[number]['materials']>;
  const aiByItemId = new Map<number, RawMaterials>();
  for (const group of raw.items ?? []) {
    if (typeof group?.orderItemId === 'number') {
      aiByItemId.set(group.orderItemId, group.materials ?? []);
    }
  }

  return items.map((item) => ({
    orderItemId: item.id,
    productName: item.productName,
    materials: (aiByItemId.get(item.id) ?? [])
      .map((raw) => ({
        name: safeString(raw?.name),
        spec: safeString(raw?.spec),
        unit: safeString(raw?.unit) || '个',
        estimatedQty: toOptionalQty(raw?.estimatedQty),
        notes: safeString(raw?.notes),
      }))
      .filter((m) => m.name),
  }));
}
