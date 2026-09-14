/**
 * The deadline runner — the path production actually uses to close a round.
 *
 * The engine's own tests call `closeRound` directly; these check the loop that
 * finds what is due, and that it is safe to call from the timer, a page load
 * and a clock advance all at once.
 */

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { notifications, rounds } from '@/db/schema';
import { createHarness, seedLotWithPartners, type LotFixture, type TestHarness } from '../test-support';
import { confirmMarks, createRound, publishRound } from './engine';
import { runDueJobs } from './jobs';

let harness: TestHarness;
let fx: LotFixture;

beforeEach(() => {
  // The runner reads the real clock, so these tests must start from it.
  harness = createHarness(Date.now());
  fx = seedLotWithPartners(harness, { partnerCount: 3, trainingCount: 3 });
});

afterEach(() => harness.close());

/**
 * Move every round's window back by `ms` — which is what the passage of `ms`
 * looks like to the runner, now that the clock is the real one [L-23].
 */
function timePasses(ms: number): void {
  harness.write((ctx) => {
    for (const row of ctx.tx.select().from(rounds).all()) {
      ctx.tx
        .update(rounds)
        .set({
          publishedAt: row.publishedAt === null ? null : row.publishedAt - ms,
          deadlineAt: row.deadlineAt === null ? null : row.deadlineAt - ms,
          expectedDecisionAt:
            row.expectedDecisionAt === null ? null : row.expectedDecisionAt - ms,
        })
        .where(eq(rounds.id, row.id))
        .run();
    }
  });
  harness.now = Date.now();
}

const publish = () =>
  harness.write((ctx) => {
    const roundId = createRound(ctx, { lotId: fx.lotId, trainingIds: fx.trainingIds });
    publishRound(ctx, roundId);
    return roundId;
  });

const statusOf = (roundId: string) =>
  harness.read((db) => db.select().from(rounds).where(eq(rounds.id, roundId)).get())?.status;

describe('runDueJobs', () => {
  it('does nothing while the deadline is in the future', () => {
    const roundId = publish();
    const report = runDueJobs(harness.db);
    expect(report.closed).toEqual([]);
    expect(statusOf(roundId)).toBe('open');
  });

  it('closes a round once its deadline has passed', () => {
    const roundId = publish();
    harness.write((ctx) => confirmMarks(ctx, roundId, fx.partnerIds[0], { marks: [fx.trainingIds[0]], cap: null }));

    timePasses(10 * 86_400_000);
    const report = runDueJobs(harness.db);

    expect(report.closed).toHaveLength(1);
    expect(statusOf(roundId)).toBe('closed');
  });

  it('is idempotent across repeated runs', () => {
    publish();
    timePasses(10 * 86_400_000);

    const first = runDueJobs(harness.db);
    const second = runDueJobs(harness.db);
    const third = runDueJobs(harness.db);

    expect(first.closed).toHaveLength(1);
    expect(second.closed).toEqual([]);
    expect(third.closed).toEqual([]);
    const closedEvents = harness.read((db) =>
      db.select().from(notifications).where(eq(notifications.type, 'buyer_round_closed')).all(),
    );
    expect(closedEvents).toHaveLength(1);
  });

  it('closes several overdue rounds in one run', () => {
    const other = seedLotWithPartners(harness, { code: 'OSA-5', partnerCount: 2, trainingCount: 2 });
    publish();
    harness.write((ctx) => {
      const id = createRound(ctx, { lotId: other.lotId, trainingIds: other.trainingIds });
      publishRound(ctx, id);
    });

    timePasses(15 * 86_400_000);
    expect(runDueJobs(harness.db).closed).toHaveLength(2);
  });

  it('sends the reminder inside the final 24 hours, once', () => {
    const roundId = publish();
    const deadline = harness.read((db) =>
      db.select().from(rounds).where(eq(rounds.id, roundId)).get(),
    )!.deadlineAt!;

    // Bring the deadline to twelve hours from now.
    timePasses(deadline - 12 * 3_600_000 - Date.now());

    expect(runDueJobs(harness.db).remindersSent).toBe(3);
    expect(runDueJobs(harness.db).remindersSent).toBe(0);
    expect(statusOf(roundId)).toBe('open');
  });

  it('does not remind about a round it has just closed', () => {
    publish();
    timePasses(10 * 86_400_000);
    const report = runDueJobs(harness.db);
    expect(report.closed).toHaveLength(1);
    expect(report.remindersSent).toBe(0);
    expect(
      harness.read((db) =>
        db.select().from(notifications).where(eq(notifications.type, 'reminder_24h')).all(),
      ),
    ).toHaveLength(0);
  });

  it('sends the final summary inside the last two hours, to those who confirmed, once [D-11]', () => {
    // The runner reads the real clock and confirmations are append-only, so the
    // confirmation is made three hours ago rather than moved there.
    harness.now = Date.now() - 3 * 3_600_000;
    const roundId = publish();
    harness.write((ctx) =>
      confirmMarks(ctx, roundId, fx.partnerIds[0], { marks: [fx.trainingIds[0]], cap: null }),
    );
    harness.now = Date.now();
    const deadline = harness.read((db) =>
      db.select().from(rounds).where(eq(rounds.id, roundId)).get(),
    )!.deadlineAt!;

    // Twelve hours out: the reminder is due, the summary is not.
    timePasses(deadline - 12 * 3_600_000 - Date.now());
    let report = runDueJobs(harness.db);
    expect(report.remindersSent).toBe(3);
    expect(report.finalSummariesSent).toBe(0);

    // One hour out: the summary goes to the one partner who confirmed, once.
    timePasses(11 * 3_600_000);
    report = runDueJobs(harness.db);
    expect(report.finalSummariesSent).toBe(1);
    expect(runDueJobs(harness.db).finalSummariesSent).toBe(0);
    expect(
      harness.read((db) =>
        db.select().from(notifications).where(eq(notifications.type, 'reminder_final')).all(),
      ),
    ).toHaveLength(1);
    expect(statusOf(roundId)).toBe('open');
  });

  it('never summarises a round it has just closed', () => {
    harness.now = Date.now() - 3 * 3_600_000;
    const roundId = publish();
    harness.write((ctx) =>
      confirmMarks(ctx, roundId, fx.partnerIds[0], { marks: [fx.trainingIds[0]], cap: null }),
    );
    harness.now = Date.now();
    timePasses(10 * 86_400_000);
    const report = runDueJobs(harness.db);
    expect(report.closed).toHaveLength(1);
    expect(report.finalSummariesSent).toBe(0);
    expect(
      harness.read((db) =>
        db.select().from(notifications).where(eq(notifications.type, 'reminder_final')).all(),
      ),
    ).toHaveLength(0);
  });

  it('ignores draft and cancelled rounds', () => {
    const draftId = harness.write((ctx) =>
      createRound(ctx, { lotId: fx.lotId, trainingIds: fx.trainingIds }),
    );
    timePasses(20 * 86_400_000);
    expect(runDueJobs(harness.db).closed).toEqual([]);
    expect(statusOf(draftId)).toBe('draft');
  });
});
