import { Router } from 'express';
import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { hashPassword, verifyPassword } from '../auth';
import { signToken } from '../lib/jwt';
import { authenticate } from '../middleware/authenticate';
import { requireAdmin } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import {
  ROLE_LABEL,
  deriveManagerPermissions,
  canManageUsers,
  isAccountRole,
  isAccountStatus,
  isManagerSubRole,
  isRegisterRole,
  type AccountRole,
  type AccountStatus,
} from '../lib/userPermissions';
import {
  changePasswordSchema,
  idParamsSchema,
  userCreateSchema,
  userLoginSchema,
  userManageSchema,
  userRegisterSchema,
  userReviewSchema,
} from '../validation/schemas';

const router = Router();

const MAX_LOGIN_FAILURES = 5;
const LOGIN_LOCK_MINUTES = 15;
const PASSWORD_MIN_LENGTH = 8;
const DEFAULT_RESET_PASSWORD = '12345678';
const PASSWORD_REQUIREMENT_MESSAGE = `密码不少于 ${PASSWORD_MIN_LENGTH} 位`;
const DEV_DEFAULT_ADMIN = {
  name: '本地开发管理员',
  phone: 'admin-local-dev',
  password: 'admin-local-dev-password',
  department: '本地开发',
};
const MIN_DEFAULT_ADMIN_PASSWORD_LENGTH = PASSWORD_MIN_LENGTH;
const FORBIDDEN_DEFAULT_ADMIN_VALUES = new Set([
  'admin-phone-or-login',
  'change-me-before-production',
  'replace-with-a-strong-initial-password',
]);

const STATUS_MESSAGE: Record<AccountStatus, string> = {
  pending: '账号待审核',
  enabled: '登录成功',
  rejected: '注册申请未通过',
  disabled: '账号已停用',
};

function publicUser(user: {
  id: number;
  name: string;
  phone: string;
  department: string;
  role: string;
  managerSubRole: string;
  canApproveOrder: boolean;
  canManageUsers: boolean;
  isClerk: boolean;
  canCreateOrderForSales: boolean;
  isAdmin: boolean;
  status: string;
  remark: string;
  lastLoginAt: Date | null;
  mustChangePassword: boolean;
  passwordChangedAt: Date | null;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  pendingPasswordResetRequestCount?: number;
}) {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    department: user.department,
    role: user.role,
    managerSubRole: user.managerSubRole,
    canApproveOrder: user.canApproveOrder,
    canManageUsers: user.canManageUsers,
    isClerk: user.isClerk,
    canCreateOrderForSales: user.canCreateOrderForSales,
    isAdmin: user.isAdmin,
    status: user.status,
    remark: user.remark,
    lastLoginAt: user.lastLoginAt,
    mustChangePassword: user.mustChangePassword,
    passwordChangedAt: user.passwordChangedAt,
    deletedAt: user.deletedAt ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    pendingPasswordResetRequestCount: user.pendingPasswordResetRequestCount ?? 0,
  };
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim();
}

function normalizePhone(value: unknown) {
  return normalizeText(value).replace(/\s+/g, '');
}

function isAdminAccount(user: { role: string; isAdmin: boolean }) {
  return user.isAdmin || user.role === 'admin';
}

function isSystemAdminSelection(role: string, managerSubRole: string) {
  return role === 'manager' && managerSubRole === 'system_admin';
}

function isStrongEnoughPassword(password: string) {
  return password.length >= PASSWORD_MIN_LENGTH;
}

function shouldForcePasswordUpgrade(password: string) {
  return password.length < PASSWORD_MIN_LENGTH;
}

function signUserToken(user: { id: number; role: string; isAdmin: boolean; name: string; tokenVersion: number }) {
  return signToken({
    userId: user.id,
    role: user.role,
    isAdmin: user.isAdmin,
    name: user.name,
    tokenVersion: user.tokenVersion,
  });
}

