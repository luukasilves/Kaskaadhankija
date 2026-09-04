'use server';

/**
 * Virtual clock controls — demo only.
 *
 * A three-working-day response window cannot be evaluated by clicking, so the
 * tester moves time instead of waiting. Advancing the clock immediately runs
 * the deadline jobs, so a round whose window has just passed closes in the same
 * request and the tester sees the consequence rather than having to wait for
 * the next timer tick.
 */

import { revalidatePath } from 'next/cache';
import { getDb } from '@/db';
import { assertDemoMode } from '@/lib/env';
import { auditEvents } from '@/db/schema';
import { MS_PER_DAY, MS_PER_HOUR, readClock, shiftClock } from '../clock';
import { nextDeadlineMs } from '../personas';
import { runDueJobs } from '../rounds/jobs';
import { getActor, actorRef } from '../auth/actor';

export interface ClockResult {
  nowMs: number;
  closedRoundCodes: string[];
  message: string;
}

async function advanceBy(ms: number, label: string): Promise<ClockResult> {
  assertDemoMode();
  const db = getDb();
  const actor = await getActor();

  const nowMs = db.transaction(
    (tx) => {
      const next = shiftClock(tx, ms);
      // The clock move is itself an audited event: a reader of the trail must be
      // able to tell that a timestamp jump was deliberate, not a bug.
      tx.insert(auditEvents)
        .values({
          occurredAt: next,
          actorType: 'tester',
          actorId: actor ? actorRef(actor).id : null,
          actorLabel: actor ? actorRef(actor).label : 'Testija',
          eventType: 'clock.advanced',
          summary: `Näidise kella keriti edasi: ${label}`,
          after: { shiftedMs: ms, nowMs: next },
        })
        .run();
      return next;
    },
    { behavior: 'immediate' },
  );

  const report = runDueJobs();
  revalidatePath('/', 'layout');

  const message =
    report.closed.length > 0
      ? `Aeg liikus edasi (${label}). Sulgus: ${report.closed.join(', ')} — jaotusettepanek külmutati.`
      : `Aeg liikus edasi (${label}).`;

  return { nowMs, closedRoundCodes: report.closed, message };
}

export async function advanceOneHour(): Promise<ClockResult> {
  return advanceBy(MS_PER_HOUR, '1 tund');
}

export async function advanceOneDay(): Promise<ClockResult> {
  return advanceBy(MS_PER_DAY, '1 ööpäev');
}

/** Jump just past the earliest pending response deadline. */
export async function advanceToNextDeadline(): Promise<ClockResult> {
  assertDemoMode();
  const db = getDb();
  const target = nextDeadlineMs();
  if (target === null) {
    return {
      nowMs: readClock(db).nowMs,
      closedRoundCodes: [],
      message: 'Ükski voor ei oota praegu vastust.',
    };
  }
  const { nowMs } = readClock(db);
  const delta = Math.max(60_000, target - nowMs + 60_000);
  return advanceBy(delta, 'järgmise tähtajani');
}

export async function readClockState(): Promise<{ nowMs: number; offsetMs: number }> {
  return readClock(getDb());
}
