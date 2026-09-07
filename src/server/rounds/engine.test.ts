/**
 * Integration tests for the round engine, against the real schema and the real
 * migrations (including the append-only triggers).
 *
 * Named after the rules of `docs/kaskaadi-ariloogika.md` they hold to account.
 * Where the spec's Lisa B worked example applies, these drive it through the
 * engine rather than the pure function, so the database plumbing is covered too.
 */

import { and, eq, inArray } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  auditEvents,
  confirmations,
  emailDeliveries,
  lotPartners,
  notifications,
  orderTrainings,
  orders,
  roundParticipants,
  roundTrainings,
  rounds,
  trainings,
} from '@/db/schema';
import { allocate } from '@/domain/allocate';
import { tallinnParts } from '@/domain/working-days';
import {
  addTrainingsToRound,
  applyAdjustment,
  cancelLeftover,
  cancelRound,
  clearAdjustment,
  closeRound,
  computeDefaultDeadline,
  confirmAllocation,
  confirmMarks,
  createRound,
  deactivateLotPartner,
  declineAll,
  extendDeadline,
  markTrainingCompleted,
  previewFinalAllocation,
  publishRound,
  recordPartnerWithdrawal,
  reissueLeftover,
  saveDraftMarks,
  sendDeadlineReminder,
  withdrawTraining,
} from './engine';
import { projectionInput } from './allocation-input';
import { participantsOf, responseStateFor, workloadFor } from './views';
import {
  createHarness,
  seedLotWithPartners,
  type LotFixture,
  type TestHarness,
} from '../test-support';

let harness: TestHarness;
let fx: LotFixture;

/** Wednesday 30 Sep 2026, 10:00 Tallinn — a plain working day. */
const START = Date.UTC(2026, 8, 30, 7, 0);

beforeEach(() => {
  harness = createHarness(START);
  fx = seedLotWithPartners(harness, { partnerCount: 3, trainingCount: 6 });
});

afterEach(() => {
  harness.close();
});

/* helpers */

const openRound = (trainingIds = fx.trainingIds) =>
  harness.write((ctx) => {
    const roundId = createRound(ctx, { lotId: fx.lotId, trainingIds });
    publishRound(ctx, roundId);
    return roundId;
  });

const confirm = (roundId: string, partnerIndex: number, marks: string[], cap: number | null = null) =>
  harness.write((ctx) =>
    confirmMarks(ctx, roundId, fx.partnerIds[partnerIndex], { marks, cap }),
  );

const roundRow = (roundId: string) =>
  harness.read((db) => db.select().from(rounds).where(eq(rounds.id, roundId)).get());

const trainingRow = (trainingId: string) =>
  harness.read((db) => db.select().from(trainings).where(eq(trainings.id, trainingId)).get());

const auditTypes = (roundId: string) =>
  harness.read((db) =>
    db
      .select({ type: auditEvents.eventType })
      .from(auditEvents)
      .where(eq(auditEvents.roundId, roundId))
      .all()
      .map((r) => r.type),
  );

const allocationMap = (roundId: string) => {
  const round = roundRow(roundId);
  const result = (round?.finalSnapshot ?? round?.proposalSnapshot)?.result;
  if (!result) return {};
  return Object.fromEntries(
    result.allocations.map((a) => [fx.lotPartnerIds.indexOf(a.lotPartnerId), a.trainingIds]),
  );
};

/* ------------------------------------------------------------------ */

describe('[V-01] a round goes to every active partner of the lot', () => {
  it('creates one participant per active member, with the rank snapshot', () => {
    const roundId = openRound();
    const participants = harness.read((db) => participantsOf(db, roundId));
    expect(participants).toHaveLength(3);
    expect(participants.map((p) => p.rankAtPublication)).toEqual([1, 2, 3]);
    expect(participants.map((p) => p.lotPartnerId)).toEqual(fx.lotPartnerIds);
  });

  it('snapshots each partner’s contact as evidence [D-09]', () => {
    const roundId = openRound();
    const participants = harness.read((db) => participantsOf(db, roundId));
    expect(participants[0].contactEmail).toBe('kontakt1@naidis.ee');
  });

  it('excludes a deactivated member from a new round', () => {
    harness.write((ctx) => {
      ctx.tx
        .update(lotPartners)
        .set({ isActive: false })
        .where(eq(lotPartners.id, fx.lotPartnerIds[1]))
        .run();
    });
    const roundId = openRound();
    const participants = harness.read((db) => participantsOf(db, roundId));
    expect(participants).toHaveLength(2);
    expect(participants.map((p) => p.rankAtPublication)).toEqual([1, 3]);
  });

  it('refuses to publish a lot with no active members', () => {
    harness.write((ctx) => {
      for (const id of fx.lotPartnerIds) {
        ctx.tx.update(lotPartners).set({ isActive: false }).where(eq(lotPartners.id, id)).run();
      }
    });
    expect(() => openRound()).toThrow(/aktiivseid raamlepingu partnereid/);
  });

  it('refuses to publish an empty round', () => {
    expect(() =>
      harness.write((ctx) => {
        const roundId = createRound(ctx, { lotId: fx.lotId, trainingIds: [] });
        publishRound(ctx, roundId);
      }),
    ).toThrow(/ei ole ühtegi koolitust/);
  });

  it('notifies every partner on publication [D-01]', () => {
    const roundId = openRound();
    const sent = harness.read((db) =>
      db
        .select()
        .from(notifications)
        .where(and(eq(notifications.roundId, roundId), eq(notifications.type, 'round_published')))
        .all(),
    );
    expect(sent).toHaveLength(3);
    // One queued e-mail per notice, to the contact of the membership [D-10].
    const deliveries = harness.read((db) =>
      db
        .select()
        .from(emailDeliveries)
        .where(inArray(emailDeliveries.notificationId, sent.map((n) => n.id)))
        .all(),
    );
    expect(deliveries).toHaveLength(3);
    expect(deliveries.every((d) => d.to.startsWith('kontakt') && d.status === 'queued')).toBe(true);
  });
});

