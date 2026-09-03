/**
 * Deadline-driven work: close rounds whose window has passed, and send the
 * 24-hour reminders.
 *
 * Called from three places, all of which must be safe to overlap:
 *   - the in-process timer started at boot (every minute);
 *   - lazily when a round page is loaded, so a stale deadline is never shown;
 *   - immediately after the test clock is moved forward.
 *
 * Each round is handled in its own immediate transaction with a status
 * re-check, so the work is idempotent however many callers race. Closing runs
 * before reminders, so a round that has just closed never also gets a reminder.
 */

import { and, eq, isNotNull, lte } from 'drizzle-orm';
import { getDb } from '@/db';
import { rounds } from '@/db/schema';
import { markJobsRun, readClock } from '../clock';
import { DEADLINE_ACTOR, NO_EVIDENCE, type Ctx, type Db, type QueuedNotification } from '../context';
import { dispatchOutbox } from '../notify';
import { closeRound, sendDeadlineReminder } from './engine';

export interface JobsReport {
  /** codes of rounds closed by this run */
  closed: string[];
  remindersSent: number;
}

const REMINDER_WINDOW_MS = 86_400_000;

/**
 * Run everything the passage of time makes due.
 *
 * Returns synchronously so page loads can call it without awaiting; queued
 * emails are dispatched on a detached promise, since a mail failure must not
 * affect the render.
 */
export function runDueJobs(database?: Db): JobsReport {
  const db = database ?? getDb();
  const report: JobsReport = { closed: [], remindersSent: 0 };
  const outbox: QueuedNotification[] = [];

  const { nowMs } = readClock(db);

  /* 1. close whatever is overdue */
  const overdue = db
    .select({ id: rounds.id })
    .from(rounds)
    .where(
      and(eq(rounds.status, 'open'), isNotNull(rounds.deadlineAt), lte(rounds.deadlineAt, nowMs)),
    )
    .all();

  for (const row of overdue) {
    try {
      const result = db.transaction(
        (tx) => {
          const ctx: Ctx = {
            tx,
            at: readClock(tx).nowMs,
            actor: DEADLINE_ACTOR,
            evidence: NO_EVIDENCE,
            outbox,
          };
          return closeRound(ctx, row.id);
        },
        { behavior: 'immediate' },
      );
      if (result.closed) report.closed.push(result.code);
    } catch (error) {
      console.error(`[kaskaadhankija] vooru sulgemine ebaõnnestus (${row.id})`, error);
    }
  }

  /* 2. remind the partners of rounds inside the final 24 hours */
  const closing = db
    .select({ id: rounds.id })
    .from(rounds)
    .where(
      and(
        eq(rounds.status, 'open'),
        isNotNull(rounds.deadlineAt),
        lte(rounds.deadlineAt, nowMs + REMINDER_WINDOW_MS),
      ),
    )
    .all();

  for (const row of closing) {
    try {
      report.remindersSent += db.transaction(
        (tx) => {
          const ctx: Ctx = {
            tx,
            at: readClock(tx).nowMs,
            actor: DEADLINE_ACTOR,
            evidence: NO_EVIDENCE,
            outbox,
          };
          return sendDeadlineReminder(ctx, row.id);
        },
        { behavior: 'immediate' },
      );
    } catch (error) {
      console.error(`[kaskaadhankija] meeldetuletuse saatmine ebaõnnestus (${row.id})`, error);
    }
  }

  if (report.closed.length > 0 || report.remindersSent > 0) {
    try {
      db.transaction(
        (tx) => {
          markJobsRun({
            tx,
            at: readClock(tx).nowMs,
            actor: DEADLINE_ACTOR,
            evidence: NO_EVIDENCE,
            outbox: [],
          });
        },
        { behavior: 'immediate' },
      );
    } catch {
      // Bookkeeping only; never worth failing a request over.
    }
  }

  // Emails are a side effect of committed work: fire and forget.
  void dispatchOutbox(outbox);

  return report;
}
