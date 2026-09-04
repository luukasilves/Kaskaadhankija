/**
 * The seed is only useful if Scenario A really is Lisa B.
 *
 * The spec's worked example is the acceptance test for the algorithm, and the
 * scenario exists so a tester can walk that example on screen. If the sample
 * calendar, the ranking file or the scenario script drifts, the tester would be
 * comparing the document against something else — so assert the identity here,
 * against the real seed, the real import and the real engine calls.
 */

import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { allocate, partnerView, type ConfirmationSnapshot } from '@/domain/allocate';
import {
  LISA_B1_EXPECTED,
  LISA_B2_EXPECTED,
  LISA_B2_PROJECTION_COUNTS,
  asMap,
} from '@/domain/__fixtures__/lisa-b';
import { projectionInput } from '@/server/rounds/allocation-input';
import { participantsOf } from '@/server/rounds/views';
import { createHarness, type TestHarness } from '@/server/test-support';
import { seedBaseData } from './seed';
import { seedScenarios } from './seed-scenarios';
import { lots, notifications, orders, rounds, trainings } from './schema';

/** A Wednesday, so "2 working days ago" does not cross a weekend. */
const NOW = Date.UTC(2026, 8, 30, 9, 0);

const LISA_B_CODES = [
  'KK-2026-201',
  'KK-2026-202',
  'KK-2026-203',
  'KK-2026-204',
  'KK-2026-205',
  'KK-2026-206',
] as const;

let harness: TestHarness;
let openRoundId: string;

beforeAll(() => {
  harness = createHarness(NOW);
  harness.write((ctx) => seedBaseData(ctx));
  openRoundId = harness.write((ctx) => seedScenarios(ctx.tx, NOW, ctx.actor.label).openRoundId);
});

afterAll(() => harness.close());

/** K1..K6 → the seeded training ids, so expectations can speak Lisa B's names. */
function keyMap(): Map<string, string> {
  const rows = harness.read((db) =>
    db.select({ id: trainings.id, code: trainings.code }).from(trainings).all(),
  );
  const toKey = new Map<string, string>();
  LISA_B_CODES.forEach((code, index) => {
    const row = rows.find((r) => r.code === code);
    if (!row) throw new Error(`näidisfailist puudub ${code}`);
    toKey.set(row.id, `K${index + 1}`);
  });
  return toKey;
}

describe('Stsenaarium A on Lisa B', () => {
  it('is an open OSA-2 round over the six Lisa B trainings', () => {
    const round = harness.read((db) =>
      db
        .select({ status: rounds.status, visibilityMode: rounds.visibilityMode, lotCode: lots.code })
        .from(rounds)
        .innerJoin(lots, eq(lots.id, rounds.lotId))
        .where(eq(rounds.id, openRoundId))
        .get(),
    );
    expect(round?.status).toBe('open');
    expect(round?.lotCode).toBe('OSA-2');
    expect(round?.visibilityMode).toBe('dynamic');

    const input = harness.read((db) => projectionInput(db, openRoundId, NOW));
    expect(input.trainings.map((t) => t.code).sort()).toEqual([...LISA_B_CODES]);
  });

  it('seats A, B, C in the ranks Lisa B gives them', () => {
    const participants = harness.read((db) => participantsOf(db, openRoundId));
    expect(participants.map((p) => `${p.rankAtPublication} ${p.partnerName}`)).toEqual([
      '1 AI Akadeemia OÜ',
      '2 Digioskus MTÜ',
      '3 Tehisaru Koolitus OÜ',
      '4 Targa Töö Koolitus OÜ',
    ]);
  });

  it('[J-02] allocates exactly Lisa B.1 once C confirms its draft', () => {
    // C's marks are seeded as an unconfirmed draft on purpose, so the allocation
    // Lisa B.1 describes is the one that follows from C confirming them.
    const toKey = keyMap();
    const input = harness.read((db) => projectionInput(db, openRoundId, NOW));
    const participants = harness.read((db) => participantsOf(db, openRoundId));
    const c = participants.find((p) => p.rankAtPublication === 3)!;
    expect(c.draftMarks.map((id) => toKey.get(id)).sort()).toEqual(['K1', 'K3', 'K4', 'K5', 'K6']);

    const withC = {
      ...input,
      participants: input.participants.map((participant) =>
        participant.lotPartnerId === c.lotPartnerId
          ? {
              ...participant,
              confirmations: [
                {
                  id: 999,
                  kind: 'confirm',
                  marks: c.draftMarks,
                  cap: c.draftCap,
                  confirmedAt: NOW,
                } satisfies ConfirmationSnapshot,
              ],
            }
          : participant,
      ),
    };

    const byRank = new Map(participants.map((p) => [p.lotPartnerId, p.rankAtPublication]));
    const named = Object.fromEntries(
      Object.entries(asMap(allocate(withC).allocations)).map(([lotPartnerId, ids]) => [
        ['', 'A', 'B', 'C'][byRank.get(lotPartnerId) ?? 0],
        ids.map((id) => toKey.get(id)),
      ]),
    );
    expect(named).toEqual({
      A: LISA_B1_EXPECTED.A,
      B: LISA_B1_EXPECTED.B,
      C: LISA_B1_EXPECTED.C,
    });
    expect(allocate(withC).leftover).toEqual(LISA_B1_EXPECTED.leftover);
  });

  it('[N-03] shows each partner exactly its Lisa B.2 column', () => {
    const toKey = keyMap();
    const input = harness.read((db) => projectionInput(db, openRoundId, NOW));
    const participants = harness.read((db) => participantsOf(db, openRoundId));

    for (const [rank, name] of [
      [1, 'A'],
      [2, 'B'],
      [3, 'C'],
    ] as const) {
      const participant = participants.find((p) => p.rankAtPublication === rank)!;
      // Every partner's own view runs off what they currently hold: a
      // confirmation for A and B, the saved draft for C [L-11].
      const own =
        rank === 3
          ? { marks: participant.draftMarks, cap: participant.draftCap }
          : (() => {
              const confirmations = input.participants.find(
                (p) => p.lotPartnerId === participant.lotPartnerId,
              )!.confirmations;
              const last = confirmations[confirmations.length - 1]!;
              return { marks: last.marks, cap: last.cap };
            })();

      const view = partnerView(input, participant.lotPartnerId, own);
      const cells = Object.fromEntries(
        view.rows.map((row) => [
          toKey.get(row.trainingId)!,
          row.reason ? `${row.state}/${row.reason}` : row.state,
        ]),
      );
      expect(cells, `Lisa B.2 veerg ${name}`).toEqual(LISA_B2_EXPECTED[name]);
      expect(view.projectedCount, `prognoos ${name}`).toBe(LISA_B2_PROJECTION_COUNTS[name]);
    }
  });

  it('[K-05] keeps A’s revision history, with the later confirmation binding', () => {
    const input = harness.read((db) => projectionInput(db, openRoundId, NOW));
    const a = input.participants.find((p) => p.rank === 1)!;
    expect(a.confirmations).toHaveLength(2);
    expect(a.confirmations[0]!.cap).toBeNull();
    expect(a.confirmations[1]!.cap).toBe(2);
    expect(a.confirmations[0]!.confirmedAt).toBeLessThan(a.confirmations[1]!.confirmedAt);
  });

  it('[K-08] leaves the silent partner without a confirmation or a draft', () => {
    const participants = harness.read((db) => participantsOf(db, openRoundId));
    const silent = participants.find((p) => p.rankAtPublication === 4)!;
    expect(silent.draftMarks).toEqual([]);
    const input = harness.read((db) => projectionInput(db, openRoundId, NOW));
    expect(
      input.participants.find((p) => p.lotPartnerId === silent.lotPartnerId)!.confirmations,
    ).toEqual([]);
  });
});

