import { useEffect, useRef, useState } from 'react';
import type { RefObject, TouchEvent as ReactTouchEvent } from 'react';

const TRIGGER_DISTANCE = 60;
const MAX_DRAG = 120;

interface UsePullRefreshResult {
  refreshing: boolean;
  pullDistance: number;
  bindProps: {
    onTouchStart: (event: ReactTouchEvent<HTMLDivElement>) => void;
    onTouchMove: (event: ReactTouchEvent<HTMLDivElement>) => void;
    onTouchEnd: () => void;
    onTouchCancel: () => void;
  };
}

export function usePullRefresh(
  containerRef: RefObject<HTMLElement | null>,
  onRefresh: () => Promise<void> | void,
  options?: { disabled?: boolean }
): UsePullRefreshResult {
  const disabled = !!options?.disabled;
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startYRef = useRef<number | null>(null);
  const activeRef = useRef(false);
  const refreshingRef = useRef(false);

  useEffect(() => { refreshingRef.current = refreshing; }, [refreshing]);

  function atTop(): boolean {
    const el = containerRef.current;
    if (!el) return window.scrollY <= 0;
    return el.scrollTop <= 0;
  }

  const onTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (disabled || refreshingRef.current) return;
    if (!atTop()) return;
    startYRef.current = event.touches[0].clientY;
    activeRef.current = true;
  };

  const onTouchMove = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (!activeRef.current || startYRef.current == null) return;
    if (!atTop()) {
      activeRef.current = false;
      startYRef.current = null;
      setPullDistance(0);
      return;
    }
    const delta = event.touches[0].clientY - startYRef.current;
    if (delta <= 0) {
      setPullDistance(0);
      return;
    }
    const damped = Math.min(MAX_DRAG, delta * 0.55);
    setPullDistance(damped);
  };

  const finish = async () => {
    if (!activeRef.current) return;
    activeRef.current = false;
    startYRef.current = null;
    const distance = pullDistance;
    setPullDistance(0);
    if (distance >= TRIGGER_DISTANCE && !refreshingRef.current) {
      setRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
      }
    }
  };

  const onTouchEnd = () => { void finish(); };
  const onTouchCancel = () => {
    activeRef.current = false;
    startYRef.current = null;
    setPullDistance(0);
  };

  return {
    refreshing,
    pullDistance,
    bindProps: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel },
  };
}