describe('[V-03] the response deadline', () => {
  it('defaults to the lot’s working days at its local time', () => {
    const roundId = openRound();
    const deadline = roundRow(roundId)?.deadlineAt;
    expect(deadline).toBeTruthy();
    // Wed 30 Sep + 3 working days → Mon 5 Oct, 17:00 Tallinn.
    const parts = tallinnParts(new Date(deadline!));
    expect([parts.year, parts.month, parts.day, parts.hour]).toEqual([2026, 10, 5, 17]);
  });

  it('accepts a later deadline than the default', () => {
    const later = Date.UTC(2026, 9, 9, 14, 0);
    const roundId = harness.write((ctx) => {
      const id = createRound(ctx, { lotId: fx.lotId, trainingIds: fx.trainingIds });
      publishRound(ctx, id, { deadlineAt: later });
      return id;
    });
    expect(roundRow(roundId)?.deadlineAt).toBe(later);
  });

  it('refuses a deadline earlier than the lot default', () => {
    expect(() =>
      harness.write((ctx) => {
        const id = createRound(ctx, { lotId: fx.lotId, trainingIds: fx.trainingIds });
        publishRound(ctx, id, { deadlineAt: START + 3_600_000 });
      }),
    ).toThrow(/ei saa olla varasem/);
  });

  it('records when the buyer’s decision is expected [T-07]', () => {
    const roundId = openRound();
    const round = roundRow(roundId);
    expect(round?.expectedDecisionAt).toBeGreaterThan(round!.deadlineAt!);
  });
});

describe('[V-07] a published round keeps its own ranking', () => {
  it('is unaffected by a later change to the lot ranking', () => {
    const roundId = openRound();
    confirm(roundId, 0, [fx.trainingIds[0]]);
    confirm(roundId, 2, [fx.trainingIds[0]]);

    // Reverse the lot ranking after publication.
    harness.write((ctx) => {
      ctx.tx.update(lotPartners).set({ rank: 90 }).where(eq(lotPartners.id, fx.lotPartnerIds[0])).run();
      ctx.tx.update(lotPartners).set({ rank: 1 }).where(eq(lotPartners.id, fx.lotPartnerIds[2])).run();
    });

    harness.advance(6 * 86_400_000);
    harness.write((ctx) => closeRound(ctx, roundId));
    // Rank 1 at publication still wins.
    expect(allocationMap(roundId)[0]).toEqual([fx.trainingIds[0]]);
  });
});

describe('[K-02][K-04] confirming and revising', () => {
  it('stores each confirmation as a new append-only row', () => {
    const roundId = openRound();
    confirm(roundId, 0, [fx.trainingIds[0]]);
    harness.advance(3_600_000);
    confirm(roundId, 0, [fx.trainingIds[0], fx.trainingIds[1]]);

    const rows = harness.read((db) =>
      db
        .select()
        .from(confirmations)
        .where(eq(confirmations.lotPartnerId, fx.lotPartnerIds[0]))
        .all(),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].marks).toHaveLength(1);
    expect(rows[1].marks).toHaveLength(2);
  });

  it('binds the latest confirmation before the deadline', () => {
    const roundId = openRound();
    confirm(roundId, 0, [fx.trainingIds[0], fx.trainingIds[1]]);
    harness.advance(3_600_000);
    confirm(roundId, 0, [fx.trainingIds[0]]);
    confirm(roundId, 1, [fx.trainingIds[1]]);

    harness.advance(6 * 86_400_000);
    harness.write((ctx) => closeRound(ctx, roundId));
    const map = allocationMap(roundId);
    expect(map[0]).toEqual([fx.trainingIds[0]]);
    // The training partner 1 dropped flowed down.
    expect(map[1]).toEqual([fx.trainingIds[1]]);
  });

  it('rejects a confirmation from a company that is not in the round', () => {
    const other = seedLotWithPartners(harness, { code: 'OSA-9', partnerCount: 1, trainingCount: 1 });
    const roundId = openRound();
    const result = harness.write((ctx) =>
      confirmMarks(ctx, roundId, other.partnerIds[0], { marks: [], cap: null }),
    );
    expect(result).toMatchObject({ ok: false, reason: 'not_participant' });
  });

  it('drops marks on trainings that are not in the round', () => {
    const roundId = openRound([fx.trainingIds[0], fx.trainingIds[1]]);
    confirm(roundId, 0, [fx.trainingIds[0], fx.trainingIds[4]]);
    const row = harness.read((db) =>
      db
        .select()
        .from(confirmations)
        .where(eq(confirmations.lotPartnerId, fx.lotPartnerIds[0]))
        .get(),
    );
    expect(row?.marks).toEqual([fx.trainingIds[0]]);
  });

  it('keeps a draft separate from the binding answer [K-03]', () => {
    const roundId = openRound();
    confirm(roundId, 0, [fx.trainingIds[0]]);
    harness.write((ctx) =>
      saveDraftMarks(ctx, roundId, fx.partnerIds[0], {
        marks: [fx.trainingIds[0], fx.trainingIds[1]],
        cap: null,
      }),
    );

    const participant = harness.read((db) => participantsOf(db, roundId))[0];
    const latest = harness.read((db) =>
      db
        .select()
        .from(confirmations)
        .where(eq(confirmations.lotPartnerId, fx.lotPartnerIds[0]))
        .get(),
    );
    expect(responseStateFor(latest, participant.draftMarks, participant.draftCap)).toBe(
      'unconfirmed_changes',
    );

    // The draft must not affect the outcome.
    harness.advance(6 * 86_400_000);
    harness.write((ctx) => closeRound(ctx, roundId));
    expect(allocationMap(roundId)[0]).toEqual([fx.trainingIds[0]]);
  });

  it('sends a receipt for every confirmation [D-02]', () => {
    const roundId = openRound();
    confirm(roundId, 0, [fx.trainingIds[0]]);
    const receipts = harness.read((db) =>
      db
        .select()
        .from(notifications)
        .where(eq(notifications.type, 'confirmation_receipt'))
        .all(),
    );
    expect(receipts).toHaveLength(1);
    expect(receipts[0].body).toContain('Kinnitame');
  });
});

