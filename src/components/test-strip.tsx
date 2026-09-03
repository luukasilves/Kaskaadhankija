/**
 * The test-harness strip.
 *
 * Rendered above the application, not inside it: a hazard-striped bar with a
 * monospace TESTKESKKOND label, so nobody can mistake the persona switcher and
 * the time machine for part of the tool itself. It carries the three things a
 * tester needs at all times — who they are acting as, what the virtual clock
 * says, and a way back to a clean slate.
 *
 * Absent entirely when DEMO_MODE is off; the E2E suite asserts that.
 */

import { cookies } from 'next/headers';
import { formatDateTimeShort } from '@/domain/format';
import { isDemoMode } from '@/lib/env';
import { PERSONA_COOKIE } from '@/server/auth/actor';
import { listPersonaOptions, nextDeadlineMs } from '@/server/personas';
import { TestStripControls } from './test-strip-controls';

export async function TestStrip() {
  if (!isDemoMode) return null;

  let personas: Array<{ key: string; group: string; label: string }> = [];
  let nowMs = Date.now();
  let offsetMs = 0;
  let pendingDeadline: number | null = null;

  try {
    const { readClockState } = await import('@/server/actions/clock');
    const clock = await readClockState();
    nowMs = clock.nowMs;
    offsetMs = clock.offsetMs;
    personas = listPersonaOptions();
    pendingDeadline = nextDeadlineMs();
  } catch {
    // The strip must not be what stops the app booting on an empty database.
    return null;
  }

  const store = await cookies();
  const currentKey = store.get(PERSONA_COOKIE)?.value ?? null;

  return (
    <div
      data-testid="test-strip"
      className="kh-no-print border-b-2 border-[var(--color-demo)] bg-[var(--color-demo-soft)] px-4 py-2 text-[var(--color-text)]"
      style={{
        backgroundImage:
          'repeating-linear-gradient(135deg, transparent 0 14px, color-mix(in srgb, var(--color-demo) 8%, transparent) 14px 28px)',
      }}
    >
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-5 gap-y-2">
        <span className="rounded border border-[var(--color-demo)] px-2 py-0.5 font-mono text-[11px] font-bold tracking-widest text-[var(--color-demo)] uppercase">
          Testkeskkond
        </span>
        <TestStripControls
          personas={personas}
          currentKey={currentKey}
          clockLabel={formatDateTimeShort(nowMs)}
          offsetDays={Math.round(offsetMs / 86_400_000)}
          hasPendingDeadline={pendingDeadline !== null}
        />
      </div>
    </div>
  );
}
