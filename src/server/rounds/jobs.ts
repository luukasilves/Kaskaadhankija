/**
 * Deadline-driven work: close rounds whose window has passed, and send the
 * 24-hour reminders.
 *
 * Called from three places, all of which must be safe to overlap:
 *   - the in-process timer started at boot (every minute);
 *   - lazily when a round page is loaded, so a stale deadline cannot be seen;
 *   - immediately after the test clock is moved forward.
 *
 * Each round is processed in its own transaction with a status re-check, so the
 * work is idempotent no matter how many callers race.
 */

import { and, eq, isNotNull, lte } from 'drizzle-orm';
import { getDb } from '@/db';
import { rounds } from '@/db/schema';
import { readClock } from '../clock';

export interface JobsReport {
  closed: string[];
  remindersSent: number;
}

export function runDueJobs(): JobsReport {
  const db = getDb();
  const report: JobsReport = { closed: [], remindersSent: 0 };

  // Closing first: a round that just closed must not also get a reminder.
  const { nowMs } = readClock(db);
  const due = db
    .select({ id: rounds.id, code: rounds.code })
    .from(rounds)
    .where(and(eq(rounds.status, 'open'), isNotNull(rounds.deadlineAt), lte(rounds.deadlineAt, nowMs)))
    .all();

  for (const round of due) {
    // Populated in Phase 5 once the engine's closeRound exists.
    void round;
  }

  return report;
}
