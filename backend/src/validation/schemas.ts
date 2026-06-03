import { z } from 'zod';

const trimString = z.string().trim();
const optionalTrimString = z.preprocess((value) => value === null ? undefined : value, trimString.optional());
const requiredString = (message: string) => trimString.min(1, message);
const numericString = z.union([z.string(), z.number()]).transform((value) => String(value));
const optionalNumericString = numericString.optional();
const positiveIntegerString = numericString.refine((value) => Number.isInteger(Number(value)) && Number(value) > 0, 'ID 不合法');
const customerIdString = numericString.refine((value) => Number.isInteger(Number(value)) && Number(value) > 0, '客户ID不合法');
const optionalCustomerIdQuery = z.preprocess(
  (value) => value === undefined || value === null || value === '' ? undefined : value,
  z.coerce.number().int('客户ID不合法').positive('客户ID不合法').optional(),
);
const optionalPositiveIntQuery = (message: string, max = 1000) => z.preprocess(
  (value) => value === undefined || value === null || value === '' ? undefined : value,
  z.coerce.number().int(message).positive(message).max(max, message).optional(),
);
const optionalBoolean = z.union([z.boolean(), z.literal('true'), z.literal('false')])
  .optional()
  .transform((value) => value === undefined ? undefined : value === true || value === 'true');
const optionalDateOrNull = z.preprocess(
  (value) => value === undefined ? undefined : value === null || value === '' ? null : value,
  z.union([
    trimString.refine((value) => !Number.isNaN(new Date(value).getTime()), '日期格式不合法'),
    z.null(),
  ]).optional(),
);

export const idParamsSchema = z.object({
  id: z.coerce.number().int('ID 不合法').positive('ID 不合法'),
});

export const userRegisterSchema = z.object({
  name: requiredString('姓名为必填项'),
  phone: requiredString('手机号为必填项').transform((value) => value.replace(/\s+/g, '')),
  password: z.string().min(1, '密码为必填项'),
  confirmPassword: z.string().min(1, '确认密码为必填项'),
  department: requiredString('部门为必填项'),
  role: requiredString('身份角色为必填项'),
  managerSubRole: optionalTrimString.default(''),
  remark: optionalTrimString.default(''),
}).strict();

export const userLoginSchema = z.object({
  login: requiredString('请输入姓名或手机号'),
  password: z.string().min(1, '请输入密码'),
}).strict();

export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, '旧密码为必填项'),
  newPassword: z.string().min(1, '新密码为必填项'),
  confirmPassword: z.string().min(1, '确认密码为必填项'),
}).passthrough();

export const userReviewSchema = z.object({
  action: z.enum(['approve', 'reject', 'disable'], { error: '审核操作不合法' }),
  role: optionalTrimString.default(''),
  managerSubRole: optionalTrimString.default(''),
  canApproveOrder: optionalBoolean,
}).passthrough();

export const userCreateSchema = z.object({
  name: requiredString('姓名为必填项'),
  phone: requiredString('手机号为必填项').transform((value) => value.replace(/\s+/g, '')),
  role: requiredString('角色为必填项'),
  managerSubRole: optionalTrimString.default(''),
  canApproveOrder: optionalBoolean,
  password: z.string().min(1, '初始密码为必填项'),
  remark: optionalTrimString.default(''),
}).passthrough();

export const userManageSchema = z.object({
  action: requiredString('管理操作为必填项'),
  role: optionalTrimString.default(''),
  managerSubRole: optionalTrimString.default(''),
  canApproveOrder: optionalBoolean,
}).passthrough();

export const orderItemSchema = z.object({
  productId: positiveIntegerString.optional(),
  productName: requiredString('产品名称为必填项'),
  spec: optionalTrimString.default(''),
  customerBrand: optionalTrimString.default(''),
  unit: optionalTrimString.default('件'),
  quantity: numericString.refine((value) => Number.isFinite(Number(value)) && Number(value) > 0, '数量必须大于 0'),
  unitPrice: numericString.refine((value) => Number.isFinite(Number(value)) && Number(value) >= 0, '单价不能为负数'),
  remark: optionalTrimString.default(''),
  detailRequirement: optionalTrimString.default(''),
}).passthrough();