describe('ülejäänud stsenaariumid', () => {
  it('leaves one finished round with an order per allocated partner', () => {
    const finished = harness.read((db) =>
      db.select({ id: rounds.id, code: rounds.code, status: rounds.status }).from(rounds).all(),
    );
    expect(finished.filter((r) => r.status === 'confirmed')).toHaveLength(2);
    expect(finished.filter((r) => r.status === 'draft')).toHaveLength(1);
    expect(finished.filter((r) => r.status === 'open')).toHaveLength(1);

    const orderRows = harness.read((db) =>
      db.select({ id: orders.id, snapshot: orders.documentSnapshot }).from(orders).all(),
    );
    // Scenario 0: one order of five. Scenario B: two orders, of two each.
    expect(orderRows.map((o) => o.snapshot.trainings.length).sort()).toEqual([2, 2, 5]);
    for (const order of orderRows) {
      expect(order.snapshot.totalEur).toBeGreaterThan(0);
      expect(order.snapshot.partnerConfirmedAt).not.toBeNull();
    }
  });

  it('[T-06] leaves Scenario B’s unmarked training as jääk', () => {
    const leftover = harness.read((db) =>
      db
        .select({ code: trainings.code, status: trainings.status })
        .from(trainings)
        .where(eq(trainings.status, 'leftover'))
        .all(),
    );
    expect(leftover.map((t) => t.code)).toEqual(['KK-2026-305']);
  });

  it('[T-01] puts a partner at or over its lot threshold, so the warning is reachable', () => {
    const workloads = harness.read((db) =>
      db
        .select({
          partner: trainings.allocatedLotPartnerId,
          status: trainings.status,
          lotId: trainings.lotId,
        })
        .from(trainings)
        .all()
        .filter((row) => row.status === 'allocated' && row.partner !== null),
    );
    const osa2 = harness.read((db) =>
      db.select({ id: lots.id, threshold: lots.workloadThreshold }).from(lots).where(eq(lots.code, 'OSA-2')).get(),
    )!;
    const counts = new Map<string, number>();
    for (const row of workloads.filter((r) => r.lotId === osa2.id)) {
      counts.set(row.partner!, (counts.get(row.partner!) ?? 0) + 1);
    }
    expect(Math.max(...counts.values())).toBeGreaterThanOrEqual(osa2.threshold);
  });

  it('records the notifications the scenarios would really have sent', () => {
    const rows = harness.read((db) =>
      db
        .select({ type: notifications.type, recipient: notifications.recipientLotPartnerId })
        .from(notifications)
        .all(),
    );
    const kinds = new Set(rows.map((row) => row.type));
    for (const expected of [
      'round_published',
      'confirmation_receipt',
      'decline_receipt',
      'projection_changed',
      'order_issued',
      'allocated_elsewhere',
    ]) {
      expect(kinds, `teavitus ${expected}`).toContain(expected);
    }

    // [D-04][L-13] the projection notice goes to the partner whose projection
    // someone else's revision moved — B, when A capped itself and released K3.
    const participants = harness.read((db) => participantsOf(db, openRoundId));
    const b = participants.find((p) => p.rankAtPublication === 2)!;
    const projectionNotices = rows.filter((row) => row.type === 'projection_changed');
    expect(projectionNotices.map((row) => row.recipient)).toEqual([b.lotPartnerId]);
  });
});
