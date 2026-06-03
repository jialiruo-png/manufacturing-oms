import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Alert, Button, Checkbox, Form, Input, Modal, Select, Typography, message } from 'antd';
import { EyeOutlined, LockOutlined, UserOutlined } from '@ant-design/icons';
import { usersApi } from '../api';
import type { AccountRole, ManagerSubRole, User } from '../types';
import type { AuthState } from '../authStorage';
import { MANAGER_SUB_ROLE_OPTIONS } from '../utils/permissions';

const { Text } = Typography;

type LoginValues = { login: string; password: string; remember?: boolean };
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

const passwordRule = {
  validator(_: unknown, value?: string) {
    if (!value || value.length >= 8) {
      return Promise.resolve();
    }
    return Promise.reject(new Error('密码不少于 8 位'));
  },
};

function errorText(error: unknown, fallback: string) {
  if (typeof error === 'object' && error && 'response' in error) {
    const response = (error as { response?: { data?: { error?: string } } }).response;
    return response?.data?.error || fallback;
  }
  return fallback;
}

export default function LoginPage({ onLogin }: { onLogin: (auth: AuthState) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string>('');
  const [loginForm] = Form.useForm<LoginValues>();
  const [registerForm] = Form.useForm<RegisterValues>();
  const loginIdentifier = Form.useWatch('login', loginForm);
  const registerRole = Form.useWatch('role', registerForm);

  const handleForgotPassword = async () => {
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
    } catch (error) {
      message.warning(errorText(error, '提交重置申请失败，请联系管理员'));
    }
  };

  const handleLogin = async (values: LoginValues) => {
    setLoading(true);
    setNotice('');
    try {
      const result = await usersApi.login({ login: values.login, password: values.password });
      onLogin({ user: result.user, token: result.token });
    } catch (error) {
      setNotice(errorText(error, '登录失败，请检查账号和密码'));
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (values: RegisterValues) => {
    setLoading(true);
    setNotice('');
    try {
      const result = await usersApi.register({
        ...values,
        managerSubRole: values.role === 'manager' ? values.managerSubRole : '',
        department: '未填写',
      });
      registerForm.resetFields();
      setMode('login');
      setNotice(result.message);
      message.success(result.message);
    } catch (error) {
      setNotice(errorText(error, '注册失败，请检查填写信息'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '44px 24px',
      background: 'linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%)',
    }}>
      <section style={{ width: 'min(560px, 100%)', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14, marginBottom: 58 }}>
          <img src="/logo.jpg" alt="YMT" style={{ width: 80, height: 54, objectFit: 'contain' }} />
          <div style={{ fontSize: 36, lineHeight: 1, fontWeight: 900, color: '#101827' }}>
            <span style={{ color: '#c4000b' }}>YMT</span> DIESEL
          </div>
        </div>

        <h1 style={{ margin: 0, fontSize: 34, lineHeight: 1.25, fontWeight: 800, color: '#101827' }}>
          {mode === 'login' ? 'YMT' : '新用户注册'}
        </h1>
        <p style={{ margin: '16px 0 42px', color: '#7b8494', fontSize: 22, lineHeight: 1.55, fontWeight: 600 }}>
          {mode === 'login' ? '欢迎登陆 YMT 订单生产协同管理系统' : '提交后需等待管理员审核启用'}
        </p>

        {notice && (
          <Alert
            type={notice.includes('已提交') ? 'success' : 'warning'}
            showIcon
            message={notice}
            style={{ marginBottom: 24, textAlign: 'left' }}
          />
        )}

        {mode === 'login' ? (
          <Form form={loginForm} layout="vertical" requiredMark={false} onFinish={handleLogin} style={{ textAlign: 'left' }}>
            <Form.Item
              label={<Label>姓名或手机号</Label>}
              name="login"
              rules={[{ required: true, message: '请输入姓名或手机号' }]}
            >
              <Input
                prefix={<UserOutlined style={{ color: '#9aa3b2', fontSize: 20 }} />}
                placeholder="请输入姓名或手机号"
                size="large"
                style={inputStyle}
              />
            </Form.Item>

            <Form.Item
              label={<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Label>密码</Label>
                {String(loginIdentifier ?? '').trim() && (
                  <button type="button" style={linkButtonStyle} onClick={handleForgotPassword}>忘记密码?</button>
                )}
              </div>}
              name="password"
              rules={[{ required: true, message: '请输入密码' }]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: '#9aa3b2', fontSize: 20 }} />}
                iconRender={() => <EyeOutlined style={{ color: '#9aa3b2' }} />}
                placeholder="请输入登录密码"
                size="large"
                style={inputStyle}
              />
            </Form.Item>

            <Form.Item name="remember" valuePropName="checked" style={{ marginBottom: 34 }}>
              <Checkbox style={{ fontSize: 18, fontWeight: 700, color: '#4d586b' }}>在此设备上记住我</Checkbox>
            </Form.Item>

            <Button htmlType="submit" loading={loading} block style={primaryButtonStyle}>
              立即登陆 <span style={{ marginLeft: 14, fontSize: 28 }}>→</span>
            </Button>

            <div style={{ textAlign: 'center', marginTop: 28 }}>
              <Text type="secondary">还没有账号？</Text>
              <button type="button" style={linkButtonStyle} onClick={() => { setMode('register'); setNotice(''); }}>
                新用户注册
              </button>
            </div>
          </Form>
        ) : (
          <Form form={registerForm} layout="vertical" requiredMark={false} onFinish={handleRegister} style={{ textAlign: 'left' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
              <Form.Item label={<Label>姓名</Label>} name="name" rules={[{ required: true, message: '请输入姓名' }]}>
                <Input placeholder="请输入姓名" size="large" />
              </Form.Item>
              <Form.Item label={<Label>手机号</Label>} name="phone" rules={[{ required: true, message: '请输入手机号' }]}>
                <Input placeholder="手机号必须唯一" size="large" />
              </Form.Item>
            </div>
            <Form.Item
              label={<Label>密码</Label>}
              name="password"
              rules={[{ required: true, message: '请输入密码' }, passwordRule]}
            >
              <Input.Password placeholder="不少于 8 位" size="large" />
            </Form.Item>
            <Form.Item
              label={<Label>确认密码</Label>}
              name="confirmPassword"
              dependencies={['password']}
              rules={[
                { required: true, message: '请确认密码' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('password') === value) return Promise.resolve();
                    return Promise.reject(new Error('两次输入的密码不一致'));
                  },
                }),
              ]}
            >
              <Input.Password placeholder="再次输入密码" size="large" />
            </Form.Item>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0 16px' }}>
              <Form.Item label={<Label>身份角色</Label>} name="role" rules={[{ required: true, message: '请选择身份角色' }]}>
                <Select
                  placeholder="请选择角色"
                  size="large"
                  options={ROLE_OPTIONS}
                  onChange={(role) => {
                    if (role !== 'manager') registerForm.setFieldValue('managerSubRole', '');
                  }}
                />
              </Form.Item>
              {registerRole === 'manager' && (
                <Form.Item
                  label={<Label>经理层二级身份</Label>}
                  name="managerSubRole"
                  rules={[{ required: true, message: '请选择经理层二级身份' }]}
                >
                  <Select placeholder="请选择二级身份" size="large" options={MANAGER_SUB_ROLE_OPTIONS} />
                </Form.Item>
              )}
            </div>

            <Form.Item label={<Label>注册备注</Label>} name="remark">
              <Input.TextArea rows={3} placeholder="可选，可填可不填" />
            </Form.Item>

            <Button htmlType="submit" loading={loading} block style={primaryButtonStyle}>
              提交注册申请
            </Button>

            <div style={{ textAlign: 'center', marginTop: 28 }}>
              <Text type="secondary">已有账号？</Text>
              <button type="button" style={linkButtonStyle} onClick={() => { setMode('login'); setNotice(''); }}>
                返回登录
              </button>
            </div>
          </Form>
        )}

        <div style={{ height: 1, background: '#e4e8ef', marginTop: 66 }} />
      </section>
    </main>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <span style={{ color: '#354052', fontSize: 18, fontWeight: 800 }}>{children}</span>;
}

const inputStyle: CSSProperties = {
  height: 72,
  borderRadius: 16,
  background: '#fafbfc',
  fontSize: 18,
  fontWeight: 650,
};

const primaryButtonStyle: CSSProperties = {
  height: 76,
  border: 0,
  borderRadius: 16,
  background: '#101827',
  color: '#fff',
  fontSize: 22,
  fontWeight: 900,
  boxShadow: '0 22px 48px rgba(16,24,39,0.16)',
};

const linkButtonStyle: CSSProperties = {
  border: 0,
  background: 'transparent',
  color: '#c4000b',
  fontSize: 16,
  fontWeight: 800,
  cursor: 'pointer',
  padding: '0 0 0 8px',
};
