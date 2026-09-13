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
import type { CapKind, AllocationTraining, ConfirmationSnapshot } from '@/domain/allocate';
import type { Db, Tx } from '../context';
import type { WorkshopType } from '@/domain/statuses';

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
      capKind: row.capKind,
      confirmedAt: row.confirmedAt,
    });
    grouped.set(row.lotPartnerId, list);
  }
  return grouped;
}

/** Non-withdrawn trainings of a round, in the shape `allocate` expects. [V-04] */
export function roundTrainingList(tx: Reader, roundId: string): AllocationTraining[] {
  return tx
    .select({
      id: trainings.id,
      code: trainings.code,
      eventDate: trainings.eventDate,
      participantCount: trainings.participantCount,
    })
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
  latest:
    | { kind: 'confirm' | 'decline_all'; marks: string[]; cap: number | null; capKind?: CapKind }
    | undefined,
  draftMarks: string[],
  draftCap: number | null,
  draftCapKind: CapKind = 'trainings',
): ResponseState {
  const draftSorted = [...draftMarks].sort();

  if (!latest) {
    return draftSorted.length > 0 ? 'draft_only' : 'none';
  }
  const confirmedSorted = [...latest.marks].sort();
  const sameMarks =
    confirmedSorted.length === draftSorted.length &&
    confirmedSorted.every((id, index) => id === draftSorted[index]);
  // The kind only matters while there is a cap to count.
  const sameCap =
    (latest.cap ?? null) === (draftCap ?? null) &&
    ((draftCap ?? null) === null || (latest.capKind ?? 'trainings') === draftCapKind);

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
  /** the partner's framework price per participant in this lot [T-08] */
  unitPriceEur: number;
  excludedAt: number | null;
  excludedReason: string;
  draftMarks: string[];
  draftCap: number | null;
  draftCapKind: CapKind;
  outcomeAtClose: string | null;
  reminderSentAt: number | null;
  finalReminderSentAt: number | null;
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
      unitPriceEur: lotPartners.unitPriceEur,
      excludedAt: roundParticipants.excludedAt,
      excludedReason: roundParticipants.excludedReason,
      draftMarks: roundParticipants.draftMarks,
      draftCap: roundParticipants.draftCap,
      draftCapKind: roundParticipants.draftCapKind,
      outcomeAtClose: roundParticipants.outcomeAtClose,
      reminderSentAt: roundParticipants.reminderSentAt,
      finalReminderSentAt: roundParticipants.finalReminderSentAt,
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

/** One line of a partner's calendar [N-02]. */
export interface CalendarEntry {
  trainingId: string;
  code: string;
  title: string;
  eventDate: string;
  eventEnd: string | null;
  workshopType: WorkshopType;
  county: string;
  locationText: string;
  participantCount: number;
  lotCode: string;
  /**
   * `allocated` — the buyer confirmed the round and this training is theirs;
   * `completed` — held and marked done; `confirmed` — their binding confirmation
   * in a round still open or awaiting the buyer's decision. A confirmed mark is
   * not an order [L-25]; the calendar says so.
   */
  kind: 'allocated' | 'completed' | 'confirmed';
  roundId: string | null;
  roundCode: string | null;
}

/**
 * Everything a company has on its calendar: the trainings allocated to it, and
 * the trainings it has confirmed in rounds not yet decided [N-02].
 *
 * The same two reads the round page and `workloadFor` make, put side by side,
 * because a partner confirming an online round had no way of seeing that the
 * physical round the week after was already theirs. Once a round is confirmed
 * its allocation is the truth and its confirmations are history, so a
 * confirmed round contributes allocated trainings only.
 */
export function partnerCalendar(tx: Reader, partnerId: string): CalendarEntry[] {
  const memberships = tx
    .select({ id: lotPartners.id })
    .from(lotPartners)
    .where(eq(lotPartners.partnerId, partnerId))
    .all()
    .map((m) => m.id);
  if (memberships.length === 0) return [];

  const base = {
    trainingId: trainings.id,
    code: trainings.code,
    title: trainings.title,
    eventDate: trainings.eventDate,
    eventEnd: trainings.eventEnd,
    workshopType: trainings.workshopType,
    county: trainings.county,
    locationText: trainings.locationText,
    participantCount: trainings.participantCount,
    lotCode: lots.code,
  };

  const held: CalendarEntry[] = tx
    .select({ ...base, status: trainings.status })
    .from(trainings)
    .innerJoin(lots, eq(lots.id, trainings.lotId))
    .where(
      and(inArray(trainings.allocatedLotPartnerId, memberships), inArray(trainings.status, ['allocated', 'completed'])),
    )
    .all()
    .map(({ status, ...row }) => ({
      ...row,
      kind: status === 'completed' ? 'completed' : 'allocated',
      roundId: null,
      roundCode: null,
    }));

  const pending: CalendarEntry[] = [];
  for (const round of roundsForPartner(tx, partnerId)) {
    if (round.status !== 'open' && round.status !== 'closed') continue;
    const participant = participantForPartner(tx, round.id, partnerId);
    if (!participant || participant.excludedAt !== null) continue;
    const latest = latestConfirmation(tx, round.id, participant.lotPartnerId);
    if (!latest || latest.kind !== 'confirm' || latest.marks.length === 0) continue;
    const inRound = new Set(roundTrainingList(tx, round.id).map((t) => t.id));
    const marked = latest.marks.filter((id) => inRound.has(id));
    if (marked.length === 0) continue;
    const rows = tx
      .select(base)
      .from(trainings)
      .innerJoin(lots, eq(lots.id, trainings.lotId))
      .where(inArray(trainings.id, marked))
      .all();
    for (const row of rows) {
      pending.push({ ...row, kind: 'confirmed', roundId: round.id, roundCode: round.code });
    }
  }

  return [...held, ...pending].sort(
    (a, b) => a.eventDate.localeCompare(b.eventDate) || a.code.localeCompare(b.code),
  );
}

/**
 * The calendar by day — what the marking table shows beside a training on a
 * date the partner already has something [N-02]. Pass `exceptRoundId` so a
 * round's own trainings do not warn about each other.
 */
export function commitmentsByDay(
  entries: readonly CalendarEntry[],
  exceptRoundId: string | null = null,
): Map<string, string[]> {
  const byDay = new Map<string, string[]>();
  for (const entry of entries) {
    if (exceptRoundId !== null && entry.roundId === exceptRoundId) continue;
    const list = byDay.get(entry.eventDate) ?? [];
    if (!list.includes(entry.code)) list.push(entry.code);
    byDay.set(entry.eventDate, list);
  }
  return byDay;
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
