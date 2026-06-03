import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import crypto from 'crypto';
import multer from 'multer';
import path from 'path';
import * as XLSX from 'xlsx';
import { prisma } from '../prisma';
import { requirePermission } from '../middleware/authorize';
import { generateContractNumber, isContractNumberConflict, withContractNumberRetry } from '../lib/contractNumbers';
import { clearDashboardCache } from '../lib/dashboardCache';
import { resolveOrderSalesperson } from '../lib/orderSalesperson';
import { httpError } from '../lib/httpError';
import { validate } from '../middleware/validate';
import { excelImportSchema } from '../validation/schemas';
import { canCreateOrderForSales } from '../lib/userPermissions';
import { parseOrderSheet, type ParsedExcelOrderItem } from '../lib/excelOrderParser';
import { parseOrderSheetWithAI } from '../lib/aiOrderParser';
import { parseOrderImageWithAI } from '../lib/aiOrderImageParser';

const router = Router();

router.use(requirePermission(canCreateOrderForSales));

const MAX_EXCEL_FILE_SIZE = 10 * 1024 * 1024;
const EXCEL_PARSE_ERROR = 'Excel 格式错误，请上传有效的 .xlsx / .xls 文件';
const EXCEL_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
]);

function excelExtension(filename: string) {
  return path.extname(filename).toLowerCase();
}

function isExcelUpload(file: Express.Multer.File) {
  const ext = excelExtension(file.originalname);
  return ['.xlsx', '.xls'].includes(ext) && EXCEL_MIME_TYPES.has(file.mimetype);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_EXCEL_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (isExcelUpload(file)) {
      cb(null, true);
    } else {
      cb(new Error('只支持 .xlsx / .xls 文件'));
    }
  },
});

// 修复 multer 默认把 UTF-8 文件名按 latin1 解读导致的中文 mojibake。
// busboy 在没有 RFC 5987 filename* 的情况下把 filename 字段当 latin1 传给 multer。
// 这里在文件已落 buffer 后，把 originalname 重新按 utf-8 解码一次。
function fixOriginalnameEncoding(file: Express.Multer.File | undefined) {
  if (!file?.originalname) return;
  try {
    const fixed = Buffer.from(file.originalname, 'latin1').toString('utf8');
    // 若重新解码后没有 unicode replacement char，并且至少 round-trip 回 latin1 一致，则采用
    if (fixed && !fixed.includes('�')) {
      file.originalname = fixed;
    }
  } catch {
    // 保持原值
  }
}

function uploadExcelFile(req: Request, res: Response, next: NextFunction) {
  upload.single('file')(req, res, (error) => {
    if (!error) {
      fixOriginalnameEncoding(req.file);
      return next();
    }

    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return next(error);
    }

    return next(httpError(400, '只支持 .xlsx / .xls 文件', 'BAD_REQUEST'));
  });
}

// ── 图片上传（AI 视觉识别专用） ───────────────────────────────────────
const MAX_IMAGE_FILE_SIZE = 10 * 1024 * 1024;
const IMAGE_MIME_WHITELIST = new Set(['image/jpeg', 'image/png', 'image/webp']);
const IMAGE_EXT_WHITELIST = new Set(['.jpg', '.jpeg', '.png', '.webp']);

function isImageUpload(file: Express.Multer.File) {
  const ext = path.extname(file.originalname).toLowerCase();
  return IMAGE_EXT_WHITELIST.has(ext) && IMAGE_MIME_WHITELIST.has(file.mimetype);
}

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (isImageUpload(file)) cb(null, true);
    else cb(new Error('只支持 .jpg / .jpeg / .png / .webp 图片'));
  },
});

function uploadImageFile(req: Request, res: Response, next: NextFunction) {
  imageUpload.single('file')(req, res, (error) => {
    if (!error) {
      fixOriginalnameEncoding(req.file);
      return next();
    }
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return next(error);
    }
    return next(httpError(400, '只支持 .jpg / .jpeg / .png / .webp 图片，单文件最大 10MB', 'BAD_REQUEST'));
  });
}

function hasExcelSignature(file: Express.Multer.File) {
  const ext = excelExtension(file.originalname);
  const buffer = file.buffer;

  if (ext === '.xlsx') {
    return buffer.subarray(0, 2).toString('utf8') === 'PK';
  }

  if (ext === '.xls') {
    return buffer.length >= 8 &&
      buffer[0] === 0xd0 &&
      buffer[1] === 0xcf &&
      buffer[2] === 0x11 &&
      buffer[3] === 0xe0 &&
      buffer[4] === 0xa1 &&
      buffer[5] === 0xb1 &&
      buffer[6] === 0x1a &&
      buffer[7] === 0xe1;
  }

  return false;
}