function requireManagerOrAdmin(req: Request, res: Response) {
  if (!canManageUsers(req.user)) {
    res.status(403).json({ error: '无权管理用户' });
    return false;
  }
  return true;
}

// 用户只读列表（业务员选择/CRM 分配等场景）放宽到所有经理层 + admin
function requireBusinessUserAccess(req: Request, res: Response) {
  const user = req.user;
  const ok = !!user && (
    user.isAdmin
    || user.canManageUsers === true
    || user.canApproveOrder === true
    || user.canCreateOrderForSales === true
    || user.isClerk === true
  );
  if (!ok) {
    res.status(403).json({ error: '无权访问用户列表' });
    return false;
  }
  return true;
}

function activeUserByPhone(phone: string) {
  return prisma.user.findFirst({ where: { phone, deletedAt: null } });
}

async function findUserByLoginIdentifier(identifier: string) {
  const phone = normalizePhone(identifier);
  let user = phone ? await activeUserByPhone(phone) : null;
  if (user) return user;

  const matches = await prisma.user.findMany({
    where: { name: identifier, deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });
  if (matches.length !== 1) return null;
  return matches[0];
}

async function resolvePendingPasswordRequests(userId: number, resolvedBy?: number) {
  await prisma.passwordResetRequest.updateMany({
    where: {
      userId,
      status: 'pending',
    },
    data: {
      status: 'resolved',
      resolvedAt: new Date(),
      resolvedBy: resolvedBy ?? null,
    },
  });
}

function isLoginLocked(user: { loginLockedUntil: Date | null }, now = new Date()) {
  return !!user.loginLockedUntil && user.loginLockedUntil.getTime() > now.getTime();
}

async function clearLoginLock(userId: number) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      loginFailedCount: 0,
      loginLockedUntil: null,
      lastLoginFailedAt: null,
    },
  });
}

async function recordLoginFailure(user: { id: number; loginFailedCount: number }) {
  const failedAt = new Date();
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      loginFailedCount: { increment: 1 },
      lastLoginFailedAt: failedAt,
    },
    select: { loginFailedCount: true },
  });

  const lockedUntil = updated.loginFailedCount >= MAX_LOGIN_FAILURES
    ? new Date(failedAt.getTime() + LOGIN_LOCK_MINUTES * 60 * 1000)
    : null;

  if (lockedUntil) {
    await prisma.user.update({
      where: { id: user.id },
      data: { loginLockedUntil: lockedUntil },
    });
  }

  return { failedCount: updated.loginFailedCount, lockedUntil };
}

type UserTx = Prisma.TransactionClient;

async function inheritCustomersFromDeletedAccounts(
  tx: UserTx,
  user: { id: number; name: string; phone: string; role: string },
) {
  if (user.role !== 'sales') return 0;

  const previousUsers = await tx.user.findMany({
    where: { phone: user.phone, deletedAt: { not: null } },
    select: { id: true },
  });
  if (!previousUsers.length) return 0;

  const previousIds = previousUsers.map((previous) => previous.id);

  const result = await tx.customer.updateMany({
    where: { salespersonId: { in: previousIds } },
    data: {
      salespersonId: user.id,
      salespersonName: user.name,
    },
  });

  return result.count;
}

function requiredProductionEnv(name: string) {
  const value = normalizeText(process.env[name]);
  if (process.env.NODE_ENV === 'production') {
    if (!value) {
      throw new Error(`${name} is required when initializing the default admin in production`);
    }
    if (FORBIDDEN_DEFAULT_ADMIN_VALUES.has(value)) {
      throw new Error(`${name} must be changed from the template value`);
    }
    if (name === 'DEFAULT_ADMIN_PASSWORD' && value.length < MIN_DEFAULT_ADMIN_PASSWORD_LENGTH) {
      throw new Error(`DEFAULT_ADMIN_PASSWORD must be at least ${MIN_DEFAULT_ADMIN_PASSWORD_LENGTH} characters`);
    }
    return value;
  }
  return value;
}

