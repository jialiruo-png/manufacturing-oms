import { useState } from 'react';
import { Alert, Drawer, Form, Input, message } from 'antd';
import {
  KeyOutlined,
  LogoutOutlined,
  PhoneOutlined,
  RightOutlined,
  SoundOutlined,
} from '@ant-design/icons';
import { clearApiCache, usersApi } from '../../api';
import { saveAuthState, loadAuthState } from '../../authStorage';
import { ACCOUNT_ROLE_LABEL, displayRole } from '../../utils/permissions';
import { FEATURE_CARDS } from '../../features';
import type { User } from '../../types';
import MobileLayout from '../MobileLayout';

interface MProfileProps {
  user: User;
  onLogout: () => void;
  onUserChange: (user: User) => void;
}

export default function MProfile({ user, onLogout, onUserChange }: MProfileProps) {
  const [pwOpen, setPwOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [form] = Form.useForm<{ oldPassword: string; newPassword: string; confirmPassword: string }>();

  const handleChangePassword = async () => {
    try {
      const values = await form.validateFields();
      if (values.newPassword !== values.confirmPassword) {
        setPwError('两次密码不一致'); return;
      }
      setPwLoading(true); setPwError('');
      const result = await usersApi.changePassword(values);
      clearApiCache();
      const auth = loadAuthState();
      if (auth) saveAuthState({ user: result.user, token: result.token });
      onUserChange(result.user);
      message.success(result.message || '密码已更新');
      setPwOpen(false);
      form.resetFields();
    } catch (e) {
      const resp = (e as { response?: { data?: { error?: string } } })?.response;
      setPwError(resp?.data?.error || '修改密码失败');
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <MobileLayout title="我的" user={user} activeModule="profile">
      {/* 个人信息卡 */}
      <div className="m-card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div className="m-avatar" style={{ width: 56, height: 56, fontSize: 20 }}>{user.name.slice(0, 1)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#0f1318' }}>{user.name}</div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
            {displayRole(user) || ACCOUNT_ROLE_LABEL[user.role]}
            {user.department ? ` · ${user.department}` : ''}
          </div>
        </div>
      </div>

      {/* 联系方式 */}
      <div className="m-card">
        <div className="m-card-row">
          <span className="m-card-label"><PhoneOutlined style={{ marginRight: 6 }} />手机号</span>
          <span className="m-card-value m-num">{user.phone}</span>
        </div>
        <div className="m-card-divider" />
        <div className="m-card-row">
          <span className="m-card-label">最后登录</span>
          <span className="m-card-value">
            {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('zh-CN') : '—'}
          </span>
        </div>
      </div>

      {/* 操作菜单 */}
      <div className="m-card" style={{ padding: 0 }}>
        <button
          type="button"
          className="m-card-row"
          onClick={() => setPwOpen(true)}
          style={{ width: '100%', background: 'transparent', border: 0, padding: '16px 16px', minHeight: 56, cursor: 'pointer' }}
        >
          <span className="m-card-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <KeyOutlined /> 修改密码
          </span>
          <RightOutlined style={{ color: '#cbd5e1' }} />
        </button>
        <div className="m-card-divider" />
        <button
          type="button"
          className="m-card-row"
          onClick={() => setLogOpen(true)}
          style={{ width: '100%', background: 'transparent', border: 0, padding: '16px 16px', minHeight: 56, cursor: 'pointer' }}
        >
          <span className="m-card-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SoundOutlined /> 更新日志
          </span>
          <RightOutlined style={{ color: '#cbd5e1' }} />
        </button>
      </div>

      <button
        type="button"
        className="m-btn m-btn-danger"
        onClick={onLogout}
        style={{ width: '100%', marginTop: 12 }}
      >
        <LogoutOutlined /> 退出登录
      </button>

      {/* 修改密码 Drawer */}
      <Drawer
        title="修改密码"
        placement="bottom"
        open={pwOpen}
        onClose={() => { setPwOpen(false); setPwError(''); form.resetFields(); }}
        height="auto"
        destroyOnClose
        styles={{ body: { padding: 16 } }}
      >
        {pwError && <Alert type="error" showIcon message={pwError} style={{ marginBottom: 12 }} />}
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item name="oldPassword" label="旧密码" rules={[{ required: true, message: '请输入旧密码' }]}>
            <Input.Password size="large" autoComplete="current-password" />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[{ required: true, message: '请输入新密码' }, { min: 8, message: '新密码不少于 8 位' }]}
          >
            <Input.Password size="large" autoComplete="new-password" placeholder="不少于 8 位" />
          </Form.Item>
          <Form.Item name="confirmPassword" label="确认新密码" rules={[{ required: true, message: '请再次输入新密码' }]}>
            <Input.Password size="large" autoComplete="new-password" />
          </Form.Item>
        </Form>
        <button
          type="button"
          className="m-btn m-btn-primary"
          onClick={handleChangePassword}
          disabled={pwLoading}
          style={{ width: '100%' }}
        >
          {pwLoading ? '保存中…' : '保存新密码'}
        </button>
      </Drawer>

      {/* 更新日志 Drawer */}
      <Drawer
        title="更新日志"
        placement="bottom"
        height="80%"
        open={logOpen}
        onClose={() => setLogOpen(false)}
        styles={{ body: { padding: 12 } }}
      >
        {FEATURE_CARDS.length === 0 ? (
          <div style={{ color: '#94a3b8', textAlign: 'center', padding: 40 }}>暂无更新记录</div>
        ) : (
          FEATURE_CARDS.map((card) => (
            <div key={card.id} className="m-card">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                <span style={{ padding: '2px 8px', borderRadius: 4, background: '#fef9c3', color: '#854d0e', fontSize: 11, fontWeight: 700 }}>
                  {card.version}
                </span>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>{card.publishedAt}</span>
              </div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 4 }}>{card.title}</div>
              <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>{card.description}</div>
            </div>
          ))
        )}
      </Drawer>
    </MobileLayout>
  );
}