function readWorkbook(file: Express.Multer.File) {
  if (!hasExcelSignature(file)) return null;

  try {
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheets = workbook.SheetNames
      .map((sheetName) => ({ sheetName, sheet: workbook.Sheets[sheetName] }))
      .filter((entry): entry is { sheetName: string; sheet: XLSX.WorkSheet } => Boolean(entry.sheetName && entry.sheet));
    if (sheets.length === 0) {
      throw new Error('Excel 文件中没有可读取的工作表');
    }
    return { workbook, sheets };
  } catch {
    return null;
  }
}

function fingerprintFile(file: Express.Multer.File) {
  return crypto
    .createHash('sha256')
    .update(file.buffer)
    .digest('hex')
    .slice(0, 24);
}


export function parseBestOrderSheet(parsed: NonNullable<ReturnType<typeof readWorkbook>>, filename: string) {
  const parsedSheets = parsed.sheets.map(({ sheetName, sheet }) => ({
    sheetName,
    parsedSheet: parseOrderSheet(sheet, { filename }),
  }));
  return parsedSheets.sort((a, b) => {
    const itemDiff = b.parsedSheet.items.length - a.parsedSheet.items.length;
    if (itemDiff !== 0) return itemDiff;
    const aScore = a.parsedSheet.diagnostics.canImport ? 1 : 0;
    const bScore = b.parsedSheet.diagnostics.canImport ? 1 : 0;
    return bScore - aScore;
  })[0];
}

// ---------------------------------------------------------------------------
// Preview: parse Excel and return rows without saving
// ---------------------------------------------------------------------------
router.post('/preview', uploadExcelFile, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请上传文件' });

  try {
    const parsed = readWorkbook(req.file);
    if (!parsed) return res.status(400).json({ error: EXCEL_PARSE_ERROR });
    const best = parseBestOrderSheet(parsed, req.file.originalname);
    if (!best) return res.status(400).json({ error: EXCEL_PARSE_ERROR });
    const { sheetName, parsedSheet } = best;

    res.json({
      contractInfo: parsedSheet.contractInfo,
      previewHash: fingerprintFile(req.file),
      totalRows: parsedSheet.rows.length,
      rows: parsedSheet.rows.slice(0, 20),
      items: parsedSheet.items,
      sheetName,
      diagnostics: parsedSheet.diagnostics,
    });
  } catch (err) {
    console.error('Excel 解析错误:', err);
    res.status(400).json({ error: EXCEL_PARSE_ERROR });
  }
});

