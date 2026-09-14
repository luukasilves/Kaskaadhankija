/**
 * Deadline-driven work: close rounds whose window has passed, send the 24-hour
 * reminders and the two-hour summaries, and retry e-mails that failed to send.
 *
 * Called from three places, all of which must be safe to overlap:
 *   - the in-process timer started at boot (every minute);
 *   - lazily when a round page is loaded, so a stale deadline is never shown;
 *   - after any action that could have made something due.
 *
 * Each round is handled in its own immediate transaction with a status
 * re-check, so the work is idempotent however many callers race. Closing runs
 * before reminders and summaries, so a round that has just closed never also
 * gets either.
 */

import { and, eq, isNotNull, lte } from 'drizzle-orm';
import { getDb } from '@/db';
import { rounds } from '@/db/schema';
import { currentTimeMs, markJobsRun } from '../clock';
import { DEADLINE_ACTOR, NO_EVIDENCE, type Ctx, type Db, type QueuedNotification } from '../context';
import { purgeAuthRows } from '../auth/codes';
import { dispatchOutbox, retryFailedDeliveries } from '../notify';
import { FINAL_SUMMARY_WINDOW_MS, closeRound, sendDeadlineReminder, sendFinalSummary } from './engine';

export interface JobsReport {
  /** codes of rounds closed by this run */
  closed: string[];
  remindersSent: number;
  /** [D-11] personal summaries sent inside the final two hours */
  finalSummariesSent: number;
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
  const report: JobsReport = { closed: [], remindersSent: 0, finalSummariesSent: 0 };
  const outbox: QueuedNotification[] = [];

  const nowMs = currentTimeMs();

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
            at: currentTimeMs(),
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
            at: currentTimeMs(),
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

  /* 3. the personal summary inside the final two hours [D-11] */
  const ending = db
    .select({ id: rounds.id })
    .from(rounds)
    .where(
      and(
        eq(rounds.status, 'open'),
        isNotNull(rounds.deadlineAt),
        lte(rounds.deadlineAt, nowMs + FINAL_SUMMARY_WINDOW_MS),
      ),
    )
    .all();

  for (const row of ending) {
    try {
      report.finalSummariesSent += db.transaction(
        (tx) => {
          const ctx: Ctx = {
            tx,
            at: currentTimeMs(),
            actor: DEADLINE_ACTOR,
            evidence: NO_EVIDENCE,
            outbox,
          };
          return sendFinalSummary(ctx, row.id);
        },
        { behavior: 'immediate' },
      );
    } catch (error) {
      console.error(`[kaskaadhankija] lõppkokkuvõtte saatmine ebaõnnestus (${row.id})`, error);
    }
  }

  if (report.closed.length > 0 || report.remindersSent > 0 || report.finalSummariesSent > 0) {
    try {
      db.transaction(
        (tx) => {
          markJobsRun({
            tx,
            at: currentTimeMs(),
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
  void dispatchOutbox(outbox, db);

  /* 4. give failed e-mails another go, on wall-clock backoff [D-10] */
  void retryFailedDeliveries(db);

  /* 5. sweep out spent sign-in codes and ended sessions */
  try {
    purgeAuthRows(db);
  } catch (error) {
    console.error('[kaskaadhankija] sisselogimise kirjete koristus ebaõnnestus', error);
  }

  return report;
}