export const createOrderSchema = z.object({
  customerId: customerIdString,
  salespersonId: z.union([z.string(), z.number()]).optional(),
  deliveryDate: requiredString('交期为必填项').refine((value) => !Number.isNaN(new Date(value).getTime()), '交期格式不合法'),
  notes: optionalTrimString.default(''),
  contractRef: optionalTrimString.default(''),
  urgent: z.union([z.boolean(), z.literal('true'), z.literal('false')]).optional(),
  urgentReason: optionalTrimString.default(''),
  items: z.array(orderItemSchema).optional(),
  productId: positiveIntegerString.optional(),
  quantity: numericString.optional(),
  unitPrice: numericString.optional(),
  totalAmount: numericString.optional(),
  materials: z.array(z.record(z.string(), z.unknown())).optional(),
}).passthrough().superRefine((value, ctx) => {
  if (value.items?.length) return;
  if (!value.productId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['productId'], message: '产品为必填项' });
  if (!value.quantity || !(Number(value.quantity) > 0)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['quantity'], message: '数量必须大于 0' });
  if (value.unitPrice === undefined || !(Number(value.unitPrice) >= 0)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['unitPrice'], message: '单价不能为负数' });
});

export const updateOrderSchema = z.object({
  deliveryDate: requiredString('交期格式不合法').refine((value) => !Number.isNaN(new Date(value).getTime()), '交期格式不合法').optional(),
  notes: optionalTrimString,
  urgent: z.union([z.boolean(), z.literal('true'), z.literal('false')]).optional(),
  urgentReason: optionalTrimString,
  items: z.array(orderItemSchema).optional(),
  quantity: numericString.refine((value) => Number(value) > 0, '数量必须大于 0').optional(),
  unitPrice: numericString.refine((value) => Number(value) >= 0, '单价不能为负数').optional(),
  totalAmount: numericString.refine((value) => Number(value) >= 0, '金额不能为负数').optional(),
}).passthrough();

export const orderActionSchema = z.object({
  action: requiredString('流程操作为必填项'),
  reason: optionalTrimString.default(''),
  urgent: z.union([z.boolean(), z.literal('true'), z.literal('false')]).optional(),
  urgentReason: optionalTrimString.default(''),
}).passthrough();

export const orderListQuerySchema = z.object({
  status: optionalTrimString,
  customerId: optionalCustomerIdQuery,
  range: optionalTrimString,
  sort: z.enum(['deliveryDate_asc', 'createdAt_desc']).optional(),
  search: optionalTrimString,
  searchField: z.enum(['all', 'contract', 'customer', 'salesperson', 'tracking']).optional(),
  deliveryDateFrom: optionalTrimString,
  deliveryDateTo: optionalTrimString,
  shipDateFrom: optionalTrimString,
  shipDateTo: optionalTrimString,
  page: optionalPositiveIntQuery('页码不合法', 100000),
  pageSize: optionalPositiveIntQuery('每页数量不合法', 100),
}).passthrough();

export const orderProgressSchema = z.object({
  progressPct: z.coerce.number().int('生产进度必须是整数').min(0, '生产进度不能小于 0').max(100, '生产进度不能大于 100'),
}).passthrough();

export const customerSchema = z.object({
  name: requiredString('客户名称为必填项'),
  contact: optionalTrimString.default(''),
  phone: optionalTrimString.default(''),
  email: optionalTrimString.default(''),
  address: optionalTrimString.default(''),
  rating: optionalTrimString.default('B'),
  notes: optionalTrimString.default(''),
  salespersonId: z.union([z.string(), z.number()]).optional(),
  salespersonName: optionalTrimString,
}).passthrough();

