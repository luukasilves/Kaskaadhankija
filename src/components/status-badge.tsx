import type { StatusTone } from '@/domain/round-statuses';

const TONE_STYLES: Record<StatusTone, { background: string; color: string }> = {
  neutral: { background: 'var(--color-neutral-soft)', color: 'var(--color-neutral)' },
  info: { background: 'var(--color-brand-soft)', color: 'var(--color-brand)' },
  success: { background: 'var(--color-success-soft)', color: 'var(--color-success)' },
  warning: { background: 'var(--color-warning-soft)', color: 'var(--color-warning)' },
  danger: { background: 'var(--color-danger-soft)', color: 'var(--color-danger)' },
};

export function StatusBadge({
  label,
  tone = 'neutral',
  title,
}: {
  label: string;
  tone?: StatusTone;
  title?: string;
}) {
  return (
    <span className="kh-badge" style={TONE_STYLES[tone]} title={title}>
      {label}
    </span>
  );
}

/** The rank chip used wherever a partner's cascade position is shown. */
export function RankChip({ rank, muted = false }: { rank: number | string; muted?: boolean }) {
  return (
    <span
      className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-md px-1.5 text-[12px] font-bold tabular-nums"
      style={{
        background: 'var(--color-neutral-soft)',
        color: muted ? 'var(--color-muted)' : 'var(--color-text)',
      }}
      title={`Koht raamlepingu järjestuses: ${rank}`}
    >
      {rank}
    </span>
  );
}
