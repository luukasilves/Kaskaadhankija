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

import { desc, eq } from 'drizzle-orm';
import { buyerAdjustments, rounds } from '@/db/schema';
import type { AllocationInput, BuyerAdjustment } from '@/domain/allocate';
import type { Db, Tx } from '../context';
import { confirmationSnapshotsByPartner, participantsOf, roundTrainingList } from './views';

type Reader = Tx | Db;

/**
 * The effective adjustment per partner: the latest row, unless it is a `clear`.
 * The table is append-only, so a change is a new row and the history stays [T-02].
 */
export function effectiveAdjustments(tx: Reader, roundId: string): BuyerAdjustment[] {
  const rows = tx
    .select()
    .from(buyerAdjustments)
    .where(eq(buyerAdjustments.roundId, roundId))
    .orderBy(desc(buyerAdjustments.id))
    .all();

  const seen = new Set<string>();
  const effective: BuyerAdjustment[] = [];
  for (const row of rows) {
    if (seen.has(row.lotPartnerId)) continue;
    seen.add(row.lotPartnerId);
    if (row.kind === 'skip') {
      effective.push({ lotPartnerId: row.lotPartnerId, kind: 'skip' });
    } else if (row.kind === 'cap' && row.capValue !== null) {
      effective.push({ lotPartnerId: row.lotPartnerId, kind: 'cap', cap: row.capValue });
    }
    // 'clear' contributes nothing — it is how an adjustment is undone.
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
 * The final input: the frozen proposal input plus the buyer's adjustments.
 * Never re-reads the participant tables — see the note at the top.
 */
export function finalInput(tx: Reader, roundId: string): AllocationInput {
  const round = tx.select().from(rounds).where(eq(rounds.id, roundId)).get();
  if (!round) throw new Error('Voorust ei leitud.');
  if (!round.proposalSnapshot) throw new Error('Jaotusettepanek puudub — voor ei ole suletud.');

  return { ...round.proposalSnapshot.input, adjustments: effectiveAdjustments(tx, roundId) };
}
