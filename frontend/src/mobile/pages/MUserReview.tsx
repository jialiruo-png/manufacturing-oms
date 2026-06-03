import { useEffect, useMemo, useRef, useState } from 'react';
import { Drawer, Form, Input, Modal, Select, Switch, message } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  KeyOutlined,
  LoadingOutlined,
  PlusOutlined,
  SearchOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { getApiErrorMessage, usersApi } from '../../api';
import type { AccountRole, ManagerSubRole, User, UserStatus } from '../../types';
import { ACCOUNT_ROLE_LABEL, MANAGER_SUB_ROLE_LABEL, MANAGER_SUB_ROLE_OPTIONS, displayRole } from '../../utils/permissions';
import MobileLayout from '../MobileLayout';
import MEmpty from '../components/MEmpty';
import MLoading from '../components/MLoading';
import { usePullRefresh } from '../hooks/usePullRefresh';
import { formatDate } from '../../utils/order';

interface Props { currentUser: User; }

type MainTab = 'pending' | 'all' | 'permissions';

const MAIN_TABS: { key: MainTab; label: string }[] = [
  { key: 'pending', label: '待审核用户' },
  { key: 'all', label: '全部用户' },
  { key: 'permissions', label: '角色与权限说明' },
];

const ROLE_OPTIONS: { value: AccountRole; label: string }[] = [
  { value: 'sales', label: '业务员' },
  { value: 'purchase', label: '采购' },
  { value: 'production', label: '生产' },
  { value: 'logistics', label: '物流' },
  { value: 'manager', label: '经理层' },
  { value: 'admin', label: '管理员' },
];

const STATUS_TAG: Record<UserStatus, { cls: string; label: string }> = {
  pending: { cls: 'warning', label: '待审批' },
  enabled: { cls: 'success', label: '已启用' },
  disabled: { cls: 'urgent', label: '已禁用' },
  rejected: { cls: 'urgent', label: '已驳回' },
};

// 与 PC 端 UserReviewPage.tsx 的 PERMISSION_ROWS 完全一致
const PERMISSION_ROWS: { role: AccountRole; subRole?: ManagerSubRole; pages: string; desc: string }[] = [
  { role: 'sales', pages: '业务员页面', desc: '录入订单草稿、维护客户信息、提交订单审批。' },
  { role: 'purchase', pages: '业务员页面 + 采购页面', desc: '查看业务订单，处理采购备料、物料状态和库存相关任务。' },
  { role: 'production', pages: '生产页面', desc: '查看待生产订单，推进生产开始、完工和复审流转。' },
  { role: 'logistics', pages: '物流页面', desc: '处理待发货订单，登记物流信息并确认发货。' },
  { role: 'manager', subRole: 'approval_manager', pages: '数据看板 + 审批管理', desc: '审批订单和发货，不管理用户。' },
  { role: 'manager', subRole: 'clerk', pages: '数据看板 + 业务员页面 + 采购 + 生产 + 物流 + 审批管理', desc: '内勤跟单，拥有全部业务模块权限，不管理用户。' },
  { role: 'manager', subRole: 'system_admin', pages: '全部页面 + 用户管理', desc: '拥有管理员级业务权限，可管理用户、审批订单并处理各业务环节。' },
  { role: 'admin', pages: '全部页面 + 用户管理', desc: '拥有全部权限，可创建用户/admin、修改角色、启用禁用、重置密码。' },
];

