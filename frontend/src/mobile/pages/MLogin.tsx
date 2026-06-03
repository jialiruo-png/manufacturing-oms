import { useEffect, useState } from 'react';
import { Alert, Form, Input, Modal, Select, message } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import type { AuthState } from '../../authStorage';
import { usersApi } from '../../api';
import type { AccountRole, ManagerSubRole } from '../../types';
import { MANAGER_SUB_ROLE_OPTIONS } from '../../utils/permissions';

type LoginValues = { login: string; password: string };
type RegisterValues = {
  name: string;
  phone: string;
  password: string;
  confirmPassword: string;
  department?: string;
  role: Exclude<AccountRole, 'admin'>;
  managerSubRole?: ManagerSubRole;
  remark?: string;
};

const ROLE_OPTIONS: { value: Exclude<AccountRole, 'admin'>; label: string }[] = [
  { value: 'sales', label: '业务员' },
  { value: 'purchase', label: '采购' },
  { value: 'production', label: '生产' },
  { value: 'logistics', label: '物流' },
  { value: 'manager', label: '经理层' },
];

function errorText(error: unknown, fallback: string) {
  if (typeof error === 'object' && error && 'response' in error) {
    const response = (error as { response?: { data?: { error?: string } } }).response;
    return response?.data?.error || fallback;
  }
  return fallback;
}

interface MLoginProps {
  onLogin: (auth: AuthState) => void;
}

export default function MLogin({ onLogin }: MLoginProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [loginForm] = Form.useForm<LoginValues>();
  const [registerForm] = Form.useForm<RegisterValues>();
  const registerRole = Form.useWatch('role', registerForm);

  useEffect(() => {
    document.body.classList.add('m-app-login');
    return () => { document.body.classList.remove('m-app-login'); };
  }, []);

  const handleLogin = async (values: LoginValues) => {
    setLoading(true);
    setNotice('');
    try {
      const result = await usersApi.login({ login: values.login, password: values.password });
      onLogin({ user: result.user, token: result.token });
    } catch (e) {
      setNotice(errorText(e, '登录失败，请检查账号密码'));
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (values: RegisterValues) => {
    if (values.password !== values.confirmPassword) {
      setNotice('两次密码不一致');
      return;
    }
    setLoading(true);
    setNotice('');
    try {
      await usersApi.register({
        name: values.name.trim(),
        phone: values.phone.trim(),
        password: values.password,
        confirmPassword: values.confirmPassword,
        department: (values.department || '未填写').trim() || '未填写',
        role: values.role,
        managerSubRole: values.managerSubRole,
        remark: values.remark,
      });
      message.success('注册申请已提交，请等待管理员审核');
      setMode('login');
      registerForm.resetFields();
    } catch (e) {
      setNotice(errorText(e, '注册失败'));
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async () => {
    const identifier = String(loginForm.getFieldValue('login') ?? '').trim();
    if (!identifier) {
      message.warning('请先输入姓名或手机号');
      return;
    }
    try {
      await usersApi.requestPasswordReset({ identifier });
      Modal.info({
        title: '忘记密码',
        content: '已通知管理员，请联系管理员重置密码。管理员重置后，初始密码为 12345678，登录后系统会要求你立即修改密码。',
        okText: '我知道了',
      });
    } catch (e) {
      message.warning(errorText(e, '提交重置申请失败'));
    }
  };

  return (
    <div className="m-app m-app-login">
      <div className="m-login-wrap">
        <div className="m-login-brand">
          <div className="m-login-brand-title">
            <span className="red">YMT</span>
            <span className="dark"> DIESEL</span>
          </div>
          <div className="m-login-brand-sub">YMT · 订单管理系统</div>
        </div>

        <div className="m-login-card">
          <div className="m-login-tabs">
            <button
              type="button"
              className={`m-login-tab${mode === 'login' ? ' active' : ''}`}
              onClick={() => { setMode('login'); setNotice(''); }}
            >登录</button>
            <button
              type="button"
              className={`m-login-tab${mode === 'register' ? ' active' : ''}`}
              onClick={() => { setMode('register'); setNotice(''); }}
            >注册</button>
          </div>

          {notice && <Alert type="error" showIcon message={notice} style={{ marginBottom: 12 }} />}

          {mode === 'login' ? (
            <Form form={loginForm} layout="vertical" onFinish={handleLogin} requiredMark={false}>
              <Form.Item name="login" label="账号" rules={[{ required: true, message: '请输入姓名或手机号' }]}>
                <Input prefix={<UserOutlined />} placeholder="姓名 / 手机号" size="large" autoComplete="username" />
              </Form.Item>
              <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
                <Input.Password prefix={<LockOutlined />} placeholder="不少于 8 位" size="large" autoComplete="current-password" />
              </Form.Item>
              <button type="submit" className="m-btn m-btn-primary" disabled={loading} style={{ width: '100%' }}>
                {loading ? '登录中…' : '登录'}
              </button>
              <div style={{ marginTop: 12, textAlign: 'right' }}>
                <a onClick={handleForgot} style={{ fontSize: 13, color: '#64748b' }}>忘记密码？</a>
              </div>
            </Form>
          ) : (
            <Form form={registerForm} layout="vertical" onFinish={handleRegister} requiredMark={false}>
              <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
                <Input size="large" placeholder="真实姓名" />
              </Form.Item>
              <Form.Item name="phone" label="手机号" rules={[{ required: true, message: '请输入手机号' }, { pattern: /^1\d{10}$/, message: '请输入正确的 11 位手机号' }]}>
                <Input size="large" inputMode="tel" placeholder="11 位手机号" maxLength={11} />
              </Form.Item>
              <Form.Item name="role" label="岗位角色" rules={[{ required: true, message: '请选择角色' }]}>
                <Select size="large" placeholder="请选择" options={ROLE_OPTIONS} />
              </Form.Item>
              {registerRole === 'manager' && (
                <Form.Item name="managerSubRole" label="经理层职责" rules={[{ required: true, message: '请选择经理层职责' }]}>
                  <Select size="large" options={MANAGER_SUB_ROLE_OPTIONS} placeholder="选择具体职责" />
                </Form.Item>
              )}
              <Form.Item name="department" label="部门">
                <Input size="large" placeholder="可选" />
              </Form.Item>
              <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }, { min: 8, message: '密码不少于 8 位' }]}>
                <Input.Password size="large" autoComplete="new-password" placeholder="不少于 8 位" />
              </Form.Item>
              <Form.Item name="confirmPassword" label="确认密码" rules={[{ required: true, message: '请再次输入密码' }]}>
                <Input.Password size="large" autoComplete="new-password" />
              </Form.Item>
              <Form.Item name="remark" label="备注">
                <Input.TextArea rows={2} placeholder="可填写申请理由（可选）" />
              </Form.Item>
              <button type="submit" className="m-btn m-btn-primary" disabled={loading} style={{ width: '100%' }}>
                {loading ? '提交中…' : '提交注册申请'}
              </button>
            </Form>
          )}
        </div>
      </div>
    </div>
  );
}
