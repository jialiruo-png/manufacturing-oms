import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Badge, Button, Form, Input, Modal, Popconfirm, Select, Space, Switch, Table, Tabs, Tag, Typography, message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { usersApi } from '../api';
import type { AccountRole, DataChangeHandler, ManagerSubRole, User, UserStatus } from '../types';
import { formatDate } from '../utils/order';
import { ACCOUNT_ROLE_LABEL, MANAGER_SUB_ROLE_LABEL, MANAGER_SUB_ROLE_OPTIONS, displayRole } from '../utils/permissions';

const { Text } = Typography;

const ROLE_LABEL = ACCOUNT_ROLE_LABEL;

const STATUS_LABEL: Record<UserStatus, string> = {
  pending: '待审核',
  enabled: '已启用',
  rejected: '已驳回',
  disabled: '已禁用',
};

const STATUS_COLOR: Record<UserStatus, string> = {
  pending: 'orange',
  enabled: 'green',
  rejected: 'red',
  disabled: 'default',
};

const ROLE_OPTIONS = [
  { value: 'sales', label: '业务员' },
  { value: 'purchase', label: '采购' },
  { value: 'production', label: '生产' },
  { value: 'logistics', label: '物流' },
  { value: 'manager', label: '经理层' },
  { value: 'admin', label: '管理员' },
] satisfies { value: AccountRole; label: string }[];

const STATUS_OPTIONS = [
  { value: 'pending', label: '待审核' },
  { value: 'enabled', label: '已启用' },
  { value: 'rejected', label: '已驳回' },
  { value: 'disabled', label: '已禁用' },
] satisfies { value: UserStatus; label: string }[];

const PERMISSION_ROWS = [
  { role: 'sales', pages: '业务员页面', desc: '录入订单草稿、维护客户信息、提交订单审批。' },
  { role: 'purchase', pages: '业务员页面 + 采购页面', desc: '查看业务订单，处理采购备料、物料状态和库存相关任务。' },
  { role: 'production', pages: '生产页面', desc: '查看待生产订单，推进生产开始、完工和复审流转。' },
  { role: 'logistics', pages: '物流页面', desc: '处理待发货订单，登记物流信息并确认发货。' },
  { role: 'manager', subRole: 'approval_manager', pages: '数据看板 + 审批管理', desc: '审批订单和发货，不管理用户。' },
  { role: 'manager', subRole: 'clerk', pages: '数据看板 + 业务员页面 + 采购 + 生产 + 物流 + 审批管理', desc: '内勤跟单，拥有全部业务模块权限，不管理用户。' },
  { role: 'manager', subRole: 'system_admin', pages: '全部页面 + 用户管理', desc: '拥有管理员级业务权限，可管理用户、审批订单并处理各业务环节。' },
  { role: 'admin', pages: '全部页面 + 用户管理', desc: '拥有全部权限，可创建用户/admin、修改角色、启用禁用、重置密码。' },
] as { role: AccountRole; subRole?: ManagerSubRole; pages: string; desc: string }[];

type CreateUserValues = {
  name: string;
  phone: string;
  role: AccountRole;
  managerSubRole?: ManagerSubRole;
  canApproveOrder?: boolean;
  password: string;
  remark?: string;
};

const renderDate = (value?: string | Date | null) => (
  <span className="user-table-date">{formatDate(value, 'YYYY-MM-DD HH:mm')}</span>
);

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error && 'response' in error) {
    const response = (error as { response?: { data?: { error?: string } } }).response;
    return response?.data?.error || fallback;
  }
  return fallback;
}

