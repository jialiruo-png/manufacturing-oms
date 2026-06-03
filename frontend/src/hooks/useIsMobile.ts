import { useEffect, useState } from 'react';

export const MOBILE_BREAKPOINT = 768;
const QUERY = `(max-width: ${MOBILE_BREAKPOINT}px)`;

function matchNow() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(QUERY).matches;
}

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(matchNow);
  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const handler = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handler);
      return () => mql.removeEventListener('change', handler);
    }
    mql.addListener(handler);
    return () => mql.removeListener(handler);
  }, []);
  return isMobile;
}

export function isMobileViewport(): boolean {
  return matchNow();
}