describe('[K-07][E-03] declining', () => {
  it('records an explicit decline distinctly', () => {
    const roundId = openRound();
    harness.write((ctx) => declineAll(ctx, roundId, fx.partnerIds[0]));
    const row = harness.read((db) =>
      db
        .select()
        .from(confirmations)
        .where(eq(confirmations.lotPartnerId, fx.lotPartnerIds[0]))
        .get(),
    );
    expect(row?.kind).toBe('decline_all');
    const receipts = harness.read((db) =>
      db.select().from(notifications).where(eq(notifications.type, 'decline_receipt')).all(),
    );
    expect(receipts).toHaveLength(1);
  });

  it('treats an empty confirmation as a decline', () => {
    const roundId = openRound();
    confirm(roundId, 0, []);
    const row = harness.read((db) =>
      db
        .select()
        .from(confirmations)
        .where(eq(confirmations.lotPartnerId, fx.lotPartnerIds[0]))
        .get(),
    );
    expect(row?.kind).toBe('decline_all');
  });
});

describe('[E-05][V-06] acting after the deadline', () => {
  it('rejects the action, audits it, and closes the round', () => {
    const roundId = openRound();
    confirm(roundId, 0, [fx.trainingIds[0]]);

    harness.advance(10 * 86_400_000);
    const result = harness.write((ctx) =>
      confirmMarks(ctx, roundId, fx.partnerIds[1], { marks: [fx.trainingIds[1]], cap: null }),
    );

    expect(result).toMatchObject({ ok: false, reason: 'deadline_passed' });
    expect(roundRow(roundId)?.status).toBe('closed');
    expect(auditTypes(roundId)).toContain('round.late_action_rejected');
    // The rejection was recorded, and nothing was stored for the late partner.
    const late = harness.read((db) =>
      db
        .select()
        .from(confirmations)
        .where(eq(confirmations.lotPartnerId, fx.lotPartnerIds[1]))
        .all(),
    );
    expect(late).toHaveLength(0);
  });

  it('never stores a confirmation timestamped after the deadline', () => {
    const roundId = openRound();
    harness.advance(10 * 86_400_000);
    harness.write((ctx) => confirmMarks(ctx, roundId, fx.partnerIds[0], { marks: [], cap: null }));

    const deadline = roundRow(roundId)!.deadlineAt!;
    const all = harness.read((db) => db.select().from(confirmations).all());
    expect(all.every((c) => c.confirmedAt <= deadline)).toBe(true);
  });

  it('tells the buyer team about the late attempt', () => {
    const roundId = openRound();
    harness.advance(10 * 86_400_000);
    harness.write((ctx) => confirmMarks(ctx, roundId, fx.partnerIds[0], { marks: [], cap: null }));
    const notice = harness.read((db) =>
      db.select().from(notifications).where(eq(notifications.type, 'late_action_rejected')).all(),
    );
    expect(notice).toHaveLength(1);
  });
});