export const updateCustomerSchema = z.object({
  name: requiredString('客户名称不能为空').optional(),
  contact: optionalTrimString,
  phone: optionalTrimString,
  email: optionalTrimString,
  address: optionalTrimString,
  rating: optionalTrimString,
  notes: optionalTrimString,
  salespersonId: z.union([z.string(), z.number()]).optional(),
  salespersonName: optionalTrimString,
}).passthrough();

export const commLogSchema = z.object({
  type: requiredString('沟通类型为必填项'),
  outcome: requiredString('沟通结果为必填项'),
  content: requiredString('沟通内容为必填项'),
}).passthrough();

export const productSchema = z.object({
  name: requiredString('产品名称为必填项'),
  code: requiredString('产品编号为必填项'),
  unitPrice: z.preprocess(
    (value) => value === undefined || value === null || value === '' ? undefined : value,
    numericString
      .refine((value) => Number.isFinite(Number(value)), '产品单价不合法')
      .refine((value) => Number(value) >= 0, '产品单价不能为负数')
      .optional(),
  ).transform((value) => value === undefined ? 0 : Number(value)),
  description: optionalTrimString.default(''),
}).passthrough();

export const updateMaterialSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'ready'], { error: '物料状态不合法' }).optional(),
  urgent: optionalBoolean,
  expectedDate: optionalDateOrNull,
  notes: optionalTrimString,
  name: requiredString('物料名称不能为空').optional(),
  spec: optionalTrimString,
  unit: optionalTrimString,
  required: z.preprocess(
    (value) => value === undefined || value === null || value === '' ? undefined : value,
    z.coerce.number().positive('需求量必须大于 0').optional(),
  ),
}).passthrough();

export const createMaterialSchema = z.object({
  orderId: z.number({ error: '订单ID必填' }).int().positive(),
  orderItemId: z.number().int().positive().optional(),
  name: requiredString('物料名称为必填项'),
  spec: optionalTrimString.default(''),
  unit: optionalTrimString.default('个'),
  required: z.number({ error: '需求量为必填项' }).positive('需求量必须大于 0'),
  notes: optionalTrimString.default(''),
}).passthrough();

export const inventorySchema = z.object({
  name: requiredString('物料名称为必填项'),
  spec: optionalTrimString.default(''),
  unit: optionalTrimString.default('个'),
  quantity: numericString.refine((value) => Number.isFinite(Number(value)) && Number(value) >= 0, '库存数量不能为负数').optional(),
  safetyStock: numericString.refine((value) => Number.isFinite(Number(value)) && Number(value) >= 0, '安全库存不能为负数').optional(),
  notes: optionalTrimString.default(''),
}).passthrough();

export const updateInventorySchema = z.object({
  name: requiredString('物料名称不能为空').optional(),
  spec: optionalTrimString,
  unit: optionalTrimString,
  quantity: optionalNumericString.refine((value) => value === undefined || (Number.isFinite(Number(value)) && Number(value) >= 0), '库存数量不能为负数'),
  safetyStock: optionalNumericString.refine((value) => value === undefined || (Number.isFinite(Number(value)) && Number(value) >= 0), '安全库存不能为负数'),
  notes: optionalTrimString,
}).passthrough();

export const inventoryAdjustSchema = z.object({
  delta: numericString.refine((value) => Number.isFinite(Number(value)), '库存调整数量不合法'),
}).passthrough();

export const excelImportSchema = z.object({
  customerId: customerIdString,
  salespersonId: z.union([z.string(), z.number()]).optional(),
  contractRef: optionalTrimString.default(''),
  deliveryDate: requiredString('交期为必填项').refine((value) => !Number.isNaN(new Date(value).getTime()), '交期格式不合法'),
  items: z.string().optional(),
  previewHash: optionalTrimString,
}).passthrough();
