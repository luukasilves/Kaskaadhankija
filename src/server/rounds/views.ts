/**
 * Read-side helpers shared by the buyer and partner screens.
 *
 * These only derive; every mutation lives in `engine.ts`. Keeping the
 * derivations here means the opening screen, the strip, the buyer matrix and
 * the partner page all describe a partner's state with the same words.
 */

import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import {
  confirmations,
  lotPartners,
  lots,
  partners,
  roundParticipants,
  roundTrainings,
  rounds,
  trainings,
} from '@/db/schema';
import type { ResponseState } from '@/domain/round-statuses';
import type { AllocationTraining, ConfirmationSnapshot } from '@/domain/allocate';
import type { Db, Tx } from '../context';

type Reader = Tx | Db;

/** The binding confirmation for one participant, or null. [K-04] */
export function latestConfirmation(
  tx: Reader,
  roundId: string,
  lotPartnerId: string,
): typeof confirmations.$inferSelect | undefined {
  return tx
    .select()
    .from(confirmations)
    .where(and(eq(confirmations.roundId, roundId), eq(confirmations.lotPartnerId, lotPartnerId)))
    .orderBy(desc(confirmations.confirmedAt), desc(confirmations.id))
    .limit(1)
    .get();
}

export function allConfirmations(tx: Reader, roundId: string) {
  return tx
    .select()
    .from(confirmations)
    .where(eq(confirmations.roundId, roundId))
    .orderBy(confirmations.confirmedAt, confirmations.id)
    .all();
}

/** Confirmations grouped per participant, in the shape `allocate` expects. */
export function confirmationSnapshotsByPartner(
  tx: Reader,
  roundId: string,
): Map<string, ConfirmationSnapshot[]> {
  const grouped = new Map<string, ConfirmationSnapshot[]>();
  for (const row of allConfirmations(tx, roundId)) {
    const list = grouped.get(row.lotPartnerId) ?? [];
    list.push({
      id: row.id,
      kind: row.kind,
      marks: row.marks,
      cap: row.cap,
      confirmedAt: row.confirmedAt,
    });
    grouped.set(row.lotPartnerId, list);
  }
  return grouped;
}

/** Non-withdrawn trainings of a round, in the shape `allocate` expects. [V-04] */
export function roundTrainingList(tx: Reader, roundId: string): AllocationTraining[] {
  return tx
    .select({ id: trainings.id, code: trainings.code, eventDate: trainings.eventDate })
    .from(roundTrainings)
    .innerJoin(trainings, eq(trainings.id, roundTrainings.trainingId))
    .where(and(eq(roundTrainings.roundId, roundId), isNull(roundTrainings.withdrawnAt)))
    .all();
}

/**
 * How to describe a partner's own position while the round is open.
 *
 * `unconfirmed_changes` is the state the UI must shout about: only confirmed
 * marks count at the deadline [K-03], so a draft that differs from the last
 * confirmation is a trap unless it is made obvious.
 */
export function responseStateFor(
  latest: { kind: 'confirm' | 'decline_all'; marks: string[]; cap: number | null } | undefined,
  draftMarks: string[],
  draftCap: number | null,
): ResponseState {
  const draftSorted = [...draftMarks].sort();

  if (!latest) {
    return draftSorted.length > 0 ? 'draft_only' : 'none';
  }
  const confirmedSorted = [...latest.marks].sort();
  const sameMarks =
    confirmedSorted.length === draftSorted.length &&
    confirmedSorted.every((id, index) => id === draftSorted[index]);
  const sameCap = (latest.cap ?? null) === (draftCap ?? null);

  if (!sameMarks || !sameCap) return 'unconfirmed_changes';
  return latest.kind === 'decline_all' ? 'declined_all' : 'confirmed';
}

export interface ParticipantRow {
  id: string;
  roundId: string;
  lotPartnerId: string;
  rankAtPublication: number;
  partnerName: string;
  contactName: string;
  contactEmail: string;
  excludedAt: number | null;
  excludedReason: string;
  draftMarks: string[];
  draftCap: number | null;
  outcomeAtClose: string | null;
  reminderSentAt: number | null;
  lastProjectionCount: number | null;
  lastProjectionNotifiedAt: number | null;
}

