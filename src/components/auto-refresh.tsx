'use client';

/**
 * Keep an open round page current without anyone pressing reload [E-10][N-01].
 *
 * Once a minute, while the tab is visible, the server components are rendered
 * again (`router.refresh()`), so a higher-ranked partner's confirmation reaches
 * the partners below within the minute and the buyer's matrix follows the
 * partners' moves. A tab brought back to the front refreshes at once. Client
 * state — the marking form's unsaved selection, an open disclosure — survives
 * a refresh: only the server-rendered parts change.
 *
 * Until v2.6 a partner's numbers moved only when they themselves saved or
 * reloaded, which is what „kas saldo uueneb laivis?“ was asking about.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AUTO_REFRESH_MS } from '@/domain/live';

export function AutoRefresh({ intervalMs = AUTO_REFRESH_MS }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    let timer: number | null = null;
    const start = () => {
      if (timer === null) timer = window.setInterval(() => router.refresh(), intervalMs);
    };
    const stop = () => {
      if (timer !== null) window.clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        router.refresh();
        start();
      } else {
        stop();
      }
    };
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [router, intervalMs]);

  return null;
}
