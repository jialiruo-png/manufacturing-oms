import { useEffect, useMemo, useState } from 'react';
import { CloseOutlined, BulbOutlined } from '@ant-design/icons';
import { FEATURE_CARDS } from '../features';

const STORAGE_KEY = 'ymt:dismissed-features:v1';

function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveDismissed(ids: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // 容忍 quota / 隐私模式失败
  }
}

export function dismissedFeatureIds(): Set<string> {
  return loadDismissed();
}

export function resetDismissedFeatures() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export default function FeatureBanner() {
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed());

  // 跨标签页同步 dismiss 状态（次要诉求，最简实现）
  useEffect(() => {
    const handler = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setDismissed(loadDismissed());
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const visible = useMemo(
    () => FEATURE_CARDS.filter((card) => !dismissed.has(card.id)),
    [dismissed],
  );

  if (visible.length === 0) return null;

  const handleDismiss = (id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveDismissed(next);
      return next;
    });
  };

  return (
    <div className="feature-banner-stack">
      {visible.map((card) => (
        <div key={card.id} className="feature-banner" role="status" title={card.description}>
          <span className="feature-banner-bar" aria-hidden="true" />
          <span className="feature-banner-icon" aria-hidden="true">
            <BulbOutlined />
          </span>
          <span className="feature-banner-badge">新功能 · {card.version}</span>
          <div className="feature-banner-text">
            <span className="feature-banner-title">{card.title}</span>
            {card.description && (
              <span className="feature-banner-sep" aria-hidden="true">·</span>
            )}
            <span className="feature-banner-desc">{card.description}</span>
          </div>
          <button
            type="button"
            className="feature-banner-close"
            onClick={() => handleDismiss(card.id)}
            aria-label="关闭"
            title="关闭后不再显示"
          >
            <CloseOutlined />
          </button>
        </div>
      ))}
    </div>
  );
}