/** Participants of a round in rank order, with the partner's name attached. */
export function participantsOf(tx: Reader, roundId: string): ParticipantRow[] {
  return tx
    .select({
      id: roundParticipants.id,
      roundId: roundParticipants.roundId,
      lotPartnerId: roundParticipants.lotPartnerId,
      rankAtPublication: roundParticipants.rankAtPublication,
      partnerName: partners.name,
      contactName: roundParticipants.contactNameSnapshot,
      contactEmail: roundParticipants.contactEmailSnapshot,
      excludedAt: roundParticipants.excludedAt,
      excludedReason: roundParticipants.excludedReason,
      draftMarks: roundParticipants.draftMarks,
      draftCap: roundParticipants.draftCap,
      outcomeAtClose: roundParticipants.outcomeAtClose,
      reminderSentAt: roundParticipants.reminderSentAt,
      lastProjectionCount: roundParticipants.lastProjectionCount,
      lastProjectionNotifiedAt: roundParticipants.lastProjectionNotifiedAt,
    })
    .from(roundParticipants)
    .innerJoin(lotPartners, eq(lotPartners.id, roundParticipants.lotPartnerId))
    .innerJoin(partners, eq(partners.id, lotPartners.partnerId))
    .where(eq(roundParticipants.roundId, roundId))
    .all()
    .sort((a, b) => a.rankAtPublication - b.rankAtPublication);
}

/** One participant of one round, resolved from the acting company. */
export function participantForPartner(
  tx: Reader,
  roundId: string,
  partnerId: string,
): ParticipantRow | undefined {
  const memberships = tx
    .select({ id: lotPartners.id })
    .from(lotPartners)
    .where(eq(lotPartners.partnerId, partnerId))
    .all()
    .map((m) => m.id);
  if (memberships.length === 0) return undefined;
  return participantsOf(tx, roundId).find((p) => memberships.includes(p.lotPartnerId));
}

/** Rounds visible to one company: those of any lot it is a member of. */
export function roundsForPartner(tx: Reader, partnerId: string) {
  const lotIds = tx
    .select({ lotId: lotPartners.lotId })
    .from(lotPartners)
    .where(eq(lotPartners.partnerId, partnerId))
    .all()
    .map((r) => r.lotId);
  if (lotIds.length === 0) return [];

  return tx
    .select({
      id: rounds.id,
      code: rounds.code,
      status: rounds.status,
      lotId: rounds.lotId,
      lotCode: lots.code,
      lotName: lots.name,
      visibilityMode: rounds.visibilityMode,
      publishedAt: rounds.publishedAt,
      deadlineAt: rounds.deadlineAt,
      expectedDecisionAt: rounds.expectedDecisionAt,
      confirmedAt: rounds.confirmedAt,
    })
    .from(rounds)
    .innerJoin(lots, eq(lots.id, rounds.lotId))
    .where(and(inArray(rounds.lotId, lotIds), inArray(rounds.status, ['open', 'closed', 'confirmed'])))
    .all()
    .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));
}

/**
 * How many trainings a lot member currently holds — the figure the workload
 * warning compares against the lot threshold. [T-01][L-07]
 *
 * Defined as trainings allocated to them in this lot and not yet completed.
 * Deliberately one function, so the alternatives recorded in L-07 (across all
 * lots, or per calendar month) are a one-place change.
 */
export function workloadFor(tx: Reader, lotPartnerId: string): number {
  return tx
    .select({ id: trainings.id })
    .from(trainings)
    .where(and(eq(trainings.allocatedLotPartnerId, lotPartnerId), eq(trainings.status, 'allocated')))
    .all().length;
}

/** The wording shown next to a workload figure, so screens agree. */
export function workloadLabel(count: number, threshold: number): string {
  return count >= threshold
    ? `${count} käimasolevat koolitust — piir ${threshold} on täis, tellijal on õigus jaotust piirata`
    : `${count} käimasolevat koolitust (piir ${threshold})`;
}