describe('[V-06][K-08] closing', () => {
  it('freezes the proposal and records every outcome', () => {
    const roundId = openRound();
    confirm(roundId, 0, [fx.trainingIds[0], fx.trainingIds[1]]);
    harness.write((ctx) => declineAll(ctx, roundId, fx.partnerIds[1]));
    // partner 3 stays silent

    harness.advance(6 * 86_400_000);
    harness.write((ctx) => closeRound(ctx, roundId));

    const round = roundRow(roundId);
    expect(round?.status).toBe('closed');
    expect(round?.proposalSnapshot).toBeTruthy();

    const outcomes = harness.read((db) =>
      db
        .select({
          lotPartnerId: roundParticipants.lotPartnerId,
          outcome: roundParticipants.outcomeAtClose,
        })
        .from(roundParticipants)
        .where(eq(roundParticipants.roundId, roundId))
        .all(),
    );
    const byPartner = new Map(outcomes.map((o) => [fx.lotPartnerIds.indexOf(o.lotPartnerId), o.outcome]));
    expect(byPartner.get(0)).toBe('confirmed');
    expect(byPartner.get(1)).toBe('declined_all');
    expect(byPartner.get(2)).toBe('no_response');
  });

  it('is idempotent — a second close changes nothing', () => {
    const roundId = openRound();
    confirm(roundId, 0, [fx.trainingIds[0]]);
    harness.advance(6 * 86_400_000);

    const first = harness.write((ctx) => closeRound(ctx, roundId));
    const snapshotAfterFirst = roundRow(roundId)?.proposalSnapshot;
    const second = harness.write((ctx) => closeRound(ctx, roundId));

    expect(first.closed).toBe(true);
    expect(second.closed).toBe(false);
    expect(roundRow(roundId)?.proposalSnapshot).toEqual(snapshotAfterFirst);
    expect(auditTypes(roundId).filter((t) => t === 'round.closed')).toHaveLength(1);
  });

  it('[J-03] the frozen proposal recomputes to the same result', () => {
    const roundId = openRound();
    confirm(roundId, 0, [fx.trainingIds[0], fx.trainingIds[2]], 1);
    confirm(roundId, 1, [fx.trainingIds[2], fx.trainingIds[3]]);
    confirm(roundId, 2, [fx.trainingIds[0], fx.trainingIds[4]]);

    harness.advance(6 * 86_400_000);
    harness.write((ctx) => closeRound(ctx, roundId));

    const snapshot = roundRow(roundId)!.proposalSnapshot!;
    const recomputed = allocate(snapshot.input as Parameters<typeof allocate>[0]);
    expect(recomputed).toEqual(snapshot.result);
  });

  it('tells the buyer team the round is waiting for them', () => {
    const roundId = openRound();
    harness.advance(6 * 86_400_000);
    harness.write((ctx) => closeRound(ctx, roundId));
    const notice = harness.read((db) =>
      db.select().from(notifications).where(eq(notifications.type, 'buyer_round_closed')).all(),
    );
    expect(notice).toHaveLength(1);
  });
});

describe('[V-04] changes to an open round', () => {
  it('extends a deadline but refuses to shorten it', () => {
    const roundId = openRound();
    const original = roundRow(roundId)!.deadlineAt!;

    harness.write((ctx) => extendDeadline(ctx, roundId, original + 86_400_000, 'partnerite palve'));
    expect(roundRow(roundId)?.deadlineAt).toBe(original + 86_400_000);

    expect(() => harness.write((ctx) => extendDeadline(ctx, roundId, original, 'ei tohi'))).toThrow(
      /ainult pikendada/,
    );
  });

  it('withdraws a training without touching any confirmation', () => {
    const roundId = openRound();
    confirm(roundId, 0, [fx.trainingIds[0], fx.trainingIds[1]]);

    harness.write((ctx) => withdrawTraining(ctx, roundId, fx.trainingIds[0], 'tellija loobus'));

    // The confirmation row is immutable and still lists both.
    const stored = harness.read((db) =>
      db
        .select()
        .from(confirmations)
        .where(eq(confirmations.lotPartnerId, fx.lotPartnerIds[0]))
        .get(),
    );
    expect(stored?.marks).toHaveLength(2);

    // But the withdrawn training is not allocated, and is free again.
    harness.advance(6 * 86_400_000);
    harness.write((ctx) => closeRound(ctx, roundId));
    expect(allocationMap(roundId)[0]).toEqual([fx.trainingIds[1]]);
    expect(trainingRow(fx.trainingIds[0])?.status).toBe('unassigned');
  });

  it('requires a justification to withdraw', () => {
    const roundId = openRound();
    expect(() =>
      harness.write((ctx) => withdrawTraining(ctx, roundId, fx.trainingIds[0], '  ')),
    ).toThrow(/põhjendust/);
  });

  it('cannot add a training to an open round', () => {
    const roundId = openRound([fx.trainingIds[0]]);
    expect(() => harness.write((ctx) => addTrainingsToRound(ctx, roundId, [fx.trainingIds[1]]))).toThrow(
      /mustandvoorule/,
    );
  });

  it('releases every training when the round is cancelled', () => {
    const roundId = openRound();
    harness.write((ctx) => cancelRound(ctx, roundId, 'tingimused muutusid'));
    expect(roundRow(roundId)?.status).toBe('cancelled');
    for (const id of fx.trainingIds) {
      expect(trainingRow(id)?.status).toBe('unassigned');
    }
    const notices = harness.read((db) =>
      db.select().from(notifications).where(eq(notifications.type, 'round_cancelled')).all(),
    );
    expect(notices).toHaveLength(3);
  });

  it('has no path from closed back to cancelled [L-12]', () => {
    const roundId = openRound();
    harness.advance(6 * 86_400_000);
    harness.write((ctx) => closeRound(ctx, roundId));
    expect(() => harness.write((ctx) => cancelRound(ctx, roundId, 'liiga hilja'))).toThrow(
      /olekut ei saa muuta/,
    );
  });
});

