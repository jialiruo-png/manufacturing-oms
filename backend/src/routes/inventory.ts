import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { requirePermission } from '../middleware/authorize';
import { canHandleProcurement } from '../lib/userPermissions';
import { validate } from '../middleware/validate';
import { idParamsSchema, inventoryAdjustSchema, inventorySchema, updateInventorySchema } from '../validation/schemas';

const router = Router();

router.use(requirePermission(canHandleProcurement));

// List all inventory items
router.get('/', async (_req, res) => {
  try {
    const items = await prisma.inventory.findMany({ orderBy: { name: 'asc' } });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// Create inventory item
router.post('/', validate('body', inventorySchema), async (req, res) => {
  try {
    const { name, spec, unit, quantity, safetyStock, notes } = req.body;
    if (!name) return res.status(400).json({ error: '物料名称为必填项' });
    const item = await prisma.inventory.create({
      data: {
        name,
        spec: spec || '',
        unit: unit || '个',
        quantity: parseFloat(quantity) || 0,
        safetyStock: parseFloat(safetyStock) || 0,
        notes: notes || '',
      },
    });
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// Update inventory item
router.put('/:id', validate('params', idParamsSchema), validate('body', updateInventorySchema), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, spec, unit, quantity, safetyStock, notes } = req.body;
    const item = await prisma.inventory.update({
      where: { id },
      data: {
        name: name !== undefined ? name : undefined,
        spec: spec !== undefined ? spec : undefined,
        unit: unit !== undefined ? unit : undefined,
        quantity: quantity !== undefined ? parseFloat(quantity) : undefined,
        safetyStock: safetyStock !== undefined ? parseFloat(safetyStock) : undefined,
        notes: notes !== undefined ? notes : undefined,
      },
    });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// Adjust stock quantity (delta: positive = in, negative = out)
router.post('/:id/adjust', validate('params', idParamsSchema), validate('body', inventoryAdjustSchema), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { delta } = req.body;
    if (delta === undefined) return res.status(400).json({ error: 'delta 为必填项' });

    const deltaValue = parseFloat(delta);
    const item = await prisma.$transaction(async (tx) => {
      const [current] = await tx.$queryRaw<Array<{ id: number; quantity: number }>>`
        SELECT "id", "quantity"
        FROM "Inventory"
        WHERE "id" = ${id}
        FOR UPDATE
      `;
      if (!current) return null;

      const newQty = Math.max(0, Number(current.quantity) + deltaValue);
      return tx.inventory.update({
        where: { id },
        data: { quantity: newQty },
      });
    });

    if (!item) return res.status(404).json({ error: '物料不存在' });
    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// Delete inventory item
router.delete('/:id', validate('params', idParamsSchema), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await prisma.inventory.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return res.status(404).json({ error: '物料不存在' });
    }
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

export default router;
