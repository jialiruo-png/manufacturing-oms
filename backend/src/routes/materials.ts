import { Router } from 'express';
import { prisma } from '../prisma';
import { requirePermission } from '../middleware/authorize';
import { canHandleProcurement, canHandleProduction } from '../lib/userPermissions';
import { clearDashboardCache } from '../lib/dashboardCache';
import { validate } from '../middleware/validate';
import { idParamsSchema, updateMaterialSchema, createMaterialSchema } from '../validation/schemas';
import { suggestMaterialsForOrder } from '../lib/aiMaterialSuggest';

const router = Router();

router.use(requirePermission((user) => canHandleProcurement(user) || canHandleProduction(user)));

// Create a new material under an order (optionally bound to a specific OrderItem)
router.post('/', validate('body', createMaterialSchema), async (req, res) => {
  try {
    const { orderId, orderItemId, name, spec, unit, required, notes } = req.body;

    // Validate that the order exists and (when provided) the orderItem belongs to it
    const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true } });
    if (!order) return res.status(404).json({ error: '订单不存在' });

    if (orderItemId) {
      const item = await prisma.orderItem.findFirst({
        where: { id: orderItemId, orderId },
        select: { id: true },
      });
      if (!item) return res.status(400).json({ error: '所选产品不属于该订单' });
    }

    const material = await prisma.material.create({
      data: {
        orderId,
        orderItemId: orderItemId ?? null,
        name,
        spec: spec ?? '',
        unit: unit ?? '个',
        required,
        status: 'pending',
        notes: notes ?? '',
        source: 'manual',
      },
    });
    clearDashboardCache();
    res.status(201).json(material);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// Update a single material
router.put('/:id', validate('params', idParamsSchema), validate('body', updateMaterialSchema), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status, urgent, expectedDate, notes, name, spec, unit, required } = req.body;

    // 仅当物料尚未开始备料时允许修改核心字段（name/spec/unit/required）；
    // 已进入备料 / 已到货阶段时只能改 status/urgent/expectedDate/notes
    const wantsCoreEdit = name !== undefined || spec !== undefined || unit !== undefined || required !== undefined;
    if (wantsCoreEdit) {
      const current = await prisma.material.findUnique({ where: { id }, select: { status: true } });
      if (!current) return res.status(404).json({ error: '物料不存在' });
      if (current.status !== 'pending') {
        return res.status(400).json({ error: '物料已开始备料或已到货，不能修改名称/规格/单位/需求量；如需调整请先删除后重建' });
      }
    }

    const material = await prisma.material.update({
      where: { id },
      data: {
        status: status !== undefined ? status : undefined,
        urgent: urgent !== undefined ? urgent : undefined,
        expectedDate: expectedDate !== undefined
          ? (expectedDate ? new Date(expectedDate) : null)
          : undefined,
        notes: notes !== undefined ? notes : undefined,
        name: name !== undefined ? name : undefined,
        spec: spec !== undefined ? spec : undefined,
        unit: unit !== undefined ? unit : undefined,
        required: required !== undefined ? required : undefined,
      },
    });
    clearDashboardCache();
    res.json(material);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// AI 建议物料：把订单各产品的详细要求喂给 qwen-turbo，返回每个产品的候选物料。
// 不写库，只返回建议；采购挑选后通过 POST /api/materials 入库。
router.post('/ai-suggest/:orderId', async (req, res) => {
  const orderId = Number(req.params.orderId);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return res.status(400).json({ error: '订单ID不合法' });
  }
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderItems: {
          select: { id: true, productName: true, detailRequirement: true, quantity: true, unit: true },
          orderBy: { id: 'asc' },
        },
      },
    });
    if (!order) return res.status(404).json({ error: '订单不存在' });
    if (order.orderItems.length === 0) return res.json({ groups: [] });

    const groups = await suggestMaterialsForOrder(order.orderItems.map((item) => ({
      id: item.id,
      productName: item.productName,
      detailRequirement: item.detailRequirement ?? '',
      quantity: item.quantity,
      unit: item.unit || '件',
    })));
    res.json({ groups });
  } catch (err) {
    console.error('AI 物料建议失败:', err);
    const message = err instanceof Error ? err.message : 'AI 物料建议失败';
    res.status(500).json({ error: message });
  }
});

// Delete a material (採购员可手动移除多余条目)
router.delete('/:id', validate('params', idParamsSchema), async (req, res) => {
  try {
    const id = Number(req.params.id);
    await prisma.material.delete({ where: { id } });
    clearDashboardCache();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

export default router;