describe('[E-09] a training belongs to at most one round', () => {
  it('refuses to put a training into a second round', () => {
    openRound([fx.trainingIds[0]]);
    expect(() =>
      harness.write((ctx) => createRound(ctx, { lotId: fx.lotId, trainingIds: [fx.trainingIds[0]] })),
    ).toThrow(/juba voorus/);
  });

  it('refuses a training from another lot', () => {
    const other = seedLotWithPartners(harness, { code: 'OSA-7', partnerCount: 1, trainingCount: 1 });
    expect(() =>
      harness.write((ctx) =>
        createRound(ctx, { lotId: fx.lotId, trainingIds: [other.trainingIds[0]] }),
      ),
    ).toThrow(/teise hankeosasse/);
  });
});

describe('[T-02] buyer adjustments', () => {
  const closedRoundWithMarks = () => {
    const roundId = openRound();
    confirm(roundId, 0, [fx.trainingIds[0], fx.trainingIds[1], fx.trainingIds[2]]);
    confirm(roundId, 1, [fx.trainingIds[0], fx.trainingIds[3]]);
    confirm(roundId, 2, fx.trainingIds);
    harness.advance(6 * 86_400_000);
    harness.write((ctx) => closeRound(ctx, roundId));
    return roundId;
  };

  it('requires a justification', () => {
    const roundId = closedRoundWithMarks();
    expect(() =>
      harness.write((ctx) =>
        applyAdjustment(ctx, roundId, {
          lotPartnerId: fx.lotPartnerIds[0],
          kind: 'skip',
          justification: '   ',
        }),
      ),
    ).toThrow(/põhjendust/);
  });

  it('skips a partner and flows their marks down', () => {
    const roundId = closedRoundWithMarks();
    harness.write((ctx) =>
      applyAdjustment(ctx, roundId, {
        lotPartnerId: fx.lotPartnerIds[0],
        kind: 'skip',
        justification: 'töömaht on liiga suur',
      }),
    );
    const preview = harness.write((ctx) => previewFinalAllocation(ctx.tx, roundId));
    expect(preview.allocations.find((a) => a.lotPartnerId === fx.lotPartnerIds[0])).toBeUndefined();
    expect(preview.byTraining[fx.trainingIds[0]]).toBe(fx.lotPartnerIds[1]);
  });

  it('caps a partner for the round', () => {
    const roundId = closedRoundWithMarks();
    harness.write((ctx) =>
      applyAdjustment(ctx, roundId, {
        lotPartnerId: fx.lotPartnerIds[0],
        kind: 'cap',
        cap: 1,
        justification: 'tasakaalustamine',
      }),
    );
    const preview = harness.write((ctx) => previewFinalAllocation(ctx.tx, roundId));
    expect(preview.allocations.find((a) => a.lotPartnerId === fx.lotPartnerIds[0])?.trainingIds).toEqual([
      fx.trainingIds[0],
    ]);
  });

  it('lets the latest adjustment win and can be cleared', () => {
    const roundId = closedRoundWithMarks();
    harness.write((ctx) =>
      applyAdjustment(ctx, roundId, {
        lotPartnerId: fx.lotPartnerIds[0],
        kind: 'skip',
        justification: 'esimene otsus',
      }),
    );
    harness.write((ctx) => clearAdjustment(ctx, roundId, fx.lotPartnerIds[0]));
    const preview = harness.write((ctx) => previewFinalAllocation(ctx.tx, roundId));
    expect(preview.allocations.find((a) => a.lotPartnerId === fx.lotPartnerIds[0])).toBeTruthy();
  });

  it('cannot be applied before the round closes', () => {
    const roundId = openRound();
    expect(() =>
      harness.write((ctx) =>
        applyAdjustment(ctx, roundId, {
          lotPartnerId: fx.lotPartnerIds[0],
          kind: 'skip',
          justification: 'vara',
        }),
      ),
    ).toThrow(/suletud vooru/);
  });

  it('[N-09] never shows up in a partner projection', () => {
    const roundId = openRound();
    confirm(roundId, 0, [fx.trainingIds[0]]);
    const before = harness.read((db) => projectionInput(db, roundId, harness.now));
    expect(before.adjustments).toEqual([]);
  });
});

