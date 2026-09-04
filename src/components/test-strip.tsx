/**
 * The test-harness strip.
 *
 * Rendered above the application, not inside it: a hazard-striped bar with a
 * monospace TESTKESKKOND label, so nobody can mistake the persona switcher and
 * the time machine for part of the tool itself. It carries the three things a
 * tester needs at all times — who they are acting as, what the virtual clock
 * says, and a way back to a clean slate.
 *
 * Absent entirely when DEMO_MODE is off, and also **before a persona has been
 * chosen**: the opening screen is a gate, and a strip above it would both show
 * harness chrome before the environment has been entered and offer a dropdown
 * that skips the choice the screen exists to make.
 */

import { formatDateTimeShort } from '@/domain/format';
import { isDemoMode } from '@/lib/env';
import { getActor } from '@/server/auth/actor';
import { listPersonaOptions, nextDeadlineMs } from '@/server/personas';
import { TestStripControls } from './test-strip-controls';

export async function TestStrip() {
  if (!isDemoMode) return null;

  // Nothing but the choice until a persona is chosen. Resolved rather than read
  // from the cookie, so a stale cookie — one left by a reset, which mints new
  // ids — shows the gate instead of a strip naming a persona that is gone.
  const actor = await getActor();
  if (!actor) return null;

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

  const currentKey =
    actor.kind === 'buyer' ? `buyer:${actor.userId}` : `partner:${actor.partnerId}`;

  return (
    <div
      data-testid="test-strip"
      className="kh-no-print border-b-2 border-[var(--color-demo)] bg-[var(--color-demo-soft)] px-4 py-1.5 text-[var(--color-text)]"
      style={{
        backgroundImage:
          'repeating-linear-gradient(135deg, transparent 0 14px, color-mix(in srgb, var(--color-demo) 8%, transparent) 14px 28px)',
      }}
    >
      {/*
        One swipeable row on a phone, wrapping rows on wider screens. Four
        wrapped rows of test controls took 191px — a fifth of a phone screen —
        which pushed the persona choices under the browser chrome and made the
        opening screen look as though it offered nothing to choose.
      */}
      <div className="mx-auto flex max-w-[1600px] items-center gap-x-3 gap-y-1.5 overflow-x-auto whitespace-nowrap sm:flex-wrap sm:overflow-visible">
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
