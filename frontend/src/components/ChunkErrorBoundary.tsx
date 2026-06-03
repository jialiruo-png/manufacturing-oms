import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Alert, Button, Space } from 'antd';
import { LoginOutlined, ReloadOutlined } from '@ant-design/icons';

const CHUNK_RELOAD_COUNT_KEY = 'ymt.chunkReloadCount';
const LEGACY_CHUNK_RELOAD_STORAGE_KEY = 'ymt.chunkReloadedAt';
const CHUNK_RELOAD_MAX = 2;
const CHUNK_SECOND_RELOAD_DELAY_MS = 1_000;
const CHUNK_RELOAD_MARKER_CLEAR_MS = 5_000;

const CHUNK_ERROR_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /loading chunk \S+ failed/i,
  /chunkloaderror/i,
];

function readReloadCount() {
  try {
    return Number(sessionStorage.getItem(CHUNK_RELOAD_COUNT_KEY) || 0);
  } catch {
    return 0;
  }
}

function writeReloadCount(value: number) {
  try {
    sessionStorage.setItem(CHUNK_RELOAD_COUNT_KEY, String(value));
  } catch {}
}

function clearReloadCount() {
  try {
    sessionStorage.removeItem(CHUNK_RELOAD_COUNT_KEY);
    sessionStorage.removeItem(LEGACY_CHUNK_RELOAD_STORAGE_KEY);
  } catch {}
}

function errorText(error: unknown) {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (error instanceof Error) {
    return `${error.name} ${error.message} ${error.stack || ''}`;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function isChunkLoadError(error: unknown) {
  const name = error instanceof Error ? error.name : '';
  if (name === 'ChunkLoadError') return true;
  const text = errorText(error).toLowerCase();
  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(text));
}

type ChunkErrorBoundaryProps = {
  children: ReactNode;
  onResetAuth: () => void;
};

type ChunkErrorBoundaryState = {
  error: unknown;
  recovering: boolean;
};

export default class ChunkErrorBoundary extends Component<ChunkErrorBoundaryProps, ChunkErrorBoundaryState> {
  state: ChunkErrorBoundaryState = { error: null, recovering: false };
  private reloadMarkerTimer: ReturnType<typeof setTimeout> | null = null;
  private reloadTimer: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError(error: unknown): ChunkErrorBoundaryState {
    return { error, recovering: false };
  }

  componentDidMount() {
    this.reloadMarkerTimer = setTimeout(() => {
      if (!this.state.error) clearReloadCount();
    }, CHUNK_RELOAD_MARKER_CLEAR_MS);
  }

  componentWillUnmount() {
    if (this.reloadMarkerTimer) clearTimeout(this.reloadMarkerTimer);
    if (this.reloadTimer) clearTimeout(this.reloadTimer);
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    if (!isChunkLoadError(error)) {
      console.error('[chunk-boundary] 页面渲染失败', error, errorInfo);
      return;
    }

    const nextReloadCount = readReloadCount() + 1;
    if (nextReloadCount <= CHUNK_RELOAD_MAX) {
      writeReloadCount(nextReloadCount);
      this.setState({ recovering: true });
      console.warn(`[chunk-boundary] 检测到前端资源加载失败，自动恢复第 ${nextReloadCount}/${CHUNK_RELOAD_MAX} 次`, error);
      if (nextReloadCount === 1) {
        window.location.reload();
      } else {
        this.reloadTimer = setTimeout(() => window.location.reload(), CHUNK_SECOND_RELOAD_DELAY_MS);
      }
      return;
    }

    console.warn('[chunk-boundary] 前端资源自动恢复后仍加载失败，显示手动恢复界面', error, errorInfo);
  }

  render() {
    if (!this.state.error) return this.props.children;

    const chunkError = isChunkLoadError(this.state.error);
    if (chunkError && (this.state.recovering || readReloadCount() < CHUNK_RELOAD_MAX)) return null;

    const title = chunkError ? '系统页面已更新' : '页面加载失败';
    const description = chunkError
      ? '请刷新页面后重试。'
      : '当前页面遇到异常，请刷新后重试。';

    return (
      <Alert
        type="warning"
        showIcon
        message={title}
        description={(
          <Space direction="vertical" size={14} style={{ width: '100%' }}>
            <span>{description}</span>
            <Space wrap>
              <Button type="primary" icon={<ReloadOutlined />} onClick={() => window.location.reload()}>
                刷新页面
              </Button>
              <Button icon={<LoginOutlined />} onClick={this.props.onResetAuth}>
                重新登录
              </Button>
            </Space>
          </Space>
        )}
      />
    );
  }
}