describe('[T-04][T-05] confirming the allocation', () => {
  const run = () => {
    const roundId = openRound();
    confirm(roundId, 0, [fx.trainingIds[0], fx.trainingIds[1]], 1);
    confirm(roundId, 1, [fx.trainingIds[1], fx.trainingIds[2]]);
    confirm(roundId, 2, [fx.trainingIds[3]]);
    harness.advance(6 * 86_400_000);
    harness.write((ctx) => closeRound(ctx, roundId));
    const result = harness.write((ctx) => confirmAllocation(ctx, roundId));
    return { roundId, result };
  };

  it('creates one order per allocated partner', () => {
    const { roundId, result } = run();
    expect(result.orderIds).toHaveLength(3);
    const rows = harness.read((db) => db.select().from(orders).where(eq(orders.roundId, roundId)).all());
    expect(rows).toHaveLength(3);
    expect(rows.every((o) => o.kind === 'allocation')).toBe(true);
    expect(rows.map((o) => o.orderSeq).sort()).toEqual([1, 2, 3]);
  });

  it('freezes a document snapshot carrying both timestamps', () => {
    const { roundId } = run();
    const order = harness.read((db) =>
      db.select().from(orders).where(eq(orders.roundId, roundId)).get(),
    );
    const doc = order!.documentSnapshot;
    expect(doc.frameworkReference).toContain('10567384');
    expect(doc.roundCode).toMatch(/^VOOR-2026-/);
    expect(doc.partnerConfirmedAt).toBeTruthy();
    expect(doc.buyerConfirmedAt).toBeTruthy();
    expect(doc.trainings.length).toBeGreaterThan(0);
    expect(doc.totalEur).toBeGreaterThan(0);
  });

  it('points each order at the confirmation that binds the partner', () => {
    const { roundId } = run();
    const order = harness.read((db) =>
      db
        .select()
        .from(orders)
        .where(and(eq(orders.roundId, roundId), eq(orders.lotPartnerId, fx.lotPartnerIds[0])))
        .get(),
    );
    expect(order?.partnerConfirmationId).toBeTruthy();
    const binding = harness.read((db) =>
      db.select().from(confirmations).where(eq(confirmations.id, order!.partnerConfirmationId!)).get(),
    );
    expect(binding?.lotPartnerId).toBe(fx.lotPartnerIds[0]);
  });

  it('marks the trainings allocated and links them to the order', () => {
    const { roundId } = run();
    const links = harness.read((db) =>
      db
        .select()
        .from(orderTrainings)
        .innerJoin(orders, eq(orders.id, orderTrainings.orderId))
        .where(eq(orders.roundId, roundId))
        .all(),
    );
    expect(links).toHaveLength(4);
    expect(trainingRow(fx.trainingIds[0])?.status).toBe('allocated');
    expect(trainingRow(fx.trainingIds[0])?.allocatedLotPartnerId).toBe(fx.lotPartnerIds[0]);
  });

  it('refuses a second confirmation', () => {
    const { roundId } = run();
    expect(() => harness.write((ctx) => confirmAllocation(ctx, roundId))).toThrow(
      /olekut ei saa muuta/,
    );
    expect(
      harness.read((db) => db.select().from(orders).where(eq(orders.roundId, roundId)).all()),
    ).toHaveLength(3);
  });

  it('[N-08] tells a partner their mark went elsewhere, without naming anyone', () => {
    const { roundId } = run();
    const notice = harness.read((db) =>
      db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.type, 'allocated_elsewhere'),
            eq(notifications.recipientLotPartnerId, fx.lotPartnerIds[0]),
          ),
        )
        .get(),
    );
    // Partner 1 was capped at 1 and marked 2, so one mark went to partner 2.
    expect(notice).toBeTruthy();
    expect(notice!.body).toContain('määrati teisele partnerile');
    expect(notice!.body).not.toContain('Partner 2');
    void roundId;
  });

  it('[J-06] leaves unwanted trainings as jääk', () => {
    const { result } = run();
    expect(result.leftover).toHaveLength(2);
    for (const id of result.leftover) {
      expect(trainingRow(id)?.status).toBe('leftover');
      expect(trainingRow(id)?.leftoverFromRoundId).toBeTruthy();
    }
  });
});

describe('[T-06] the jääk decision', () => {
  const leftoverTraining = () => {
    const roundId = openRound([fx.trainingIds[0], fx.trainingIds[1]]);
    confirm(roundId, 0, [fx.trainingIds[0]]);
    harness.advance(6 * 86_400_000);
    harness.write((ctx) => closeRound(ctx, roundId));
    harness.write((ctx) => confirmAllocation(ctx, roundId));
    return { roundId, trainingId: fx.trainingIds[1] };
  };

  it('re-issues the same training row into a new round, keeping its history', () => {
    const { roundId, trainingId } = leftoverTraining();
    expect(trainingRow(trainingId)?.status).toBe('leftover');

    const nextRoundId = harness.write((ctx) => {
      const id = createRound(ctx, { lotId: fx.lotId, trainingIds: [], originRoundId: roundId });
      reissueLeftover(ctx, trainingId, id);
      publishRound(ctx, id);
      return id;
    });

    // Same row, and both rounds remember it.
    expect(trainingRow(trainingId)?.currentRoundId).toBe(nextRoundId);
    const history = harness.read((db) =>
      db.select().from(roundTrainings).where(eq(roundTrainings.trainingId, trainingId)).all(),
    );
    expect(history).toHaveLength(2);
    expect(new Set(history.map((h) => h.roundId))).toEqual(new Set([roundId, nextRoundId]));
  });

  it('can cancel a leftover with a justification', () => {
    const { trainingId } = leftoverTraining();
    expect(() => harness.write((ctx) => cancelLeftover(ctx, trainingId, ' '))).toThrow(/põhjendust/);
    harness.write((ctx) => cancelLeftover(ctx, trainingId, 'koolitust ei ole enam vaja'));
    expect(trainingRow(trainingId)?.status).toBe('cancelled');
  });
});

