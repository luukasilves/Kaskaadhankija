/**
 * The virtual clock.
 *
 * A three-working-day response window is the point of the cascade, and it is
 * also the reason nobody can evaluate the tool by clicking through it: you
 * would have to wait three days to see a deadline pass. So the whole system
 * reads "now" from one place, and in the test harness that place can be moved
 * forward.
 *
 * Two rules keep this honest:
 *  - the offset is stored in the database, not in a process variable, so every
 *    request and the background timer agree;
 *  - the domain never reads a clock. `allocate` takes `cutAt`, `addWorkingDays`
 *    takes `from`. Only engine entry points call `nowMs`, once, and pass the
 *    instant down. Working-day and DST arithmetic is therefore unaffected — it
 *    simply receives a different instant [E-06].
 *
 * In production the offset is always 0 and the controls do not exist.
 */

import { eq, sql } from 'drizzle-orm';
import { appState } from '@/db/schema';
import type { Ctx, Db, Tx } from './context';

type Reader = Tx | Db;

/** Create the single app_state row if it is missing. */
export function ensureAppState(tx: Reader): void {
  tx.insert(appState)
    .values({ id: 1, clockOffsetMs: 0, seedVersion: 0 })
    .onConflictDoNothing()
    .run();
}

export interface ClockState {
  nowMs: number;
  offsetMs: number;
}

export function readClock(tx: Reader): ClockState {
  const row = tx.select().from(appState).where(eq(appState.id, 1)).get();
  const offsetMs = row?.clockOffsetMs ?? 0;
  return { nowMs: Date.now() + offsetMs, offsetMs };
}

/**
 * The instant for this action. Called once per transaction so every timestamp
 * it writes is identical — which the ordering of confirmations depends on.
 */
export function nowMs(tx: Reader): number {
  return readClock(tx).nowMs;
}

/**
 * Move the clock forward by `ms`. Forward only: monotonic time keeps the
 * append-only tables coherent, and going back would strand confirmations after
 * a deadline that had not happened yet.
 */
export function shiftClock(tx: Reader, ms: number): number {
  if (!Number.isFinite(ms) || ms <= 0) {
    throw new Error('Kella saab kerida ainult edasi.');
  }
  tx.update(appState)
    .set({ clockOffsetMs: sql`${appState.clockOffsetMs} + ${Math.round(ms)}` })
    .where(eq(appState.id, 1))
    .run();
  return readClock(tx).nowMs;
}

/**
 * Set the offset directly. Used only by the seed, which replays history against
 * a rewound clock so the audit trail and mailbox it produces are genuine.
 */
export function setClockOffset(tx: Reader, offsetMs: number): void {
  tx.update(appState).set({ clockOffsetMs: Math.round(offsetMs) }).where(eq(appState.id, 1)).run();
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