export default function MUserReview({ currentUser }: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [tab, setTab] = useState<MainTab>('pending');
  const [search, setSearch] = useState('');
  const [list, setList] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeUser, setActiveUser] = useState<User | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [reviewForm] = Form.useForm();
  const [createForm] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (tab === 'permissions') return;
    setLoading(true);
    try {
      const data = await usersApi.list({
        q: search || undefined,
        status: tab === 'pending' ? 'pending' : undefined,
      });
      setList(data);
    } catch (e) { message.error(getApiErrorMessage(e, '加载失败')); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [tab]);
  const { refreshing, pullDistance, bindProps } = usePullRefresh(scrollRef, load);

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase();
    if (!kw) return list;
    return list.filter((u) =>
      u.name.toLowerCase().includes(kw) || u.phone.includes(kw) || (u.department || '').includes(kw)
    );
  }, [list, search]);

  const pendingCount = list.filter((u) => u.status === 'pending').length;

  const openManage = (u: User) => {
    reviewForm.setFieldsValue({
      role: u.role,
      managerSubRole: u.managerSubRole,
      canApproveOrder: u.canApproveOrder,
      remark: u.remark,
    });
    setActiveUser(u);
  };

  const submitReview = async (action: 'approve' | 'reject') => {
    if (!activeUser) return;
    setSaving(true);
    try {
      const values = await reviewForm.validateFields();
      const result = await usersApi.review(activeUser.id, {
        action,
        role: values.role,
        managerSubRole: values.role === 'manager' ? values.managerSubRole : '',
        canApproveOrder: values.role === 'manager' ? !!values.canApproveOrder : false,
      });
      message.success(result.message);
      setActiveUser(null);
      void load();
    } catch (e) {
      const err = e as { errorFields?: unknown };
      if (err.errorFields) return;
      message.error(getApiErrorMessage(e, '操作失败'));
    } finally {
      setSaving(false);
    }
  };

  const submitManage = async (action: 'update_role' | 'enable' | 'disable' | 'reset_password') => {
    if (!activeUser) return;
    if (action === 'reset_password') {
      Modal.confirm({
        title: `重置 ${activeUser.name} 密码？`,
        content: '重置后密码为 12345678，对方下次登录需修改',
        okText: '重置', okButtonProps: { danger: true },
        onOk: async () => {
          try {
            const r = await usersApi.manage(activeUser.id, { action: 'reset_password' });
            message.success(r.message);
            setActiveUser(null);
            void load();
          } catch (e) { message.error(getApiErrorMessage(e, '操作失败')); }
        },
      });
      return;
    }
    setSaving(true);
    try {
      const values = await reviewForm.validateFields();
      const result = await usersApi.manage(activeUser.id, {
        action,
        role: values.role,
        managerSubRole: values.role === 'manager' ? values.managerSubRole : '',
        canApproveOrder: values.role === 'manager' ? !!values.canApproveOrder : false,
      });
      message.success(result.message);
      setActiveUser(null);
      void load();
    } catch (e) {
      const err = e as { errorFields?: unknown };
      if (err.errorFields) return;
      message.error(getApiErrorMessage(e, '操作失败'));
    } finally {
      setSaving(false);
    }
  };

  const deleteUser = (u: User) => {
    Modal.confirm({
      title: `删除账号「${u.name}」？`,
      content: '该操作不可恢复',
      okText: '删除', okButtonProps: { danger: true },
      onOk: async () => {
        try { const r = await usersApi.delete(u.id); message.success(r.message); setActiveUser(null); void load(); }
        catch (e) { message.error(getApiErrorMessage(e, '删除失败')); }
      },
    });
  };

  const submitCreate = async () => {
    try {
      const values = await createForm.validateFields();
      setSaving(true);
      const r = await usersApi.create({
        ...values,
        managerSubRole: values.role === 'manager' ? values.managerSubRole : '',
        canApproveOrder: values.role === 'manager' ? !!values.canApproveOrder : false,
      });
      message.success(r.message);
      setCreateOpen(false);
      createForm.resetFields();
      void load();
    } catch (e) {
      const err = e as { errorFields?: unknown };
      if (err.errorFields) return;
      message.error(getApiErrorMessage(e, '创建失败'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <MobileLayout title="用户管理" user={currentUser} activeModule="user-review">
      <div {...bindProps}>
        <div className="m-pull-indicator" style={{ height: refreshing ? 32 : pullDistance }}>
          {refreshing ? <><LoadingOutlined spin /> <span style={{ marginLeft: 6 }}>刷新中…</span></> : pullDistance > 0 ? (pullDistance >= 60 ? '松开刷新' : '下拉刷新') : null}
        </div>

        <div className="m-segbar">
          {MAIN_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`m-segbar-item${tab === t.key ? ' active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              {t.key === 'pending' && pendingCount > 0 && (
                <span style={{
                  marginLeft: 6, fontSize: 11, color: '#dc2626', fontWeight: 700,
                }}>({pendingCount})</span>
              )}
            </button>
          ))}
        </div>

        {tab === 'permissions' ? (
          <PermissionList />
        ) : (
          <>
            <div className="m-search-bar">
              <SearchOutlined />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="姓名 / 手机号 / 部门"
                inputMode="search"
              />
              {search && <a onClick={() => setSearch('')} style={{ fontSize: 12, color: '#94a3b8' }}>清除</a>}
            </div>

            {loading ? <MLoading /> : filtered.length === 0 ? (
              <MEmpty text={tab === 'pending' ? '暂无待审核用户' : '暂无用户数据'} />
            ) : (
              <>
                {filtered.map((u) => (
                  <div key={u.id} className="m-card" onClick={() => openManage(u)}>
                    <div className="m-card-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                        <div className="m-avatar" style={{ width: 36, height: 36, fontSize: 14 }}>{u.name.slice(0, 1)}</div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: '#0f1318' }}>{u.name}</div>
                          <div style={{ fontSize: 12, color: '#94a3b8' }}>{displayRole(u) || ACCOUNT_ROLE_LABEL[u.role]}</div>
                        </div>
                      </div>
                      <span className={`m-tag ${STATUS_TAG[u.status]?.cls || ''}`}>{STATUS_TAG[u.status]?.label || u.status}</span>
                    </div>
                    <div className="m-card-row"><span className="m-card-label">手机</span><span className="m-card-value m-num">{u.phone}</span></div>
                    <div className="m-card-row"><span className="m-card-label">部门</span><span className="m-card-value">{u.department || '—'}</span></div>
                    <div className="m-card-row"><span className="m-card-label">注册时间</span><span className="m-card-value">{formatDate(u.createdAt, 'YYYY-MM-DD')}</span></div>
                    {u.pendingPasswordResetRequestCount > 0 && (
                      <div style={{ marginTop: 6, fontSize: 12, color: '#dc2626' }}>
                        待重置密码请求 × {u.pendingPasswordResetRequestCount}
                      </div>
                    )}
                  </div>
                ))}
                <div className="m-list-end">共 {filtered.length} 位用户</div>
              </>
            )}
          </>
        )}
      </div>

      {tab !== 'permissions' && (
        <button type="button" className="m-fab" onClick={() => { createForm.resetFields(); setCreateOpen(true); }} aria-label="新增用户">
          <PlusOutlined />
        </button>
      )}

      {/* 管理/审批 Drawer */}
      <Drawer
        title={activeUser ? `管理 ${activeUser.name}` : ''}
        placement="bottom"
        height="86%"
        open={!!activeUser}
        onClose={() => setActiveUser(null)}
        styles={{ body: { padding: 16, paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' } }}
      >
        {activeUser && (
          <>
            <div className="m-card">
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div className="m-avatar" style={{ width: 48, height: 48 }}>{activeUser.name.slice(0, 1)}</div>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 700 }}>{activeUser.name}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>{activeUser.phone} · {activeUser.department || '—'}</div>
                </div>
              </div>
            </div>

            <Form form={reviewForm} layout="vertical" requiredMark={false}>
              <Form.Item name="role" label="角色" rules={[{ required: true }]}>
                <Select size="large" options={ROLE_OPTIONS.filter((r) => currentUser.isAdmin || r.value !== 'admin')} />
              </Form.Item>
              <Form.Item shouldUpdate={(p, n) => p.role !== n.role} noStyle>
                {() => reviewForm.getFieldValue('role') === 'manager' ? (
                  <>
                    <Form.Item name="managerSubRole" label="经理层二级身份" rules={[{ required: true, message: '请选择' }]}>
                      <Select size="large" options={MANAGER_SUB_ROLE_OPTIONS} placeholder="选择" />
                    </Form.Item>
                    <Form.Item name="canApproveOrder" label="审批权限" valuePropName="checked">
                      <Switch />
                    </Form.Item>
                  </>
                ) : null}
              </Form.Item>
            </Form>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {activeUser.status === 'pending' ? (
                <>
                  <button type="button" className="m-btn m-btn-danger" disabled={saving} onClick={() => submitReview('reject')}>
                    <CloseCircleOutlined /> 驳回
                  </button>
                  <button type="button" className="m-btn m-btn-primary" disabled={saving} onClick={() => submitReview('approve')}>
                    <CheckCircleOutlined /> 批准
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="m-btn" disabled={saving} onClick={() => submitManage('update_role')}>
                    <EditOutlined /> 更新角色
                  </button>
                  {activeUser.status === 'enabled' ? (
                    <button type="button" className="m-btn m-btn-danger" disabled={saving} onClick={() => submitManage('disable')}>
                      <StopOutlined /> 禁用账号
                    </button>
                  ) : (
                    <button type="button" className="m-btn m-btn-primary" disabled={saving} onClick={() => submitManage('enable')}>
                      启用账号
                    </button>
                  )}
                </>
              )}
            </div>

            {currentUser.isAdmin && activeUser.id !== currentUser.id && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                <button type="button" className="m-btn" onClick={() => submitManage('reset_password')}>
                  <KeyOutlined /> 重置密码
                </button>
                {!activeUser.isAdmin && activeUser.role !== 'admin' && (
                  <button type="button" className="m-btn m-btn-danger" onClick={() => deleteUser(activeUser)}>
                    <DeleteOutlined /> 删除账号
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </Drawer>

      {/* 创建账号 */}
      <Drawer
        title="新增账号"
        placement="bottom"
        height="86%"
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        styles={{ body: { padding: 16, paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' } }}
      >
        <Form form={createForm} layout="vertical" requiredMark={false}>
          <Form.Item name="name" label="姓名" rules={[{ required: true }]}><Input size="large" /></Form.Item>
          <Form.Item name="phone" label="手机号" rules={[{ required: true }, { pattern: /^1\d{10}$/, message: '请输入正确的 11 位手机号' }]}>
            <Input size="large" inputMode="tel" maxLength={11} />
          </Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true }]}>
            <Select size="large" options={ROLE_OPTIONS.filter((r) => currentUser.isAdmin || r.value !== 'admin')} />
          </Form.Item>
          <Form.Item shouldUpdate={(p, n) => p.role !== n.role} noStyle>
            {() => createForm.getFieldValue('role') === 'manager' ? (
              <>
                <Form.Item name="managerSubRole" label="经理层二级身份" rules={[{ required: true }]}>
                  <Select size="large" options={MANAGER_SUB_ROLE_OPTIONS} />
                </Form.Item>
                <Form.Item name="canApproveOrder" label="审批权限" valuePropName="checked"><Switch /></Form.Item>
              </>
            ) : null}
          </Form.Item>
          <Form.Item name="password" label="初始密码" rules={[{ required: true, min: 8, message: '不少于 8 位' }]}>
            <Input.Password size="large" placeholder="≥ 8 位" />
          </Form.Item>
          <Form.Item name="remark" label="备注"><Input.TextArea rows={2} /></Form.Item>
        </Form>
        <button type="button" className="m-btn m-btn-primary" onClick={submitCreate} disabled={saving} style={{ width: '100%' }}>
          {saving ? '提交中…' : '创建账号'}
        </button>
      </Drawer>
    </MobileLayout>
  );
}

function PermissionList() {
  return (
    <>
      <div style={{ padding: '4px 4px 12px', fontSize: 12, color: '#94a3b8' }}>
        以下角色与权限说明与电脑端保持一致，供管理员审核分配角色时参考。
      </div>
      {PERMISSION_ROWS.map((row) => {
        const roleLabel = row.subRole
          ? `${ACCOUNT_ROLE_LABEL[row.role]} · ${MANAGER_SUB_ROLE_LABEL[row.subRole]}`
          : ACCOUNT_ROLE_LABEL[row.role];
        return (
          <div key={`${row.role}:${row.subRole ?? ''}`} className="m-card">
            <div className="m-card-header" style={{ marginBottom: 6 }}>
              <div className="m-card-title" style={{ fontSize: 15 }}>{roleLabel}</div>
              <span className="m-tag">{row.role === 'admin' ? '最高权限' : row.subRole === 'system_admin' ? '系统管理' : '业务'}</span>
            </div>
            <div className="m-card-row">
              <span className="m-card-label">可访问页面</span>
              <span className="m-card-value" style={{ whiteSpace: 'normal', textAlign: 'right' }}>{row.pages}</span>
            </div>
            <div style={{ fontSize: 13, color: '#475569', marginTop: 8, lineHeight: 1.6 }}>{row.desc}</div>
          </div>
        );
      })}
      <div className="m-list-end">共 {PERMISSION_ROWS.length} 类角色</div>
    </>
  );
}

