/**
 * Build the input for the allocation algorithm at each of its three cut points.
 *
 * Rule [J-05] gives one procedure three uses, distinguished only by the cut
 * instant and whether the buyer's adjustments are applied:
 *
 *   prognoos        cutAt = now             adjustments = []
 *   jaotusettepanek cutAt = round.deadlineAt adjustments = []
 *   lõplik jaotus   cutAt = round.deadlineAt adjustments = the buyer's
 *
 * The final allocation deliberately does **not** re-read the tables. It reuses
 * the input frozen into `proposalSnapshot` at close and only adds the
 * adjustments, so the confirmed result is reproducible from stored data alone
 * and cannot drift if a partner row changes afterwards [J-03].
 */

import { desc, eq, inArray } from 'drizzle-orm';
import { buyerAdjustments, rounds, trainings } from '@/db/schema';
import type { AllocationInput, BuyerAdjustment } from '@/domain/allocate';
import type { Db, Tx } from '../context';
import { confirmationSnapshotsByPartner, participantsOf, roundTrainingList } from './views';

type Reader = Tx | Db;

/**
 * The effective adjustment per partner: the latest row, unless it is a `clear`.
 * The table is append-only, so a change is a new row and the history stays [T-02].
 */
export function effectiveAdjustmentRows(
  tx: Reader,
  roundId: string,
): Array<typeof buyerAdjustments.$inferSelect> {
  const rows = tx
    .select()
    .from(buyerAdjustments)
    .where(eq(buyerAdjustments.roundId, roundId))
    .orderBy(desc(buyerAdjustments.id))
    .all();

  const seen = new Set<string>();
  const effective: Array<typeof buyerAdjustments.$inferSelect> = [];
  for (const row of rows) {
    if (seen.has(row.lotPartnerId)) continue;
    seen.add(row.lotPartnerId);
    // 'clear' contributes nothing — it is how an adjustment is undone.
    if (row.kind === 'clear') continue;
    effective.push(row);
  }
  return effective;
}

/**
 * The same adjustments in the shape the algorithm takes.
 *
 * The domain type deliberately carries no justification: the mandatory
 * reasoning [T-02] is evidence for people, not an input to the arithmetic, and
 * keeping it out means a frozen snapshot cannot replay differently because
 * someone reworded it. Screens that need to show the reasoning read the rows.
 */
export function effectiveAdjustments(tx: Reader, roundId: string): BuyerAdjustment[] {
  const effective: BuyerAdjustment[] = [];
  for (const row of effectiveAdjustmentRows(tx, roundId)) {
    if (row.kind === 'skip') {
      effective.push({ lotPartnerId: row.lotPartnerId, kind: 'skip' });
    } else if (row.kind === 'cap' && row.capValue !== null) {
      effective.push({ lotPartnerId: row.lotPartnerId, kind: 'cap', cap: row.capValue });
    }
  }
  return effective;
}

/** Read the live tables into an allocation input at an arbitrary cut instant. */
export function buildAllocationInput(
  tx: Reader,
  roundId: string,
  cutAt: number,
  adjustments: BuyerAdjustment[] = [],
): AllocationInput {
  const confirmations = confirmationSnapshotsByPartner(tx, roundId);

  return {
    roundId,
    cutAt,
    trainings: roundTrainingList(tx, roundId),
    participants: participantsOf(tx, roundId).map((participant) => ({
      lotPartnerId: participant.lotPartnerId,
      rank: participant.rankAtPublication,
      excluded: participant.excludedAt !== null,
      confirmations: confirmations.get(participant.lotPartnerId) ?? [],
    })),
    adjustments,
  };
}

/** The projection input: current state, no adjustments [N-09]. */
export function projectionInput(tx: Reader, roundId: string, nowMs: number): AllocationInput {
  return buildAllocationInput(tx, roundId, nowMs, []);
}

/** The proposal input: cut at the deadline, no adjustments [V-06]. */
export function proposalInput(tx: Reader, roundId: string): AllocationInput {
  const round = tx.select().from(rounds).where(eq(rounds.id, roundId)).get();
  if (!round) throw new Error('Voorust ei leitud.');
  if (round.deadlineAt === null) throw new Error('Vooru tähtaeg puudub.');
  return buildAllocationInput(tx, roundId, round.deadlineAt, []);
}

/**
 * Snapshots frozen before participant caps existed carry no trainee counts.
 * Fill them from the trainings table so the display has the figure; the
 * allocation cannot change, because those rounds hold no participant-kind cap
 * and a count of 0 is never below a training-count limit [L-17].
 */
export function withParticipantCounts(tx: Reader, input: AllocationInput): AllocationInput {
  const missing = input.trainings.filter((t) => typeof t.participantCount !== 'number').map((t) => t.id);
  if (missing.length === 0) return input;
  const counts = new Map(
    tx
      .select({ id: trainings.id, participantCount: trainings.participantCount })
      .from(trainings)
      .where(inArray(trainings.id, missing))
      .all()
      .map((row) => [row.id, row.participantCount] as const),
  );
  return {
    ...input,
    trainings: input.trainings.map((t) =>
      typeof t.participantCount === 'number' ? t : { ...t, participantCount: counts.get(t.id) ?? 0 },
    ),
  };
}

/**
 * The final input: the frozen proposal input plus the buyer's adjustments.
 * Never re-reads the participant tables — see the note at the top.
 */
export function finalInput(tx: Reader, roundId: string): AllocationInput {
  const round = tx.select().from(rounds).where(eq(rounds.id, roundId)).get();
  if (!round) throw new Error('Voorust ei leitud.');
  if (!round.proposalSnapshot) throw new Error('Jaotusettepanek puudub — voor ei ole suletud.');

  return withParticipantCounts(tx, {
    ...round.proposalSnapshot.input,
    adjustments: effectiveAdjustments(tx, roundId),
  });
}
