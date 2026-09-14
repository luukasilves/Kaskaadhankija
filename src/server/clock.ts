/**
 * The clock.
 *
 * One function answers "what time is it", and it answers with the real time.
 *
 * v2 had a virtual clock here: an offset stored in `app_state` that a tester
 * could wind forward, because a three-working-day response window cannot be
 * evaluated by clicking through it. That went with the rest of the demo
 * machinery [L-23] — a test round now simply names a short window in its own
 * scheme file, so the cascade runs in an afternoon on real time, and the
 * timestamps in a protocol are the instants things actually happened at.
 *
 * The seam stays, for two reasons: the domain never reads a clock (`allocate`
 * takes `cutAt`, `addWorkingDays` takes `from`, and every engine entry point is
 * handed its instant), which is what makes the whole engine testable against an
 * injected time; and if the buyer's own environment ever supplies time
 * differently, this is the one place that changes.
 */

import { eq } from 'drizzle-orm';
import { appState } from '@/db/schema';
import type { Ctx, Db, Tx } from './context';

type Reader = Tx | Db;

/**
 * The instant for this action. Called once per transaction so every timestamp
 * it writes is identical — which the ordering of confirmations depends on.
 */
export function currentTimeMs(): number {
  return Date.now();
}

/** Create the single app_state row if it is missing. */
export function ensureAppState(tx: Reader): void {
  tx.insert(appState).values({ id: 1, seedVersion: 0 }).onConflictDoNothing().run();
}

export function markJobsRun(ctx: Ctx): void {
  ctx.tx.update(appState).set({ lastJobsRunAt: ctx.at }).where(eq(appState.id, 1)).run();
}

export function readSeedVersion(tx: Reader): number {
  return tx.select().from(appState).where(eq(appState.id, 1)).get()?.seedVersion ?? 0;
}

export function writeSeedVersion(tx: Reader, version: number, at: number): void {
  tx.update(appState).set({ seedVersion: version, seededAt: at }).where(eq(appState.id, 1)).run();
}

export const MS_PER_HOUR = 3_600_000;
export const MS_PER_DAY = 86_400_000;