describe('[E-01] deactivating a membership mid-round', () => {
  it('excludes the partner, ignores their marks, and notifies both sides', () => {
    const roundId = openRound();
    confirm(roundId, 0, [fx.trainingIds[0]]);
    confirm(roundId, 1, [fx.trainingIds[0]]);

    harness.write((ctx) =>
      deactivateLotPartner(ctx, fx.lotPartnerIds[0], 'raamleping lõppes'),
    );

    const participant = harness
      .read((db) => participantsOf(db, roundId))
      .find((p) => p.lotPartnerId === fx.lotPartnerIds[0]);
    expect(participant?.excludedAt).toBeTruthy();
    expect(auditTypes(roundId)).toContain('participant.excluded');

    const notices = harness.read((db) =>
      db.select().from(notifications).where(eq(notifications.type, 'participant_excluded')).all(),
    );
    expect(notices).toHaveLength(2); // the partner and the buyer team

    harness.advance(6 * 86_400_000);
    harness.write((ctx) => closeRound(ctx, roundId));
    // Rank 2 gets it, because rank 1 no longer counts.
    expect(allocationMap(roundId)[1]).toEqual([fx.trainingIds[0]]);
  });

  it('refuses an action from an excluded partner', () => {
    const roundId = openRound();
    harness.write((ctx) => deactivateLotPartner(ctx, fx.lotPartnerIds[0], 'lõppes'));
    const result = harness.write((ctx) =>
      confirmMarks(ctx, roundId, fx.partnerIds[0], { marks: [fx.trainingIds[0]], cap: null }),
    );
    expect(result).toMatchObject({ ok: false, reason: 'excluded' });
  });
});

describe('[D-04] projection notices are rate-limited', () => {
  /** projection_changed notices per partner index. */
  const noticesFor = (partnerIndex: number) =>
    harness.read((db) =>
      db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.type, 'projection_changed'),
            eq(notifications.recipientLotPartnerId, fx.lotPartnerIds[partnerIndex]),
          ),
        )
        .all(),
    );

  it('tells a partner whose projection a higher rank changed', () => {
    const roundId = openRound();
    confirm(roundId, 2, [fx.trainingIds[0], fx.trainingIds[1]]);
    expect(noticesFor(2)).toHaveLength(0);

    // Rank 1 takes both, so rank 3's projection drops from 2 to 0.
    confirm(roundId, 0, [fx.trainingIds[0], fx.trainingIds[1]]);
    expect(noticesFor(2)).toHaveLength(1);
    expect(noticesFor(0)).toHaveLength(0);
  });

  it('says nothing to a partner whose projection did not move', () => {
    const roundId = openRound();
    confirm(roundId, 1, [fx.trainingIds[4]]);
    confirm(roundId, 0, [fx.trainingIds[0]]);
    expect(noticesFor(1)).toHaveLength(0);
  });

  it('never names the partner who caused the change [N-04]', () => {
    const roundId = openRound();
    confirm(roundId, 2, [fx.trainingIds[0]]);
    confirm(roundId, 0, [fx.trainingIds[0]]);

    const notice = noticesFor(2)[0];
    expect(notice).toBeDefined();
    const text = `${notice.title} ${notice.body} ${notice.bodyHtml}`;
    expect(text).not.toContain('Partner 1');
    expect(text).not.toContain('Kontakt 1');
    expect(text).not.toContain('kontakt1@naidis.ee');
  });

  it('suppresses a second notice inside the four-hour window', () => {
    const roundId = openRound();
    confirm(roundId, 2, [fx.trainingIds[0], fx.trainingIds[1]]);
    confirm(roundId, 0, [fx.trainingIds[0]]);
    expect(noticesFor(2)).toHaveLength(1);

    harness.advance(3 * 3_600_000);
    confirm(roundId, 0, [fx.trainingIds[0], fx.trainingIds[1]]);
    expect(noticesFor(2)).toHaveLength(1);
  });

  it('notifies again once the window has passed', () => {
    const roundId = openRound();
    confirm(roundId, 2, [fx.trainingIds[0], fx.trainingIds[1]]);
    confirm(roundId, 0, [fx.trainingIds[0]]);

    harness.advance(5 * 3_600_000);
    confirm(roundId, 0, [fx.trainingIds[0], fx.trainingIds[1]]);
    expect(noticesFor(2)).toHaveLength(2);
  });

  it('records the current projection even when it stays silent', () => {
    const roundId = openRound();
    confirm(roundId, 2, [fx.trainingIds[0], fx.trainingIds[1]]);
    confirm(roundId, 0, [fx.trainingIds[0]]);
    harness.advance(3_600_000);
    confirm(roundId, 0, [fx.trainingIds[0], fx.trainingIds[1]]);

    const participant = harness
      .read((db) => participantsOf(db, roundId))
      .find((p) => p.lotPartnerId === fx.lotPartnerIds[2]);
    expect(participant?.lastProjectionCount).toBe(0);
    expect(noticesFor(2)).toHaveLength(1);
  });

  it('goes quiet in the final 24 hours, where the reminder carries the position', () => {
    const roundId = openRound();
    confirm(roundId, 2, [fx.trainingIds[0], fx.trainingIds[1]]);

    const deadlineAt = roundRow(roundId)!.deadlineAt!;
    harness.now = deadlineAt - 12 * 3_600_000;
    confirm(roundId, 0, [fx.trainingIds[0], fx.trainingIds[1]]);

    expect(noticesFor(2)).toHaveLength(0);
    expect(harness.write((ctx) => sendDeadlineReminder(ctx, roundId))).toBe(3);
  });

  it('sends none at all in a sealed round [N-06]', () => {
    const roundId = harness.write((ctx) => {
      const id = createRound(ctx, {
        lotId: fx.lotId,
        trainingIds: fx.trainingIds,
        visibilityMode: 'sealed',
      });
      publishRound(ctx, id);
      return id;
    });
    confirm(roundId, 2, [fx.trainingIds[0]]);
    confirm(roundId, 0, [fx.trainingIds[0]]);
    expect(noticesFor(2)).toHaveLength(0);
  });
});

