/**
 * The partner's calendar [N-02]: what the company holds and what it has
 * promised, across rounds, and the same-day hint derived from it.
 */

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { trainings } from '@/db/schema';
import { createHarness, seedLotWithPartners, type LotFixture, type TestHarness } from '../test-support';
import { closeRound, confirmAllocation, confirmMarks, createRound, publishRound } from './engine';
import { commitmentsByDay, partnerCalendar } from './views';

let harness: TestHarness;
let fx: LotFixture;

/** Wednesday 30 Sep 2026, 10:00 Tallinn. */
const START = Date.UTC(2026, 8, 30, 7, 0);

beforeEach(() => {
  harness = createHarness(START);
  fx = seedLotWithPartners(harness, { partnerCount: 3, trainingCount: 6 });
});

afterEach(() => harness.close());

const openRound = (trainingIds: string[]) =>
  harness.write((ctx) => {
    const id = createRound(ctx, { lotId: fx.lotId, trainingIds });
    publishRound(ctx, id);
    return id;
  });
const codeOf = (trainingId: string) =>
  harness.read((db) => db.select({ code: trainings.code }).from(trainings).where(eq(trainings.id, trainingId)).get())!.code;
const calendar = () => harness.read((db) => partnerCalendar(db, fx.partnerIds[0]!));

describe('[N-02] the partner calendar', () => {
  it('is empty until the company holds or has confirmed something', () => {
    openRound([fx.trainingIds[0]!]);
    expect(calendar()).toEqual([]);
  });

  it('shows a confirmed mark as pending while the round is undecided, and as held once the buyer confirms', () => {
    const roundId = openRound([fx.trainingIds[0]!, fx.trainingIds[1]!]);
    harness.write((ctx) => confirmMarks(ctx, roundId, fx.partnerIds[0]!, { marks: [fx.trainingIds[0]!], cap: null }));

    expect(calendar().map((e) => [e.code, e.kind, e.roundId])).toEqual([[codeOf(fx.trainingIds[0]!), 'confirmed', roundId]]);

    harness.advance(6 * 86_400_000);
    harness.write((ctx) => closeRound(ctx, roundId));
    // Closed and awaiting the decision: still a promise, still shown.
    expect(calendar().map((e) => e.kind)).toEqual(['confirmed']);

    harness.write((ctx) => confirmAllocation(ctx, roundId));
    // Decided: the allocation is the truth and the confirmation is history.
    expect(calendar().map((e) => [e.code, e.kind, e.roundId])).toEqual([[codeOf(fx.trainingIds[0]!), 'allocated', null]]);
  });

  it('spans rounds, sorts by date, and names the same day for the marking table', () => {
    const first = openRound([fx.trainingIds[0]!, fx.trainingIds[1]!]);
    const second = openRound([fx.trainingIds[2]!, fx.trainingIds[3]!]);
    // Two trainings on one day, in two rounds.
    harness.write((ctx) => {
      ctx.tx.update(trainings).set({ eventDate: '2026-11-10' }).where(eq(trainings.id, fx.trainingIds[0]!)).run();
      ctx.tx.update(trainings).set({ eventDate: '2026-11-10' }).where(eq(trainings.id, fx.trainingIds[2]!)).run();
      ctx.tx.update(trainings).set({ eventDate: '2026-10-05' }).where(eq(trainings.id, fx.trainingIds[3]!)).run();
    });
    harness.write((ctx) => confirmMarks(ctx, first, fx.partnerIds[0]!, { marks: [fx.trainingIds[0]!], cap: null }));
    harness.write((ctx) => confirmMarks(ctx, second, fx.partnerIds[0]!, { marks: [fx.trainingIds[2]!, fx.trainingIds[3]!], cap: null }));

    const entries = calendar();
    expect(entries.map((e) => e.eventDate)).toEqual(['2026-10-05', '2026-11-10', '2026-11-10']);

    // Marking the second round: the first round's training warns, the second's own do not.
    const busy = commitmentsByDay(entries, second);
    expect(busy.get('2026-11-10')).toEqual([codeOf(fx.trainingIds[0]!)]);
    expect(busy.get('2026-10-05')).toBeUndefined();
    // And without an exception every day is listed.
    expect(commitmentsByDay(entries).get('2026-11-10')?.sort()).toEqual([codeOf(fx.trainingIds[0]!), codeOf(fx.trainingIds[2]!)].sort());
  });

  it('never shows another company’s trainings [N-04]', () => {
    const roundId = openRound([fx.trainingIds[0]!]);
    harness.write((ctx) => confirmMarks(ctx, roundId, fx.partnerIds[1]!, { marks: [fx.trainingIds[0]!], cap: null }));
    expect(calendar()).toEqual([]);
  });
});