export default function UserReviewPage({
  refreshKey = 0,
  currentUser,
  onDataChanged,
}: {
  refreshKey?: number;
  currentUser: User;
  onDataChanged: DataChangeHandler;
}) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>();
  const [statusFilter, setStatusFilter] = useState<string>();
  const [roleDraft, setRoleDraft] = useState<Record<number, AccountRole>>({});
  const [managerSubRoleDraft, setManagerSubRoleDraft] = useState<Record<number, ManagerSubRole>>({});
  const [canApproveDraft, setCanApproveDraft] = useState<Record<number, boolean>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [createForm] = Form.useForm<CreateUserValues>();

  const isAdmin = currentUser.isAdmin;
  const availableRoles = useMemo(
    () => isAdmin ? ROLE_OPTIONS : ROLE_OPTIONS.filter((role) => role.value !== 'admin'),
    [isAdmin],
  );
  const createRoleOptions = isAdmin ? ROLE_OPTIONS : ROLE_OPTIONS.filter((role) => role.value !== 'admin');

  const load = async (params?: { status?: string }) => {
    setLoading(true);
    try {
      const data = await usersApi.list({
        q: q || undefined,
        role: roleFilter,
        status: params?.status ?? statusFilter,
      });
      setUsers(data);
      setRoleDraft(Object.fromEntries(data.map((user) => [user.id, user.role])) as Record<number, AccountRole>);
      setManagerSubRoleDraft(Object.fromEntries(data.map((user) => [user.id, user.managerSubRole])) as Record<number, ManagerSubRole>);
      setCanApproveDraft(Object.fromEntries(data.map((user) => [user.id, user.canApproveOrder])) as Record<number, boolean>);
    } catch (error) {
      message.error(getErrorMessage(error, '加载用户列表失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [currentUser.id, currentUser.isAdmin, roleFilter, statusFilter, refreshKey]);

  const review = async (user: User, action: 'approve' | 'reject') => {
    try {
      const nextRole = roleDraft[user.id] || user.role;
      const result = await usersApi.review(user.id, {
        action,
        role: nextRole,
        managerSubRole: nextRole === 'manager' ? managerSubRoleDraft[user.id] || user.managerSubRole : '',
        canApproveOrder: canApproveDraft[user.id] ?? user.canApproveOrder,
      });
      message.success(result.message);
      await load();
      onDataChanged('user_management_changed', 'user-review');
    } catch (error) {
      message.error(getErrorMessage(error, '操作失败'));
    }
  };

  const manage = async (user: User, action: 'update_role' | 'enable' | 'disable' | 'reset_password') => {
    try {
      const result = await usersApi.manage(user.id, {
        action,
        role: roleDraft[user.id] || user.role,
        managerSubRole: (roleDraft[user.id] || user.role) === 'manager' ? managerSubRoleDraft[user.id] || user.managerSubRole : '',
        canApproveOrder: canApproveDraft[user.id] ?? user.canApproveOrder,
      });
      message.success(result.message);
      await load();
      onDataChanged('user_management_changed', 'user-review');
    } catch (error) {
      message.error(getErrorMessage(error, '操作失败'));
    }
  };

  const createUser = async () => {
    const values = await createForm.validateFields();
    try {
      const result = await usersApi.create({
        ...values,
        managerSubRole: values.role === 'manager' ? values.managerSubRole : '',
        canApproveOrder: values.role === 'manager' ? values.canApproveOrder : false,
      });
      message.success(result.message);
      setCreateOpen(false);
      createForm.resetFields();
      await load();
      onDataChanged('user_management_changed', 'user-review');
    } catch (error) {
      message.error(getErrorMessage(error, '创建账号失败'));
    }
  };

  const isAdminAccount = (user: User) => user.isAdmin || user.role === 'admin';
  const isProtectedAdmin = (user: User) => !isAdmin && isAdminAccount(user);
  const canManageUser = (user: User) => !isProtectedAdmin(user) && user.id !== currentUser.id;
  const canResetPassword = (user: User) => isAdmin && user.id !== currentUser.id;
  const canDeleteUser = (user: User) => isAdmin && !user.isAdmin && user.role !== 'admin' && user.id !== currentUser.id;
  const setDraftRole = (userId: number, role: AccountRole) => {
    setRoleDraft((draft) => ({ ...draft, [userId]: role }));
    if (role !== 'manager') {
      setManagerSubRoleDraft((draft) => ({ ...draft, [userId]: '' }));
      setCanApproveDraft((draft) => ({ ...draft, [userId]: false }));
    } else {
      setManagerSubRoleDraft((draft) => ({ ...draft, [userId]: draft[userId] || 'approval_manager' }));
    }
  };

  const managerSubRoleSelect = (user: User) => {
    const role = roleDraft[user.id] || user.role;
    if (role !== 'manager') return <Text type="secondary">—</Text>;
    return (
      <Select
        size="small"
        style={{ width: 120 }}
        value={managerSubRoleDraft[user.id] || user.managerSubRole || 'approval_manager'}
        options={MANAGER_SUB_ROLE_OPTIONS}
        disabled={isProtectedAdmin(user)}
        onChange={(managerSubRole) => {
          setManagerSubRoleDraft((draft) => ({ ...draft, [user.id]: managerSubRole }));
          if (managerSubRole !== 'system_admin') {
            setCanApproveDraft((draft) => ({ ...draft, [user.id]: managerSubRole === 'approval_manager' }));
          } else {
            setCanApproveDraft((draft) => ({ ...draft, [user.id]: true }));
          }
        }}
      />
    );
  };

  const canApproveSwitch = (user: User) => {
    const role = roleDraft[user.id] || user.role;
    const subRole = managerSubRoleDraft[user.id] || user.managerSubRole;
    if (role !== 'manager') return <Text type="secondary">—</Text>;
    return (
      <Switch
        size="small"
        checked={subRole === 'approval_manager' || subRole === 'system_admin' || (canApproveDraft[user.id] ?? user.canApproveOrder)}
        disabled={isProtectedAdmin(user) || subRole === 'approval_manager' || subRole === 'system_admin' || subRole === 'clerk'}
        onChange={(checked) => setCanApproveDraft((draft) => ({ ...draft, [user.id]: checked }))}
      />
    );
  };

  const deleteUser = async () => {
    if (!deleteTarget) return;
    const confirmed = deleteConfirm.trim();
    if (confirmed !== deleteTarget.name && confirmed !== deleteTarget.phone) {
      message.error('请输入该账号的姓名或手机号以确认删除');
      return;
    }
    setDeleting(true);
    try {
      const result = await usersApi.delete(deleteTarget.id);
      message.success(result.message);
      setDeleteTarget(null);
      setDeleteConfirm('');
      await load();
      onDataChanged('user_management_changed', 'user-review');
    } catch (error) {
      message.error(getErrorMessage(error, '删除账号失败'));
    } finally {
      setDeleting(false);
    }
  };

  const pendingColumns: ColumnsType<User> = [
    { title: '姓名', dataIndex: 'name', width: 120, render: (v) => <Text strong>{v}</Text> },
    { title: '手机号', dataIndex: 'phone', width: 134 },
    {
      title: '申请角色',
      dataIndex: 'role',
      width: 104,
      render: (_, user) => (
        <Select
          size="small"
          style={{ width: '100%' }}
          value={roleDraft[user.id] || user.role}
          options={availableRoles}
          disabled={isProtectedAdmin(user)}
          onChange={(role) => setDraftRole(user.id, role)}
        />
      ),
    },
    { title: '经理层身份', width: 100, render: (_, user) => managerSubRoleSelect(user) },
    { title: '审批权', width: 58, render: (_, user) => canApproveSwitch(user) },
    { title: '注册备注', dataIndex: 'remark', ellipsis: true, render: (v) => v || '—' },
    { title: '注册时间', dataIndex: 'createdAt', width: 116, render: renderDate },
    {
      title: '状态',
      dataIndex: 'status',
      width: 70,
      render: (status: UserStatus) => <Tag color={STATUS_COLOR[status]}>{STATUS_LABEL[status]}</Tag>,
    },
    {
      title: '操作',
      width: 126,
      render: (_, user) => (
        <Space size={6}>
          <Button size="small" type="primary" disabled={isProtectedAdmin(user)} onClick={() => review(user, 'approve')}>通过</Button>
          <Button size="small" danger disabled={isProtectedAdmin(user)} onClick={() => review(user, 'reject')}>驳回</Button>
        </Space>
      ),
    },
  ];

  const allColumns: ColumnsType<User> = [
    { title: '姓名', dataIndex: 'name', width: 120, render: (v) => <Text strong>{v}</Text> },
    { title: '手机号', dataIndex: 'phone', width: 134 },
    {
      title: '角色',
      dataIndex: 'role',
      width: 104,
      render: (_, user) => isProtectedAdmin(user) ? displayRole(user) : (
        <Select
          size="small"
          style={{ width: '100%' }}
          value={roleDraft[user.id] || user.role}
          options={availableRoles}
          onChange={(role) => setDraftRole(user.id, role)}
        />
      ),
    },
    { title: '经理层身份', width: 100, render: (_, user) => managerSubRoleSelect(user) },
    { title: '审批权', width: 58, render: (_, user) => canApproveSwitch(user) },
    { title: '注册时间', dataIndex: 'createdAt', width: 116, render: renderDate },
    { title: '最近登录', dataIndex: 'lastLoginAt', width: 116, render: renderDate },
    {
      title: '状态',
      dataIndex: 'status',
      width: 70,
      render: (status: UserStatus) => <Tag color={STATUS_COLOR[status]}>{STATUS_LABEL[status]}</Tag>,
    },
    {
      title: '操作',
      render: (_, user) => (
        <Space size={[4, 4]} wrap>
          <Button size="small" disabled={!canManageUser(user)} onClick={() => manage(user, 'update_role')}>改角色</Button>
          {user.status === 'enabled' ? (
            <Popconfirm
              title="确认禁用该账号？"
              description="禁用后该用户将无法登录系统。"
              okText="禁用"
              cancelText="取消"
              onConfirm={() => manage(user, 'disable')}
            >
              <Button size="small" disabled={!canManageUser(user)}>禁用</Button>
            </Popconfirm>
          ) : (
            <Button size="small" disabled={!canManageUser(user)} onClick={() => manage(user, 'enable')}>启用</Button>
          )}
          {isAdmin && (
            <Popconfirm
              title="确认重置密码？"
              description="密码将重置为 12345678，用户下次登录后必须修改密码。"
              okText="重置"
              cancelText="取消"
              onConfirm={() => manage(user, 'reset_password')}
            >
              <Badge
                count={user.pendingPasswordResetRequestCount || 0}
                size="small"
                offset={[-2, 2]}
              >
                <Button size="small" disabled={!canResetPassword(user)}>重置密码</Button>
              </Badge>
            </Popconfirm>
          )}
          {isAdmin && (
            <Button
              size="small"
              danger
              disabled={!canDeleteUser(user)}
              onClick={() => { setDeleteTarget(user); setDeleteConfirm(''); }}
            >
              删除
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const permissionColumns: ColumnsType<(typeof PERMISSION_ROWS)[number]> = [
    {
      title: '角色',
      width: 170,
      render: (_, row) => (
        <Tag color={row.role === 'admin' ? 'red' : row.role === 'manager' ? 'purple' : 'blue'}>
          {row.subRole ? `${MANAGER_SUB_ROLE_LABEL[row.subRole]}（经理层）` : ROLE_LABEL[row.role]}
        </Tag>
      ),
    },
    { title: '可见页面', dataIndex: 'pages', width: 340 },
    { title: '权限说明', dataIndex: 'desc' },
  ];

  const filterBar = (
    <div className="ymt-filter-bar">
      <label className="ymt-filter ymt-search-filter">
        <svg className="ymt-search-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" /><path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        <input
          className="ymt-search-text"
          placeholder="按姓名 / 手机号搜索"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') load(); }}
        />
      </label>
      <label className="ymt-filter ymt-select-filter" style={{ minWidth: 160 }}>
        <span className="ymt-filter-label">角色</span>
        <span className="ymt-filter-value">{ROLE_OPTIONS.find((o) => o.value === roleFilter)?.label || '全部'}</span>
        <svg className="ymt-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <select className="ymt-select-native" value={roleFilter || ''} onChange={(e) => setRoleFilter(e.target.value || undefined)}>
          <option value="">全部</option>
          {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <label className="ymt-filter ymt-select-filter" style={{ minWidth: 150 }}>
        <span className="ymt-filter-label">状态</span>
        <span className="ymt-filter-value">{STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label || '全部'}</span>
        <svg className="ymt-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <select className="ymt-select-native" value={statusFilter || ''} onChange={(e) => setStatusFilter(e.target.value || undefined)}>
          <option value="">全部</option>
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      {isAdmin && (
        <button className="ymt-create-btn" type="button" onClick={() => setCreateOpen(true)}>
          + 新增用户
        </button>
      )}
    </div>
  );

  const pendingUsers = users.filter((user) => user.status === 'pending');

  return (
    <div className="user-management-panel">
      <section className="sales-shell-card">
        <div className="sales-page-head">
          <div>
            <h1>用户管理</h1>
            <div className="sales-page-subtitle">
              {isAdmin ? '审核员工注册申请，管理账号角色、状态与密码' : '审核普通员工注册申请，管理员账号不可操作'}
            </div>
          </div>
          <div className="sales-page-date">{dayjs().format('YYYY年MM月DD日')}</div>
        </div>

        <div style={{ padding: '0 24px 0' }}>
          <Alert
            type="warning"
            showIcon
            message="默认管理员账号仅用于系统初始化，建议上线后尽快修改默认密码，或创建新的管理员后禁用默认管理员。"
            style={{ marginBottom: 16 }}
          />
        </div>

        <Tabs
          className="sales-sub-tabs"
          items={[
            {
              key: 'pending',
              label: `待审核用户${pendingUsers.length > 0 ? ` (${pendingUsers.length})` : ''}`,
              children: (
                <div className="sales-list-panel">
                  {filterBar}
                  <Table
                    className="sales-data-table"
                    rowKey="id"
                    loading={loading}
                    columns={pendingColumns}
                    dataSource={pendingUsers}
                    pagination={{ pageSize: 20, size: 'small' }}
                    locale={{ emptyText: '暂无待审核用户' }}
                  />
                </div>
              ),
            },
            {
              key: 'all',
              label: `全部用户${users.length > 0 ? ` (${users.length})` : ''}`,
              children: (
                <div className="sales-list-panel">
                  {filterBar}
                  <Table
                    className="sales-data-table"
                    rowKey="id"
                    loading={loading}
                    columns={allColumns}
                    dataSource={users}
                    pagination={{ pageSize: 20, size: 'small' }}
                    locale={{ emptyText: '暂无用户数据' }}
                  />
                </div>
              ),
            },
            {
              key: 'permissions',
              label: '角色与权限说明',
              children: (
                <div className="sales-list-panel" style={{ paddingTop: 24, paddingBottom: 16 }}>
                  <Table
                    className="sales-data-table"
                    rowKey={(row) => row.subRole ? `${row.role}:${row.subRole}` : row.role}
                    columns={permissionColumns}
                    dataSource={PERMISSION_ROWS}
                    pagination={false}
                  />
                </div>
              ),
            },
          ]}
        />

      </section>

      <Modal
        open={createOpen}
        title={isAdmin ? '新增管理员/新增用户' : '新增用户'}
        okText="创建账号"
        cancelText="取消"
        onCancel={() => setCreateOpen(false)}
        onOk={createUser}
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" requiredMark={false}>
          <Form.Item label="姓名" name="name" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input placeholder="请输入姓名" />
          </Form.Item>
          <Form.Item label="手机号" name="phone" rules={[{ required: true, message: '请输入手机号' }]}>
            <Input placeholder="手机号必须唯一" />
          </Form.Item>
          <Form.Item label="角色" name="role" rules={[{ required: true, message: '请选择角色' }]}>
            <Select
              placeholder="请选择角色"
              options={createRoleOptions}
              onChange={(role) => {
                if (role !== 'manager') {
                  createForm.setFieldsValue({ managerSubRole: '', canApproveOrder: false });
                } else {
                  createForm.setFieldsValue({ managerSubRole: 'approval_manager', canApproveOrder: true });
                }
              }}
            />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, next) => prev.role !== next.role || prev.managerSubRole !== next.managerSubRole}>
            {({ getFieldValue }) => getFieldValue('role') === 'manager' ? (
              <>
                <Form.Item label="经理层二级身份" name="managerSubRole" rules={[{ required: true, message: '请选择经理层二级身份' }]}>
                  <Select
                    placeholder="请选择二级身份"
                    options={MANAGER_SUB_ROLE_OPTIONS}
                    onChange={(managerSubRole) => {
                      if (managerSubRole === 'approval_manager') {
                        createForm.setFieldValue('canApproveOrder', true);
                      } else if (managerSubRole === 'clerk') {
                        createForm.setFieldValue('canApproveOrder', false);
                      } else if (managerSubRole === 'system_admin') {
                        createForm.setFieldValue('canApproveOrder', true);
                      }
                    }}
                  />
                </Form.Item>
                <Form.Item label="审批权限" name="canApproveOrder" valuePropName="checked">
                  <Switch disabled />
                </Form.Item>
              </>
            ) : null}
          </Form.Item>
          <Form.Item
            label="初始密码"
            name="password"
            rules={[
              { required: true, message: '请输入初始密码' },
              {
                validator(_, value) {
                  if (!value || value.length >= 8) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('初始密码不少于 8 位'));
                },
              },
            ]}
          >
            <Input.Password placeholder="不少于 8 位" />
          </Form.Item>
          <Form.Item label="备注" name="remark">
            <Input.TextArea rows={3} placeholder="可选" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={!!deleteTarget}
        title="删除账号"
        okText="确认删除"
        cancelText="取消"
        okButtonProps={{ danger: true, disabled: !deleteTarget || ![deleteTarget.name, deleteTarget.phone].includes(deleteConfirm.trim()) }}
        confirmLoading={deleting}
        onCancel={() => { setDeleteTarget(null); setDeleteConfirm(''); }}
        onOk={deleteUser}
        destroyOnClose
      >
        {deleteTarget && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Alert
              type="warning"
              showIcon
              message="删除后该账号将无法登录，默认用户列表不再显示；历史业务数据仍会保留。"
            />
            <div>
              <Text strong>{deleteTarget.name}</Text>
              <Text type="secondary"> · {deleteTarget.phone} · {displayRole(deleteTarget)}</Text>
            </div>
            <Input
              value={deleteConfirm}
              onChange={(event) => setDeleteConfirm(event.target.value)}
              placeholder="请输入该账号姓名或手机号确认删除"
            />
          </Space>
        )}
      </Modal>
    </div>
  );
}