function getDefaultAdminConfig() {
  const phone = requiredProductionEnv('DEFAULT_ADMIN_PHONE') || DEV_DEFAULT_ADMIN.phone;
  const password = requiredProductionEnv('DEFAULT_ADMIN_PASSWORD') || DEV_DEFAULT_ADMIN.password;

  return {
    name: normalizeText(process.env.DEFAULT_ADMIN_NAME) || DEV_DEFAULT_ADMIN.name,
    phone,
    password,
    department: normalizeText(process.env.DEFAULT_ADMIN_DEPARTMENT) || DEV_DEFAULT_ADMIN.department,
  };
}

export async function ensureDefaultAdmin() {
  const count = await prisma.user.count();
  if (count > 0) return;

  const defaultAdmin = getDefaultAdminConfig();

  await prisma.user.create({
    data: {
      name: defaultAdmin.name,
      phone: defaultAdmin.phone,
      passwordHash: hashPassword(defaultAdmin.password),
      department: defaultAdmin.department,
      role: 'admin',
      managerSubRole: 'system_admin',
      canApproveOrder: true,
      canManageUsers: true,
      isAdmin: true,
      status: 'enabled',
      remark: '系统初始化管理员',
      passwordChangedAt: new Date(),
    },
  });
}

router.post('/register', validate('body', userRegisterSchema), async (req, res) => {
  try {
    const name = normalizeText(req.body.name);
    const phone = normalizePhone(req.body.phone);
    const password = String(req.body.password ?? '');
    const confirmPassword = String(req.body.confirmPassword ?? '');
    const department = normalizeText(req.body.department);
    const role = normalizeText(req.body.role) as AccountRole;
    const managerSubRole = normalizeText(req.body.managerSubRole);
    const remark = normalizeText(req.body.remark);

    if (!name || !phone || !password || !confirmPassword || !department || !role) {
      return res.status(400).json({ error: '姓名、手机号、密码、部门和身份角色为必填项' });
    }
    if (!isStrongEnoughPassword(password)) return res.status(400).json({ error: PASSWORD_REQUIREMENT_MESSAGE });
    if (password !== confirmPassword) return res.status(400).json({ error: '两次输入的密码不一致' });
    if (!isRegisterRole(role)) {
      return res.status(400).json({ error: '身份角色不合法' });
    }
    if (role === 'manager' && !isManagerSubRole(managerSubRole)) {
      return res.status(400).json({ error: '请选择经理层二级身份' });
    }

    const exists = await activeUserByPhone(phone);
    if (exists) return res.status(409).json({ error: '手机号已注册' });

    const user = await prisma.user.create({
      data: {
        name,
        phone,
        passwordHash: hashPassword(password),
        department,
        role,
        managerSubRole: role === 'manager' ? managerSubRole : '',
        canApproveOrder: false,
        canManageUsers: false,
        isClerk: false,
        canCreateOrderForSales: false,
        isAdmin: false,
        status: 'pending',
        remark,
      },
    });

    res.status(201).json({
      message: '注册申请已提交，请等待管理员审核',
      user: publicUser(user),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// Demo registration: one-click create a read-only viewer account and return a JWT.
// Demo accounts have role='demo' and status='enabled' (no admin approval needed).
// The authenticate middleware enforces read-only by blocking non-GET requests at runtime
// and grants view-side permissions so they can browse every role's pages.
router.post('/register-demo', async (req, res) => {
  try {
    const rawName = normalizeText(req.body?.name);
    const suffix = Math.random().toString(36).slice(2, 8);
    const name = rawName ? `${rawName}（试用）` : `试用用户-${suffix}`;
    const phone = `demo-${Date.now()}-${suffix}`;
    const password = `demo-${Math.random().toString(36).slice(2)}`;

    const user = await prisma.user.create({
      data: {
        name,
        phone,
        passwordHash: hashPassword(password),
        department: '试用体验',
        role: 'demo',
        managerSubRole: '',
        canApproveOrder: false,
        canManageUsers: false,
        isClerk: false,
        canCreateOrderForSales: false,
        isAdmin: false,
        status: 'enabled',
        remark: 'Demo account · auto-created',
        passwordChangedAt: new Date(),
      },
    });

    const token = signUserToken(user);

    res.status(201).json({
      message: '已为你创建试用账号，正在进入只读模式',
      user: publicUser(user),
      token,
    });
  } catch (error) {
    console.error('register-demo failed', error);
    res.status(500).json({ error: '服务器错误，无法创建试用账号' });
  }
});

router.post('/password-reset-requests', async (req, res) => {
  try {
    const identifier = normalizeText(req.body.identifier);
    if (!identifier) return res.status(400).json({ error: '请先输入姓名或手机号' });

    const user = await findUserByLoginIdentifier(identifier);
    if (!user || user.deletedAt) {
      return res.status(404).json({ error: '未找到该账号，请确认姓名或手机号' });
    }
    if (user.status !== 'enabled') {
      return res.status(400).json({ error: STATUS_MESSAGE[user.status as AccountStatus] || '账号状态异常，暂不能申请重置密码' });
    }

    const existing = await prisma.passwordResetRequest.findFirst({
      where: { userId: user.id, status: 'pending' },
      orderBy: { requestedAt: 'desc' },
    });

    if (existing) {
      await prisma.passwordResetRequest.update({
        where: { id: existing.id },
        data: { identifier, requestedAt: new Date() },
      });
    } else {
      await prisma.passwordResetRequest.create({
        data: {
          userId: user.id,
          identifier,
        },
      });
    }

    return res.json({ message: '已通知管理员，请联系管理员重置密码' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: '服务器错误' });
  }
});

router.post('/login', validate('body', userLoginSchema), async (req, res) => {
  try {
    const login = normalizeText(req.body.login);
    const password = String(req.body.password ?? '');
    if (!login || !password) return res.status(400).json({ error: '请输入姓名或手机号和密码' });

    let user = await activeUserByPhone(normalizePhone(login));
    if (!user) {
      const matches = await prisma.user.findMany({
        where: { name: login, deletedAt: null },
        orderBy: { createdAt: 'asc' },
      });
      if (matches.length > 1) {
        return res.status(409).json({ error: '姓名存在重名，请使用手机号登录', code: 'NAME_DUPLICATE' });
      }
      user = matches[0] ?? null;
    }

    if (!user || user.deletedAt) {
      return res.status(401).json({ error: '账号或密码错误' });
    }

    if (isLoginLocked(user)) {
      return res.status(423).json({
        error: `登录失败次数过多，请 ${LOGIN_LOCK_MINUTES} 分钟后重试`,
        code: 'ACCOUNT_LOCKED',
      });
    }
    if (user.loginLockedUntil) {
      await clearLoginLock(user.id);
      user.loginFailedCount = 0;
      user.loginLockedUntil = null;
      user.lastLoginFailedAt = null;
    }

    if (!verifyPassword(password, user.passwordHash)) {
      const failure = await recordLoginFailure(user);
      if (failure.lockedUntil) {
        return res.status(423).json({
          error: `登录失败次数过多，请 ${LOGIN_LOCK_MINUTES} 分钟后重试`,
          code: 'ACCOUNT_LOCKED',
        });
      }
      return res.status(401).json({ error: '账号或密码错误' });
    }

    if (user.status !== 'enabled') {
      const status = user.status as AccountStatus;
      return res.status(403).json({
        error: STATUS_MESSAGE[status] || '账号状态异常',
        code: `ACCOUNT_${user.status.toUpperCase()}`,
        status: user.status,
      });
    }

    const mustChangePassword = user.mustChangePassword || shouldForcePasswordUpgrade(password);
    const loggedIn = await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        loginFailedCount: 0,
        lastLoginFailedAt: null,
        loginLockedUntil: null,
        mustChangePassword,
      },
    });

    const token = signToken({
      userId: loggedIn.id,
      role: loggedIn.role,
      isAdmin: loggedIn.isAdmin,
      name: loggedIn.name,
      tokenVersion: loggedIn.tokenVersion,
    });

    res.json({ user: publicUser(loggedIn), token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.use(authenticate);

router.use((req, res, next) => {
  if (!req.user?.mustChangePassword) return next();
  if (req.method === 'PATCH' && req.path === '/me/password') return next();
  return res.status(403).json({
    error: '请先修改初始密码',
    code: 'PASSWORD_CHANGE_REQUIRED',
  });
});

router.patch('/me/password', validate('body', changePasswordSchema), async (req, res) => {
  try {
    const oldPassword = String(req.body.oldPassword ?? '');
    const newPassword = String(req.body.newPassword ?? '');
    const confirmPassword = String(req.body.confirmPassword ?? '');

    if (!oldPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: '旧密码、新密码和确认密码为必填项' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: '两次输入的新密码不一致' });
    }
    if (!isStrongEnoughPassword(newPassword)) {
      return res.status(400).json({ error: `新${PASSWORD_REQUIREMENT_MESSAGE}` });
    }

    const current = await prisma.user.findFirst({
      where: { id: req.user?.userId, status: 'enabled', deletedAt: null },
    });
    if (!current) return res.status(401).json({ error: '登录状态已失效' });
    if (!verifyPassword(oldPassword, current.passwordHash)) {
      return res.status(400).json({ error: '旧密码不正确' });
    }
    if (verifyPassword(newPassword, current.passwordHash)) {
      return res.status(400).json({ error: '新密码不能与旧密码相同' });
    }

    const updated = await prisma.user.update({
      where: { id: current.id },
      data: {
        passwordHash: hashPassword(newPassword),
        mustChangePassword: false,
        passwordChangedAt: new Date(),
        tokenVersion: { increment: 1 },
        loginFailedCount: 0,
        lastLoginFailedAt: null,
        loginLockedUntil: null,
      },
    });

    res.json({
      message: '密码已修改',
      user: publicUser(updated),
      token: signUserToken(updated),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.get('/', async (req, res) => {
  try {
    // 业务员/客户分配等场景 clerk / approval_manager 也需要拉用户列表，单独放宽这个只读接口
    if (!requireBusinessUserAccess(req, res)) return;

    const status = normalizeText(req.query.status);
    const role = normalizeText(req.query.role);
    const q = normalizeText(req.query.q);
    const where: Prisma.UserWhereInput = { deletedAt: null };
    if (isAccountStatus(status)) where.status = status;
    if (isAccountRole(role)) where.role = role;
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
      ];
    }
    const users = await prisma.user.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
    const resetRequests = await prisma.passwordResetRequest.groupBy({
      by: ['userId'],
      where: {
        status: 'pending',
        userId: { not: null },
      },
      _count: { _all: true },
    });
    const resetCountByUserId = new Map(resetRequests.map((item) => [item.userId, item._count._all]));
    res.json(users.map((user) => publicUser({
      ...user,
      pendingPasswordResetRequestCount: resetCountByUserId.get(user.id) || 0,
    })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.patch('/:id/review', validate('params', idParamsSchema), validate('body', userReviewSchema), async (req, res) => {
  try {
    if (!requireManagerOrAdmin(req, res)) return;

    const id = Number(req.params.id);
    const action = normalizeText(req.body.action);
    const nextRole = normalizeText(req.body.role) as AccountRole;
    const managerSubRole = normalizeText(req.body.managerSubRole);
    const requestedCanApproveOrder = req.body.canApproveOrder === true;
    if (!Number.isInteger(id)) return res.status(400).json({ error: '用户ID不合法' });
    if (!['approve', 'reject', 'disable'].includes(action)) return res.status(400).json({ error: '审核操作不合法' });
    if (action === 'approve' && !isAccountRole(nextRole)) {
      return res.status(400).json({ error: '身份角色不合法' });
    }
    if (action === 'approve' && nextRole === 'manager' && !isManagerSubRole(managerSubRole)) {
      return res.status(400).json({ error: '请选择经理层二级身份' });
    }

    const target = await prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!target) return res.status(404).json({ error: '用户不存在' });
    if (!req.user?.isAdmin) {
      if (isAdminAccount(target)) {
        return res.status(403).json({ error: '无权审核或禁用管理员账号' });
      }
      if (action === 'approve' && nextRole === 'admin') {
        return res.status(403).json({ error: '仅管理员可以创建管理员账号' });
      }
      if (action === 'approve' && nextRole === 'manager' && managerSubRole === 'system_admin' && !req.user?.canManageUsers) {
        return res.status(403).json({ error: '仅系统管理员可以设置用户管理权限' });
      }
    }

    const data = action === 'approve'
      ? {
          status: 'enabled',
          role: nextRole,
          ...deriveManagerPermissions({
            role: nextRole,
            managerSubRole,
            canApproveOrder: requestedCanApproveOrder,
          }),
          isAdmin: nextRole === 'admin' || isSystemAdminSelection(nextRole, managerSubRole),
          tokenVersion: { increment: 1 },
        }
      : action === 'reject'
        ? { status: 'rejected' }
        : { status: 'disabled' };

    const { user, inheritedCount } = await prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({ where: { id }, data });
      const inherited = action === 'approve' && updatedUser.role === 'sales'
        ? await inheritCustomersFromDeletedAccounts(tx, updatedUser)
        : 0;
      return { user: updatedUser, inheritedCount: inherited };
    });
    const suffix = inheritedCount > 0 ? `，已继承${inheritedCount}个历史客户` : '';
    res.json({ message: `${ROLE_LABEL[user.role as AccountRole] || '用户'}账号已更新${suffix}`, user: publicUser(user) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.post('/', requireAdmin, validate('body', userCreateSchema), async (req, res) => {
  try {
    const name = normalizeText(req.body.name);
    const phone = normalizePhone(req.body.phone);
    const role = normalizeText(req.body.role) as AccountRole;
    const managerSubRole = normalizeText(req.body.managerSubRole);
    const requestedCanApproveOrder = req.body.canApproveOrder === true;
    const password = String(req.body.password ?? '');
    const remark = normalizeText(req.body.remark);

    if (!name || !phone || !role || !password) {
      return res.status(400).json({ error: '姓名、手机号、角色和初始密码为必填项' });
    }
    if (!isAccountRole(role)) return res.status(400).json({ error: '身份角色不合法' });
    if (role === 'manager' && !isManagerSubRole(managerSubRole)) {
      return res.status(400).json({ error: '请选择经理层二级身份' });
    }
    if (!isStrongEnoughPassword(password)) return res.status(400).json({ error: `初始${PASSWORD_REQUIREMENT_MESSAGE}` });

    const exists = await activeUserByPhone(phone);
    if (exists) return res.status(409).json({ error: '手机号已注册' });

    const user = await prisma.user.create({
      data: {
        name,
        phone,
        passwordHash: hashPassword(password),
        department: '未填写',
        role,
        ...deriveManagerPermissions({ role, managerSubRole, canApproveOrder: requestedCanApproveOrder }),
        isAdmin: role === 'admin' || isSystemAdminSelection(role, managerSubRole),
        status: 'enabled',
        remark,
        mustChangePassword: true,
      },
    });

    res.status(201).json({ message: '账号已创建，请提醒用户首次登录后修改密码', user: publicUser(user) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.patch('/:id/manage', validate('params', idParamsSchema), validate('body', userManageSchema), async (req, res) => {
  try {
    if (!requireManagerOrAdmin(req, res)) return;

    const id = Number(req.params.id);
    const action = normalizeText(req.body.action);
    const role = normalizeText(req.body.role) as AccountRole;
    const managerSubRole = normalizeText(req.body.managerSubRole);
    const requestedCanApproveOrder = req.body.canApproveOrder === true;
    if (!Number.isInteger(id)) return res.status(400).json({ error: '用户ID不合法' });

    const user = await prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) return res.status(404).json({ error: '用户不存在' });
    if (!req.user?.isAdmin && isAdminAccount(user)) {
      return res.status(403).json({ error: '无权管理管理员账号' });
    }

    if (action === 'update_role') {
      if (!isAccountRole(role)) return res.status(400).json({ error: '身份角色不合法' });
      if (role === 'manager' && !isManagerSubRole(managerSubRole)) {
        return res.status(400).json({ error: '请选择经理层二级身份' });
      }
      if (id === req.user?.userId) return res.status(400).json({ error: '不能修改当前登录账号角色' });
      if (!req.user?.isAdmin && role === 'admin') return res.status(403).json({ error: '仅管理员可以设置管理员角色' });
      if (!req.user?.isAdmin && role === 'manager' && managerSubRole === 'system_admin' && !req.user?.canManageUsers) {
        return res.status(403).json({ error: '仅系统管理员可以设置用户管理权限' });
      }
      const updated = await prisma.user.update({
        where: { id },
        data: {
          role,
          ...deriveManagerPermissions({ role, managerSubRole, canApproveOrder: requestedCanApproveOrder }),
          isAdmin: role === 'admin' || isSystemAdminSelection(role, managerSubRole),
          tokenVersion: { increment: 1 },
        },
      });
      return res.json({ message: '角色已更新', user: publicUser(updated) });
    }

    if (action === 'enable' || action === 'disable') {
      if (action === 'disable' && id === req.user?.userId) {
        return res.status(400).json({ error: '不能禁用当前登录账号' });
      }
      const updated = await prisma.user.update({
        where: { id },
        data: { status: action === 'enable' ? 'enabled' : 'disabled' },
      });
      return res.json({ message: action === 'enable' ? '账号已启用' : '账号已禁用', user: publicUser(updated) });
    }

    if (action === 'reset_password') {
      if (!req.user?.isAdmin) return res.status(403).json({ error: '仅管理员可以重置密码' });
      if (id === req.user.userId) return res.status(400).json({ error: '不能重置当前登录账号，请使用修改密码' });
      const updated = await prisma.user.update({
        where: { id },
        data: {
          passwordHash: hashPassword(DEFAULT_RESET_PASSWORD),
          mustChangePassword: true,
          passwordChangedAt: new Date(),
          tokenVersion: { increment: 1 },
          loginFailedCount: 0,
          lastLoginFailedAt: null,
          loginLockedUntil: null,
        },
      });
      await resolvePendingPasswordRequests(id, req.user.userId);
      return res.json({ message: `密码已重置为 ${DEFAULT_RESET_PASSWORD}，用户下次登录后必须修改密码`, user: publicUser(updated) });
    }

    return res.status(400).json({ error: '管理操作不合法' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.delete('/:id', requireAdmin, validate('params', idParamsSchema), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: '用户ID不合法' });
    if (id === req.user?.userId) return res.status(400).json({ error: '不能删除当前登录账号' });

    const target = await prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!target) return res.status(404).json({ error: '用户不存在' });
    if (target.isAdmin || target.role === 'admin') {
      return res.status(400).json({ error: '管理员账号不能删除，请使用禁用功能' });
    }

    await prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'disabled' },
    });

    res.json({ message: '账号已删除' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '服务器错误' });
  }
});

export default router;