// ---------------------------------------------------------------------------
// AI Preview: use Qwen (DashScope) to re-parse the uploaded Excel
// 策略 C：用户在前端预览 Modal 上点击"AI 智能解析"按钮，重新调 AI 解析
// ---------------------------------------------------------------------------
router.post('/ai-parse', uploadExcelFile, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请上传文件' });

  if (!process.env.DASHSCOPE_API_KEY?.trim()) {
    return res.status(400).json({ error: '后端未配置 DASHSCOPE_API_KEY，请联系系统管理员开启 AI 智能解析' });
  }

  try {
    const parsed = readWorkbook(req.file);
    if (!parsed) return res.status(400).json({ error: EXCEL_PARSE_ERROR });
    // 复用正则解析器的"最优工作表挑选"逻辑（按 items 数量 + canImport 排序），
    // 再把同一张原始 sheet 喂给 AI，避免对多 sheet 文件浪费 token。
    const best = parseBestOrderSheet(parsed, req.file.originalname);
    if (!best) return res.status(400).json({ error: EXCEL_PARSE_ERROR });
    const rawSheet = parsed.sheets.find((entry) => entry.sheetName === best.sheetName)?.sheet;
    if (!rawSheet) return res.status(400).json({ error: EXCEL_PARSE_ERROR });

    const aiSheet = await parseOrderSheetWithAI(rawSheet, { filename: req.file.originalname });

    // 同时返回 previewHash，使 AI 解析后的预览也能通过 /import 的指纹校验
    res.json({
      contractInfo: aiSheet.contractInfo,
      previewHash: fingerprintFile(req.file),
      totalRows: aiSheet.rows.length,
      rows: aiSheet.rows.slice(0, 20),
      items: aiSheet.items,
      sheetName: best.sheetName,
      diagnostics: aiSheet.diagnostics,
    });
  } catch (err) {
    console.error('AI 智能解析错误:', err);
    const message = err instanceof Error ? err.message : 'AI 智能解析失败';
    res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// AI Image Parse: 用千问 VL 模型识别订单图片
// 接收 jpg/png/webp，调用 qwen-vl-plus 抽取订单字段
// 返回结构与 /ai-parse 一致，前端复用 applyExcelPreview 写入表单
// ---------------------------------------------------------------------------
router.post('/ai-parse-image', uploadImageFile, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请上传图片' });

  if (!process.env.DASHSCOPE_API_KEY?.trim()) {
    return res.status(400).json({ error: '后端未配置 DASHSCOPE_API_KEY，请联系系统管理员开启 AI 图片识别' });
  }

  try {
    const aiSheet = await parseOrderImageWithAI(
      req.file.buffer,
      req.file.mimetype,
      { filename: req.file.originalname },
    );

    // 同样返回 previewHash，让图片识别结果走和 Excel 一样的 import 校验链路
    res.json({
      contractInfo: aiSheet.contractInfo,
      previewHash: fingerprintFile(req.file),
      totalRows: aiSheet.rows.length,
      rows: aiSheet.rows.slice(0, 20),
      items: aiSheet.items,
      sheetName: req.file.originalname,
      diagnostics: aiSheet.diagnostics,
    });
  } catch (err) {
    console.error('AI 图片识别错误:', err);
    const message = err instanceof Error ? err.message : 'AI 图片识别失败';
    res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// Import: parse + create ONE Order with all rows as OrderItems
// ---------------------------------------------------------------------------
function normalizeImportItem(raw: unknown): ParsedExcelOrderItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const productName = String(r.productName ?? '').trim();
  if (!productName) return null;
  const quantity = Number(r.quantity);
  const unitPrice = Number(r.unitPrice);
  const subtotalRaw = Number(r.subtotal);
  const qty = Number.isFinite(quantity) && quantity > 0 ? Math.round(quantity) : 1;
  const price = Number.isFinite(unitPrice) && unitPrice >= 0 ? unitPrice : 0;
  const subtotal = Number.isFinite(subtotalRaw) && subtotalRaw > 0 ? subtotalRaw : qty * price;
  return {
    productName,
    spec: String(r.spec ?? ''),
    customerBrand: String(r.customerBrand ?? ''),
    unit: String(r.unit ?? '件') || '件',
    quantity: qty,
    unitPrice: price,
    subtotal,
    remark: String(r.remark ?? ''),
    detailRequirement: String(r.detailRequirement ?? ''),
    sourceRowNo: String(r.sourceRowNo ?? ''),
    ctnCount: r.ctnCount == null ? null : Number(r.ctnCount) || null,
    qtyPerCtn: r.qtyPerCtn == null ? null : Number(r.qtyPerCtn) || null,
    ctnVolume: r.ctnVolume == null ? null : Number(r.ctnVolume) || null,
    totalVolume: r.totalVolume == null ? null : Number(r.totalVolume) || null,
    ctnWeight: r.ctnWeight == null ? null : Number(r.ctnWeight) || null,
    totalWeight: r.totalWeight == null ? null : Number(r.totalWeight) || null,
  };
}

router.post('/import', uploadExcelFile, validate('body', excelImportSchema), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请上传文件' });

  const { customerId, salespersonId, contractRef, deliveryDate, items: rawItemsField, previewHash } = req.body;

  if (!customerId || !deliveryDate) {
    return res.status(400).json({ error: '客户ID和交期为必填项' });
  }

  let parsedItemsFromCurrentFile: ParsedExcelOrderItem[] = [];
  let orderDateFromExcel: string = '';
  const parsed = readWorkbook(req.file);
  if (!parsed) return res.status(400).json({ error: EXCEL_PARSE_ERROR });
  try {
    const best = parseBestOrderSheet(parsed, req.file.originalname);
    if (!best) return res.status(400).json({ error: EXCEL_PARSE_ERROR });
    parsedItemsFromCurrentFile = best.parsedSheet.items;
    orderDateFromExcel = best.parsedSheet.contractInfo.orderDate || '';
  } catch (err) {
    console.error('Excel 解析错误:', err);
    return res.status(400).json({ error: EXCEL_PARSE_ERROR });
  }

  // 优先采用前端编辑后的 items JSON，但必须能和当前上传文件 hash 对上，避免误用残留 state。
  let orderItemsData: ParsedExcelOrderItem[] = [];

  if (typeof rawItemsField === 'string' && rawItemsField.trim()) {
    if (previewHash !== fingerprintFile(req.file)) {
      return res.status(400).json({ error: 'Excel 文件与预览结果不一致，请重新上传并预览后再导入' });
    }
    try {
      const parsedClientItems = JSON.parse(rawItemsField);
      if (Array.isArray(parsedClientItems)) {
        orderItemsData = parsedClientItems
          .map(normalizeImportItem)
          .filter((item): item is ParsedExcelOrderItem => item !== null);
      }
    } catch (err) {
      return res.status(400).json({ error: '前端编辑的明细数据格式不合法' });
    }
  }

  if (orderItemsData.length === 0) {
    orderItemsData = parsedItemsFromCurrentFile;
  }

  if (orderItemsData.length === 0) {
    return res.json({ success: true, imported: 0, errors: ['未找到有效产品行（产品名称列为空）'], orders: [] });
  }

  const totalAmount   = orderItemsData.reduce((s, i) => s + i.subtotal, 0);
  const totalQuantity = orderItemsData.reduce((s, i) => s + i.quantity, 0);

  try {
    const order = await withContractNumberRetry(() => prisma.$transaction(async (tx) => {
      if (!req.user) throw new Error('请先登录');
      const contractNo = await generateContractNumber(tx);
      const owner = await resolveOrderSalesperson(tx, req.user, salespersonId);

      const order = await tx.order.create({
        data: {
          contractNo,
          customerId:    parseInt(customerId),
          productId:     null,
          quantity:      totalQuantity,
          unitPrice:     orderItemsData[0].unitPrice,
          totalAmount,
          totalQuantity,
          itemCount:     orderItemsData.length,
          deliveryDate:  new Date(deliveryDate),
          orderDate:     orderDateFromExcel ? new Date(orderDateFromExcel) : undefined,
          contractRef:   contractRef || '',
          createdBy:     req.user.name,
          salespersonId: owner.salespersonId,
          salespersonName: owner.salespersonName,
          notes:         '',
          status:        'draft',
          approvalLog: {
            create: {
              action:    'contract_generated',
              fromStage: 'draft',
              toStage:   'draft',
              operator:  '系统',
              reason:    `系统生成合同编号：${contractNo}`,
            },
          },
        },
      });

      // 串行创建 OrderItem 以拿到 id，进而给每个产品挂 1 行"待补"占位物料，方便采购侧按产品分组。
      for (const item of orderItemsData) {
        const createdItem = await tx.orderItem.create({
          data: {
            orderId: order.id,
            productId: null,
            productName: item.productName,
            spec: item.spec,
            customerBrand: item.customerBrand,
            unit: item.unit,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotal: item.subtotal,
            remark: item.remark,
            detailRequirement: item.detailRequirement,
            sourceRowNo: item.sourceRowNo,
            ctnCount: item.ctnCount ?? undefined,
            qtyPerCtn: item.qtyPerCtn ?? undefined,
            ctnVolume: item.ctnVolume ?? undefined,
            totalVolume: item.totalVolume ?? undefined,
            ctnWeight: item.ctnWeight ?? undefined,
            totalWeight: item.totalWeight ?? undefined,
          },
        });
        await tx.material.create({
          data: {
            orderId: order.id,
            orderItemId: createdItem.id,
            name: '待补',
            spec: '',
            unit: item.unit || '个',
            required: item.quantity,
            status: 'pending',
            source: 'excel-placeholder',
            notes: '由 Excel 导入自动生成的占位行，请采购在此基础上修改或使用"AI 补全物料"',
          },
        });
      }

      return order;
    }));
    clearDashboardCache();

    res.json({
      success:  true,
      imported: 1,
      errors:   [],
      orders:   [{
        contractNo: order.contractNo,
        itemCount:  orderItemsData.length,
        totalAmount,
        totalQuantity,
      }],
    });
  } catch (err) {
    console.error('导入错误:', err);
    if (isContractNumberConflict(err)) {
      return res.status(409).json({ error: '合同编号生成冲突，请重试' });
    }
    if (err instanceof Error && ['请选择订单业务员', '无权指定订单业务员', '业务员ID不合法', '只能指定已启用的业务员账号'].includes(err.message)) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: '导入失败' });
  }
});

export default router;
