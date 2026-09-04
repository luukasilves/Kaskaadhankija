'use client';

/**
 * A live countdown to a response deadline.
 *
 * Ticks from the server-rendered virtual instant rather than the browser's
 * clock, so it stays correct when the test clock has been moved forward. The
 * wording comes from the same formatter the server uses.
 */

import { useEffect, useState } from 'react';
import { formatRemaining, isDeadlineUrgent } from '@/domain/format';

export function Countdown({
  baseNowMs,
  deadlineAt,
  className,
}: {
  baseNowMs: number;
  deadlineAt: number;
  className?: string;
}) {
  const [drift, setDrift] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => setDrift(Date.now() - started), 30_000);
    return () => window.clearInterval(timer);
  }, [baseNowMs]);

  const now = baseNowMs + drift;
  const urgent = isDeadlineUrgent(now, deadlineAt);

  return (
    <span
      className={className}
      style={{ color: urgent ? 'var(--color-danger)' : undefined, fontWeight: urgent ? 650 : undefined }}
    >
      {formatRemaining(now, deadlineAt)}
    </span>
  );
}