describe('[D-05] the reminder', () => {
  it('is sent once per partner', () => {
    const roundId = openRound();
    const first = harness.write((ctx) => sendDeadlineReminder(ctx, roundId));
    const second = harness.write((ctx) => sendDeadlineReminder(ctx, roundId));
    expect(first).toBe(3);
    expect(second).toBe(0);
    expect(
      harness.read((db) =>
        db.select().from(notifications).where(eq(notifications.type, 'reminder_24h')).all(),
      ),
    ).toHaveLength(3);
  });
});

describe('[D-08] the audit trail is evidence', () => {
  it('records the whole lifecycle', () => {
    const roundId = openRound();
    confirm(roundId, 0, [fx.trainingIds[0]]);
    harness.advance(6 * 86_400_000);
    harness.write((ctx) => closeRound(ctx, roundId));
    harness.write((ctx) => confirmAllocation(ctx, roundId));

    expect(auditTypes(roundId)).toEqual(
      expect.arrayContaining([
        'round.created',
        'round.published',
        'marks.confirmed',
        'round.closed',
        'order.created',
        'round.confirmed',
      ]),
    );
  });

  it('cannot be altered', () => {
    openRound();
    expect(() => harness.raw.prepare('update audit_events set summary = ?').run('muudetud')).toThrow(
      /muutmatu/,
    );
    expect(() => harness.raw.prepare('delete from audit_events').run()).toThrow(/muutmatu/);
  });
});

describe('[L-07] workload', () => {
  it('counts allocated, not-yet-completed trainings for the partner', () => {
    const roundId = openRound([fx.trainingIds[0], fx.trainingIds[1]]);
    confirm(roundId, 0, [fx.trainingIds[0], fx.trainingIds[1]]);
    harness.advance(6 * 86_400_000);
    harness.write((ctx) => closeRound(ctx, roundId));
    harness.write((ctx) => confirmAllocation(ctx, roundId));

    expect(harness.read((db) => workloadFor(db, fx.lotPartnerIds[0]))).toBe(2);
    harness.write((ctx) => markTrainingCompleted(ctx, fx.trainingIds[0]));
    expect(harness.read((db) => workloadFor(db, fx.lotPartnerIds[0]))).toBe(1);
  });
});

describe('[E-07] after the order exists', () => {
  it('records a partner withdrawal as its own event and frees the training', () => {
    const roundId = openRound([fx.trainingIds[0]]);
    confirm(roundId, 0, [fx.trainingIds[0]]);
    harness.advance(6 * 86_400_000);
    harness.write((ctx) => closeRound(ctx, roundId));
    const { orderIds } = harness.write((ctx) => confirmAllocation(ctx, roundId));

    harness.write((ctx) =>
      recordPartnerWithdrawal(ctx, orderIds[0], fx.trainingIds[0], 'koolitaja haigestus'),
    );

    expect(trainingRow(fx.trainingIds[0])?.status).toBe('leftover');
    const events = harness.read((db) =>
      db
        .select({ type: auditEvents.eventType, summary: auditEvents.summary })
        .from(auditEvents)
        .where(eq(auditEvents.eventType, 'order.partner_withdrew'))
        .all(),
    );
    expect(events).toHaveLength(1);
    expect(events[0].summary).toContain('lepingulist järelmenetlust');
  });
});

describe('Lisa B through the engine', () => {
  it('reproduces the spec’s worked example end to end', () => {
    // A: marks K1,K2,K3,K5 cap 2 · B: K2,K3,K4,K6 · C: K1,K3,K4,K5,K6
    const [k1, k2, k3, k4, k5, k6] = fx.trainingIds;
    const roundId = openRound();
    confirm(roundId, 0, [k1, k2, k3, k5], 2);
    confirm(roundId, 1, [k2, k3, k4, k6]);
    confirm(roundId, 2, [k1, k3, k4, k5, k6]);

    harness.advance(6 * 86_400_000);
    harness.write((ctx) => closeRound(ctx, roundId));

    // B.1
    expect(allocationMap(roundId)).toEqual({ 0: [k1, k2], 1: [k3, k4, k6], 2: [k5] });

    // B.4 — the buyer caps B at 1
    harness.write((ctx) =>
      applyAdjustment(ctx, roundId, {
        lotPartnerId: fx.lotPartnerIds[1],
        kind: 'cap',
        cap: 1,
        justification: 'töömaht on piiril',
      }),
    );
    harness.write((ctx) => confirmAllocation(ctx, roundId));
    expect(allocationMap(roundId)).toEqual({ 0: [k1, k2], 1: [k3], 2: [k4, k5, k6] });
    expect(roundRow(roundId)?.finalSnapshot).toBeTruthy();
  });
});
