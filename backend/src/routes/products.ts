import { Router } from 'express';
import { prisma } from '../prisma';
import { requirePermission } from '../middleware/authorize';
import { canHandleProcurement } from '../lib/userPermissions';
import { validate } from '../middleware/validate';
import { productSchema } from '../validation/schemas';

const router = Router();

router.get('/', requirePermission((user) => user.isAdmin || ['sales', 'purchase', 'production'].includes(user.role) || user.isClerk || user.canApproveOrder || user.canManageUsers), async (_req, res) => {
  try {
    const products = await prisma.product.findMany({
      orderBy: { code: 'asc' },
      include: { bomItems: true },
    });
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

router.get('/:id', requirePermission((user) => user.isAdmin || ['sales', 'purchase', 'production'].includes(user.role) || user.isClerk || user.canApproveOrder || user.canManageUsers), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const product = await prisma.product.findUnique({
      where: { id },
      include: { bomItems: true },
    });
    if (!product) return res.status(404).json({ error: '产品不存在' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

router.post('/', requirePermission(canHandleProcurement), validate('body', productSchema), async (req, res) => {
  try {
    const { name, code, unitPrice, description } = req.body;
    const product = await prisma.product.create({
      data: {
        name,
        code,
        unitPrice,
        description,
      },
      include: { bomItems: true },
    });
    res.status(201).json(product);
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'P2002') {
      return res.status(400).json({ error: '产品编号已存在' });
    }
    res.status(500).json({ error: '服务器错误' });
  }
});

export default router;
