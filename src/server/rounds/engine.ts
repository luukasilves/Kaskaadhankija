/**
 * The round engine: every mutation of a parallel cascade.
 *
 * Conventions that hold throughout, and that the tests rely on:
 *
 *  - Each function takes a `Ctx` carrying one transaction and one `at` instant.
 *    Callers wrap them in `db.transaction(..., { behavior: 'immediate' })`, so a
 *    whole operation is atomic and every timestamp it writes agrees.
 *  - Status is re-checked **inside** the transaction, never trusted from the
 *    page that rendered the button.
 *  - Guards that must leave a trace return `{ ok: false, … }` instead of
 *    throwing, so the audit row commits with the rejection [E-05].
 *  - Notifications are recorded in the transaction and their emails queued for
 *    after it commits.
 *  - Ordering and deadline decisions are delegated to `src/domain/*`; this file
 *    is the database orchestration around them.
 *
 * Rule IDs refer to `docs/kaskaadi-ariloogika.md`.
 */

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  buyerAdjustments,
  confirmations,
  lotPartners,
  lots,
  orderSequences,
  orderTrainings,
  orders,
  partners,
  roundParticipants,
  roundSequences,
  roundTrainings,
  rounds,
  trainings,
  type OrderDocument,
} from '@/db/schema';
import { allocate, partnerView, type AllocationResult } from '@/domain/allocate';
import {
  canEnterRound,
  canTransitionRound,
  roundDisplayCode,
  type RoundStatus,
  type VisibilityMode,
} from '@/domain/round-statuses';
import { orderDisplayNumber, WORKSHOP_TYPE_LABELS } from '@/domain/statuses';
import { addWorkingDays } from '@/domain/working-days';
import {
  formatDateTime,
  formatDateTimeShort,
  formatEur,
  formatIsoDay,
  formatRemaining,
} from '@/domain/format';
import {
  renderAllocatedElsewhere,
  renderBuyerRoundClosed,
  renderBuyerRoundConfirmed,
  renderConfirmationReceipt,
  renderDeadlineReminder,
  renderDeclineReceipt,
  renderLateActionRejected,
  renderOrderIssued,
  renderParticipantExcluded,
  renderProjectionChanged,
  renderRoundCancelled,
  renderRoundChanged,
  renderRoundPublished,
} from '@/domain/round-templates';
import { env } from '@/lib/env';
import { logAudit } from '../audit';
import { failure, type Ctx, type Db, type Tx } from '../context';
import { notify, teamEmail } from '../notify';
import { effectiveAdjustments, finalInput, projectionInput, proposalInput } from './allocation-input';
import { latestConfirmation, participantsOf, roundTrainingList, workloadFor } from './views';

const ALGORITHM_VERSION = 1;

/* ------------------------------------------------------------------ *
 * small helpers
 * ------------------------------------------------------------------ */

type Round = typeof rounds.$inferSelect;
type Lot = typeof lots.$inferSelect;

function loadRound(ctx: Ctx, roundId: string): Round {
  const round = ctx.tx.select().from(rounds).where(eq(rounds.id, roundId)).get();
  if (!round) throw new Error('Voorust ei leitud.');
  return round;
}

function loadLot(ctx: Ctx, lotId: string): Lot {
  const lot = ctx.tx.select().from(lots).where(eq(lots.id, lotId)).get();
  if (!lot) throw new Error('Hankeosa ei leitud.');
  return lot;
}

function lotLabel(lot: Lot): string {
  return `${lot.code} — ${lot.name}`;
}

function partnerUrl(roundId: string): string {
  return `${env.APP_BASE_URL}/partner/voorud/${roundId}`;
}

function buyerUrl(roundId: string): string {
  return `${env.APP_BASE_URL}/tellija/voorud/${roundId}`;
}

function orderUrl(orderId: string): string {
  return `${env.APP_BASE_URL}/partner/tellimused/${orderId}`;
}

/** One human-readable line per training, for notifications. */
function trainingLines(ctx: Ctx, trainingIds: readonly string[]): string[] {
  if (trainingIds.length === 0) return [];
  const rows = ctx.tx.select().from(trainings).where(inArray(trainings.id, trainingIds)).all();
  const byId = new Map(rows.map((r) => [r.id, r]));
  return trainingIds
    .map((id) => byId.get(id))
    .filter((row): row is typeof trainings.$inferSelect => Boolean(row))
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate) || a.code.localeCompare(b.code))
    .map(
      (row) =>
        `${row.code} · ${formatIsoDay(row.eventDate)} · ${WORKSHOP_TYPE_LABELS[row.workshopType]} · ${
          row.county
        }${row.locationText ? `, ${row.locationText}` : ''} · ${row.participantCount} osalejat`,
    );
}

function transition(ctx: Ctx, round: Round, to: RoundStatus): void {
  if (!canTransitionRound(round.status, to)) {
    throw new Error(`Vooru olekut ei saa muuta: ${round.status} → ${to}.`);
  }
}

function nextSequence(ctx: Ctx, table: typeof roundSequences | typeof orderSequences, year: number): number {
  ctx.tx.insert(table).values({ year, lastSeq: 0 }).onConflictDoNothing().run();
  ctx.tx
    .update(table)
    .set({ lastSeq: sql`${table.lastSeq} + 1` })
    .where(eq(table.year, year))
    .run();
  const row = ctx.tx.select().from(table).where(eq(table.year, year)).get();
  return row?.lastSeq ?? 1;
}

/** The default response deadline for a lot, from the working-day calendar. */
export function computeDefaultDeadline(lot: Lot, at: number): number {
  return addWorkingDays(new Date(at), lot.responseDeadlineWorkingDays, lot.deadlineLocalTime).getTime();
}

function computeDecisionDeadline(lot: Lot, deadlineAt: number): number {
  return addWorkingDays(new Date(deadlineAt), lot.reviewWorkingDays, lot.deadlineLocalTime).getTime();
}

/* ------------------------------------------------------------------ *
 * creating and publishing
 * ------------------------------------------------------------------ */

export interface CreateRoundInput {
  lotId: string;
  trainingIds: string[];
  note?: string;
  visibilityMode?: VisibilityMode;
  /** created from another round's jääk [T-06] */
  originRoundId?: string | null;
}

export function createRound(ctx: Ctx, input: CreateRoundInput): string {
  const lot = loadLot(ctx, input.lotId);
  const year = new Date(ctx.at).getFullYear();
  const roundId = crypto.randomUUID();
  const code = roundDisplayCode(year, nextSequence(ctx, roundSequences, year));

  ctx.tx
    .insert(rounds)
    .values({
      id: roundId,
      code,
      lotId: lot.id,
      status: 'draft',
      visibilityMode: input.visibilityMode ?? lot.defaultVisibilityMode,
      workloadThresholdSnapshot: lot.workloadThreshold,
      responseWorkingDaysSnapshot: lot.responseDeadlineWorkingDays,
      note: input.note ?? '',
      originRoundId: input.originRoundId ?? null,
      createdAt: ctx.at,
      createdBy: ctx.actor.label,
    })
    .run();

  addTrainingsToRound(ctx, roundId, input.trainingIds);

  logAudit(ctx, {
    eventType: 'round.created',
    summary: `Voor ${code} loodud hankeosas ${lot.code} (${input.trainingIds.length} koolitust)`,
    roundId,
    lotId: lot.id,
    after: { code, trainingCount: input.trainingIds.length },
  });

  return roundId;
}

/** Attach trainings to a draft round, claiming each one exclusively [E-09]. */
export function addTrainingsToRound(ctx: Ctx, roundId: string, trainingIds: readonly string[]): void {
  const round = loadRound(ctx, roundId);
  if (round.status !== 'draft') throw new Error('Koolitusi saab lisada ainult mustandvoorule.');

  for (const trainingId of trainingIds) {
    const training = ctx.tx.select().from(trainings).where(eq(trainings.id, trainingId)).get();
    if (!training) throw new Error('Koolitust ei leitud.');
    if (training.lotId !== round.lotId) {
      throw new Error(`Koolitus ${training.code} kuulub teise hankeosasse.`);
    }
    if (!canEnterRound(training.status) || training.currentRoundId !== null) {
      throw new Error(`Koolitus ${training.code} on juba voorus või määratud.`);
    }

    ctx.tx
      .insert(roundTrainings)
      .values({ id: crypto.randomUUID(), roundId, trainingId, addedAt: ctx.at })
      .onConflictDoNothing()
      .run();
    ctx.tx
      .update(trainings)
      .set({ status: 'in_round', currentRoundId: roundId, updatedAt: ctx.at })
      .where(eq(trainings.id, trainingId))
      .run();
  }
}

/** Remove a training from a draft round, releasing it. */
export function removeTrainingFromDraft(ctx: Ctx, roundId: string, trainingId: string): void {
  const round = loadRound(ctx, roundId);
  if (round.status !== 'draft') {
    throw new Error('Avatud voorust saab koolituse ainult tagasi võtta (eemaldada), mitte kustutada.');
  }
  ctx.tx
    .delete(roundTrainings)
    .where(and(eq(roundTrainings.roundId, roundId), eq(roundTrainings.trainingId, trainingId)))
    .run();
  releaseTraining(ctx, trainingId, 'unassigned');
}

function releaseTraining(ctx: Ctx, trainingId: string, status: 'unassigned' | 'leftover'): void {
  ctx.tx
    .update(trainings)
    .set({ status, currentRoundId: null, updatedAt: ctx.at })
    .where(eq(trainings.id, trainingId))
    .run();
}

export interface PublishRoundInput {
  /** later than the lot default is allowed; earlier is not [V-03] */
  deadlineAt?: number;
  /**
   * Give partners this many working days beyond the lot default. Preferred over
   * `deadlineAt` from a form: a date-time input has no timezone, whereas
   * working days are what the process is actually specified in.
   */
  extraWorkingDays?: number;
  visibilityMode?: VisibilityMode;
}

/**
 * Publish to **every** active partner of the lot, at one instant [V-01].
 *
 * There is deliberately no way to publish to a subset: the framework describes
 * only "one partner at a time" or "all partners", and an ad hoc cohort is not
 * available. The absence of a partner-selection parameter here is that rule.
 */
export function publishRound(ctx: Ctx, roundId: string, input: PublishRoundInput = {}): void {
  const round = loadRound(ctx, roundId);
  transition(ctx, round, 'open');
  const lot = loadLot(ctx, round.lotId);

  const trainingsInRound = roundTrainingList(ctx.tx, roundId);
  if (trainingsInRound.length === 0) {
    throw new Error('Voorus ei ole ühtegi koolitust.');
  }

  const members = ctx.tx
    .select({
      id: lotPartners.id,
      rank: lotPartners.rank,
      contactName: lotPartners.contactName,
      contactEmail: lotPartners.contactEmail,
      partnerId: lotPartners.partnerId,
    })
    .from(lotPartners)
    .where(and(eq(lotPartners.lotId, round.lotId), eq(lotPartners.isActive, true)))
    .all()
    .sort((a, b) => a.rank - b.rank);

  if (members.length === 0) {
    throw new Error('Hankeosal ei ole aktiivseid raamlepingu partnereid.');
  }

  const defaultDeadline = computeDefaultDeadline(lot, ctx.at);
  const extra = input.extraWorkingDays ?? 0;
  const deadlineAt =
    input.deadlineAt ??
    (extra > 0
      ? addWorkingDays(
          new Date(ctx.at),
          lot.responseDeadlineWorkingDays + extra,
          lot.deadlineLocalTime,
        ).getTime()
      : defaultDeadline);
  if (deadlineAt < defaultDeadline) {
    throw new Error(
      `Vastamistähtaeg ei saa olla varasem kui ${lot.responseDeadlineWorkingDays} tööpäeva (${formatDateTimeShort(defaultDeadline)}).`,
    );
  }

  const visibilityMode = input.visibilityMode ?? round.visibilityMode;
  const expectedDecisionAt = computeDecisionDeadline(lot, deadlineAt);

  ctx.tx
    .update(rounds)
    .set({
      status: 'open',
      visibilityMode,
      publishedAt: ctx.at,
      deadlineAt,
      expectedDecisionAt,
      // [V-03] freeze the config this round runs under
      workloadThresholdSnapshot: lot.workloadThreshold,
      responseWorkingDaysSnapshot: lot.responseDeadlineWorkingDays,
    })
    .where(eq(rounds.id, roundId))
    .run();

  const partnerNames = new Map(
    ctx.tx
      .select({ id: partners.id, name: partners.name })
      .from(partners)
      .all()
      .map((p) => [p.id, p.name] as const),
  );

  const lines = trainingLines(
    ctx,
    trainingsInRound.map((t) => t.id),
  );

  for (const member of members) {
    // [V-07] the rank is snapshotted here and never re-read for this round.
    ctx.tx
      .insert(roundParticipants)
      .values({
        id: crypto.randomUUID(),
        roundId,
        lotPartnerId: member.id,
        rankAtPublication: member.rank,
        contactNameSnapshot: member.contactName,
        contactEmailSnapshot: member.contactEmail,
        draftMarks: [],
        createdAt: ctx.at,
      })
      .run();

    notify(ctx, {
      recipientKind: 'partner',
      recipientLotPartnerId: member.id,
      type: 'round_published',
      roundId,
      emailTo: member.contactEmail,
      notice: renderRoundPublished({
        roundCode: round.code,
        lotLabel: lotLabel(lot),
        deadlineText: formatDateTime(deadlineAt),
        url: partnerUrl(roundId),
        contactName: member.contactName,
        partnerName: partnerNames.get(member.partnerId) ?? '',
        trainingCount: trainingsInRound.length,
        trainingLines: lines,
        visibilityDynamic: visibilityMode === 'dynamic',
        decisionText: formatDateTimeShort(expectedDecisionAt),
      }),
    });
  }

  logAudit(ctx, {
    eventType: 'round.published',
    summary: `Voor ${round.code} avaldatud kõigile hankeosa ${lot.code} partneritele (${members.length}), vastamistähtaeg ${formatDateTimeShort(deadlineAt)}`,
    roundId,
    lotId: lot.id,
    after: {
      deadlineAt,
      expectedDecisionAt,
      visibilityMode,
      participantCount: members.length,
      trainingCount: trainingsInRound.length,
      ranking: members.map((m) => ({ lotPartnerId: m.id, rank: m.rank })),
    },
  });
}

/* ------------------------------------------------------------------ *
 * partner answers
 * ------------------------------------------------------------------ */

/**
 * Resolve which membership is acting, from the company — never from client
 * input, so a partner cannot answer on behalf of another company.
 */
function resolveParticipant(ctx: Ctx, roundId: string, partnerId: string) {
  const participant = participantsOf(ctx.tx, roundId).find((p) => {
    const membership = ctx.tx
      .select({ partnerId: lotPartners.partnerId })
      .from(lotPartners)
      .where(eq(lotPartners.id, p.lotPartnerId))
      .get();
    return membership?.partnerId === partnerId;
  });
  return participant;
}

export type PartnerActionResult =
  | { ok: true; projectedCount: number }
  | { ok: false; reason: string; message: string };

/** Shared guards for any partner action on an open round. */
function guardPartnerAction(
  ctx: Ctx,
  roundId: string,
  partnerId: string,
):
  | { ok: true; round: Round; lot: Lot; participant: NonNullable<ReturnType<typeof resolveParticipant>> }
  | { ok: false; reason: string; message: string } {
  const round = loadRound(ctx, roundId);
  const lot = loadLot(ctx, round.lotId);
  const participant = resolveParticipant(ctx, roundId, partnerId);

  if (!participant) {
    return failure('not_participant', 'Te ei osale selles voorus.');
  }
  if (participant.excludedAt !== null) {
    return failure('excluded', 'Teid on sellest voorust välja arvatud.');
  }
  if (round.status !== 'open') {
    return failure(
      'round_not_open',
      round.status === 'closed' || round.status === 'confirmed'
        ? 'Vooru vastamistähtaeg on möödunud.'
        : 'See voor ei ole avatud.',
    );
  }
  if (round.deadlineAt !== null && ctx.at > round.deadlineAt) {
    // The timer has not ticked yet, but time has passed: close now, so no
    // confirmation can ever carry a timestamp after the deadline [E-05][V-06].
    closeRound(ctx, roundId);
    logAudit(ctx, {
      eventType: 'round.late_action_rejected',
      summary: `${participant.partnerName} üritas vastata pärast tähtaega (${formatDateTimeShort(round.deadlineAt)})`,
      roundId,
      lotId: lot.id,
      lotPartnerId: participant.lotPartnerId,
      after: { attemptedAt: ctx.at, deadlineAt: round.deadlineAt },
    });
    notify(ctx, {
      recipientKind: 'buyer',
      type: 'late_action_rejected',
      roundId,
      emailTo: teamEmail(),
      notice: renderLateActionRejected({
        roundCode: round.code,
        lotLabel: lotLabel(lot),
        url: buyerUrl(roundId),
        partnerName: participant.partnerName,
        attemptedAtText: formatDateTimeShort(ctx.at),
      }),
    });
    return failure('deadline_passed', 'Vastamise tähtaeg on möödunud.');
  }

  return { ok: true, round, lot, participant };
}

/** Marks still in the round, in case one was withdrawn since [V-04]. */
function validMarks(ctx: Ctx, roundId: string, marks: readonly string[]): string[] {
  const available = new Set(roundTrainingList(ctx.tx, roundId).map((t) => t.id));
  return [...new Set(marks)].filter((id) => available.has(id));
}

function currentProjection(ctx: Ctx, roundId: string, lotPartnerId: string, marks: string[], cap: number | null) {
  const input = projectionInput(ctx.tx, roundId, ctx.at);
  return partnerView(input, lotPartnerId, { marks, cap });
}

/** [K-02] Save the editable draft. Does not bind anything. */
export function saveDraftMarks(
  ctx: Ctx,
  roundId: string,
  partnerId: string,
  input: { marks: string[]; cap: number | null },
): PartnerActionResult {
  const guard = guardPartnerAction(ctx, roundId, partnerId);
  if (!guard.ok) return guard;

  const marks = validMarks(ctx, roundId, input.marks);
  ctx.tx
    .update(roundParticipants)
    .set({ draftMarks: marks, draftCap: input.cap, draftUpdatedAt: ctx.at })
    .where(eq(roundParticipants.id, guard.participant.id))
    .run();

  logAudit(ctx, {
    eventType: 'marks.draft_saved',
    summary: `${guard.participant.partnerName} salvestas mustandi (${marks.length} märget${input.cap !== null ? `, piirmäär ${input.cap}` : ''})`,
    roundId,
    lotId: guard.lot.id,
    lotPartnerId: guard.participant.lotPartnerId,
    after: { marks, cap: input.cap },
  });

  const view = currentProjection(ctx, roundId, guard.participant.lotPartnerId, marks, input.cap);
  return { ok: true, projectedCount: view.projectedCount };
}

/**
 * [K-02][K-04][K-05] Confirm the current marks — the partner's binding answer.
 *
 * Stored as a new append-only row, so the history of revisions is intact and
 * the binding answer is simply the latest one before the deadline.
 */
export function confirmMarks(
  ctx: Ctx,
  roundId: string,
  partnerId: string,
  input: { marks: string[]; cap: number | null },
): PartnerActionResult {
  const guard = guardPartnerAction(ctx, roundId, partnerId);
  if (!guard.ok) return guard;
  const { round, lot, participant } = guard;

  const marks = validMarks(ctx, roundId, input.marks);
  // [E-03] confirming an empty set is a decline, and the UI asks first.
  const kind = marks.length === 0 ? 'decline_all' : 'confirm';

  const previousCounts = projectionCounts(ctx, roundId);

  ctx.tx
    .insert(confirmations)
    .values({
      roundId,
      lotPartnerId: participant.lotPartnerId,
      kind,
      marks,
      cap: input.cap,
      confirmedAt: ctx.at,
      actorLabel: ctx.actor.label,
      contactEmail: participant.contactEmail,
      ip: ctx.evidence.ip,
      ua: ctx.evidence.ua,
      source: 'ui',
    })
    .run();

  ctx.tx
    .update(roundParticipants)
    .set({ draftMarks: marks, draftCap: input.cap, draftUpdatedAt: ctx.at })
    .where(eq(roundParticipants.id, participant.id))
    .run();

  const view = currentProjection(ctx, roundId, participant.lotPartnerId, marks, input.cap);

  logAudit(ctx, {
    eventType: kind === 'confirm' ? 'marks.confirmed' : 'marks.declined_all',
    summary:
      kind === 'confirm'
        ? `${participant.partnerName} kinnitas ${marks.length} märget${input.cap !== null ? ` (piirmäär ${input.cap})` : ''}, prognoos ${view.projectedCount}`
        : `${participant.partnerName} loobus kõigist vooru koolitustest`,
    roundId,
    lotId: lot.id,
    lotPartnerId: participant.lotPartnerId,
    after: { kind, marks, cap: input.cap, projectedCount: view.projectedCount },
  });

  const receipt =
    kind === 'confirm'
      ? renderConfirmationReceipt({
          roundCode: round.code,
          lotLabel: lotLabel(lot),
          deadlineText: formatDateTime(round.deadlineAt ?? ctx.at),
          url: partnerUrl(roundId),
          contactName: participant.contactName,
          confirmedAtText: formatDateTimeShort(ctx.at),
          trainingLines: trainingLines(ctx, marks),
          capText:
            input.cap !== null
              ? `Märkisite ülempiiri: võtate vastu kuni ${input.cap} koolitust.`
              : 'Ülempiiri te ei märkinud.',
          projectionText:
            round.visibilityMode === 'dynamic'
              ? `Praeguse seisuga on teile prognoositud ${view.projectedCount} koolitust. Prognoos on esialgne.`
              : 'Jaotus selgub pärast vastamistähtaega.',
        })
      : renderDeclineReceipt({
          roundCode: round.code,
          lotLabel: lotLabel(lot),
          deadlineText: formatDateTime(round.deadlineAt ?? ctx.at),
          url: partnerUrl(roundId),
          contactName: participant.contactName,
          confirmedAtText: formatDateTimeShort(ctx.at),
        });

  notify(ctx, {
    recipientKind: 'partner',
    recipientLotPartnerId: participant.lotPartnerId,
    type: kind === 'confirm' ? 'confirmation_receipt' : 'decline_receipt',
    roundId,
    emailTo: participant.contactEmail,
    notice: receipt,
  });

  // [D-04] tell the partners whose projection this changed — only in dynamic
  // mode, where they can see the effect anyway.
  if (round.visibilityMode === 'dynamic') {
    notifyProjectionChanges(ctx, roundId, previousCounts, participant.lotPartnerId);
  }

  return { ok: true, projectedCount: view.projectedCount };
}

/** [K-07] An explicit decline, distinct from silence. */
export function declineAll(ctx: Ctx, roundId: string, partnerId: string): PartnerActionResult {
  return confirmMarks(ctx, roundId, partnerId, { marks: [], cap: null });
}

/** Projected count per participant right now, for change detection. */
function projectionCounts(ctx: Ctx, roundId: string): Map<string, number> {
  const input = projectionInput(ctx.tx, roundId, ctx.at);
  const result = allocate(input);
  const counts = new Map<string, number>();
  for (const participant of input.participants) {
    counts.set(
      participant.lotPartnerId,
      result.allocations.find((a) => a.lotPartnerId === participant.lotPartnerId)?.trainingIds.length ?? 0,
    );
  }
  return counts;
}

const PROJECTION_NOTICE_INTERVAL_MS = 4 * 3_600_000;

/**
 * [D-04] Notify partners whose projected count moved, rate-limited.
 *
 * Suppressed in the final 24 hours, where the reminder [D-05] carries the
 * current position instead — otherwise a flurry of late revisions would spam
 * everyone at exactly the moment they are deciding.
 *
 * The partner who just acted is skipped: their own projection did move, but the
 * [D-02] receipt they are already being sent states it. Two messages for one
 * click would train them to ignore both. Recorded as an interpretation in the
 * spec's section L.
 */
function notifyProjectionChanges(
  ctx: Ctx,
  roundId: string,
  previous: Map<string, number>,
  actingLotPartnerId: string,
): void {
  const round = loadRound(ctx, roundId);
  const lot = loadLot(ctx, round.lotId);
  const current = projectionCounts(ctx, roundId);
  const inFinalDay = round.deadlineAt !== null && round.deadlineAt - ctx.at <= 86_400_000;

  for (const participant of participantsOf(ctx.tx, roundId)) {
    if (participant.excludedAt !== null) continue;
    if (participant.lotPartnerId === actingLotPartnerId) continue;
    const before = previous.get(participant.lotPartnerId) ?? 0;
    const after = current.get(participant.lotPartnerId) ?? 0;
    if (before === after) continue;

    ctx.tx
      .update(roundParticipants)
      .set({ lastProjectionCount: after })
      .where(eq(roundParticipants.id, participant.id))
      .run();

    if (inFinalDay) continue;
    const lastNotified = participant.lastProjectionNotifiedAt ?? 0;
    if (ctx.at - lastNotified < PROJECTION_NOTICE_INTERVAL_MS) continue;

    ctx.tx
      .update(roundParticipants)
      .set({ lastProjectionNotifiedAt: ctx.at })
      .where(eq(roundParticipants.id, participant.id))
      .run();

    notify(ctx, {
      recipientKind: 'partner',
      recipientLotPartnerId: participant.lotPartnerId,
      type: 'projection_changed',
      roundId,
      emailTo: participant.contactEmail,
      notice: renderProjectionChanged({
        roundCode: round.code,
        lotLabel: lotLabel(lot),
        deadlineText: formatDateTime(round.deadlineAt ?? ctx.at),
        url: partnerUrl(roundId),
        contactName: participant.contactName,
        previousCount: before,
        currentCount: after,
      }),
    });
  }
}

/* ------------------------------------------------------------------ *
 * changes to an open round [V-04]
 * ------------------------------------------------------------------ */

/**
 * Extend by whole **working** days from the current deadline, keeping the local
 * time of day the partners were told. This is what the buyer UI offers, since
 * "give them two more days" means working days everywhere else in the process.
 */
export function extendDeadlineByWorkingDays(
  ctx: Ctx,
  roundId: string,
  workingDays: number,
  reason: string,
): void {
  if (!Number.isInteger(workingDays) || workingDays < 1) {
    throw new Error('Pikendus peab olema vähemalt üks tööpäev.');
  }
  const round = loadRound(ctx, roundId);
  if (round.deadlineAt === null) throw new Error('Vooru tähtaeg puudub.');
  const lot = loadLot(ctx, round.lotId);
  const next = addWorkingDays(new Date(round.deadlineAt), workingDays, lot.deadlineLocalTime).getTime();
  extendDeadline(ctx, roundId, next, reason);
}

export function extendDeadline(ctx: Ctx, roundId: string, newDeadlineAt: number, reason: string): void {
  const round = loadRound(ctx, roundId);
  if (round.status !== 'open') throw new Error('Tähtaega saab pikendada ainult avatud vooru puhul.');
  if (round.deadlineAt !== null && newDeadlineAt <= round.deadlineAt) {
    // Shortening would strip time from partners who relied on the published
    // deadline, so only extension is available [V-04].
    throw new Error('Tähtaega saab ainult pikendada.');
  }
  const lot = loadLot(ctx, round.lotId);
  const expectedDecisionAt = computeDecisionDeadline(lot, newDeadlineAt);

  ctx.tx
    .update(rounds)
    .set({ deadlineAt: newDeadlineAt, expectedDecisionAt })
    .where(eq(rounds.id, roundId))
    .run();

  logAudit(ctx, {
    eventType: 'round.deadline_extended',
    summary: `Voor ${round.code}: tähtaeg pikendatud kuni ${formatDateTimeShort(newDeadlineAt)}${reason ? ` — ${reason}` : ''}`,
    roundId,
    lotId: lot.id,
    before: { deadlineAt: round.deadlineAt },
    after: { deadlineAt: newDeadlineAt, reason },
  });

  for (const participant of participantsOf(ctx.tx, roundId)) {
    if (participant.excludedAt !== null) continue;
    notify(ctx, {
      recipientKind: 'partner',
      recipientLotPartnerId: participant.lotPartnerId,
      type: 'round_changed',
      roundId,
      emailTo: participant.contactEmail,
      notice: renderRoundChanged({
        roundCode: round.code,
        lotLabel: lotLabel(lot),
        deadlineText: formatDateTime(newDeadlineAt),
        url: partnerUrl(roundId),
        contactName: participant.contactName,
        changeText: 'vastamistähtaega on pikendatud',
        reason,
      }),
    });
  }
}

/**
 * [V-04] Withdraw a training from an open round.
 *
 * Reduction only — the round's contents can shrink but never grow or change,
 * because partners have already been offered the published terms and may have
 * confirmed against them. Existing confirmations are never edited; the marks on
 * a withdrawn training are simply excluded when the allocation input is built.
 */
export function withdrawTraining(ctx: Ctx, roundId: string, trainingId: string, reason: string): void {
  const round = loadRound(ctx, roundId);
  if (round.status !== 'open') throw new Error('Koolitust saab tagasi võtta ainult avatud voorust.');
  if (!reason.trim()) throw new Error('Koolituse tagasivõtmine nõuab põhjendust.');

  const link = ctx.tx
    .select()
    .from(roundTrainings)
    .where(and(eq(roundTrainings.roundId, roundId), eq(roundTrainings.trainingId, trainingId)))
    .get();
  if (!link || link.withdrawnAt !== null) throw new Error('Koolitus ei ole selles voorus.');

  ctx.tx
    .update(roundTrainings)
    .set({ withdrawnAt: ctx.at, withdrawnReason: reason.trim(), withdrawnBy: ctx.actor.label })
    .where(eq(roundTrainings.id, link.id))
    .run();
  releaseTraining(ctx, trainingId, 'unassigned');

  const training = ctx.tx.select().from(trainings).where(eq(trainings.id, trainingId)).get();
  const lot = loadLot(ctx, round.lotId);

  logAudit(ctx, {
    eventType: 'round.training_withdrawn',
    summary: `Voor ${round.code}: koolitus ${training?.code ?? trainingId} võeti tagasi — ${reason.trim()}`,
    roundId,
    trainingId,
    lotId: lot.id,
    after: { reason: reason.trim() },
  });

  for (const participant of participantsOf(ctx.tx, roundId)) {
    if (participant.excludedAt !== null) continue;
    notify(ctx, {
      recipientKind: 'partner',
      recipientLotPartnerId: participant.lotPartnerId,
      type: 'round_changed',
      roundId,
      emailTo: participant.contactEmail,
      notice: renderRoundChanged({
        roundCode: round.code,
        lotLabel: lotLabel(lot),
        deadlineText: formatDateTime(round.deadlineAt ?? ctx.at),
        url: partnerUrl(roundId),
        contactName: participant.contactName,
        changeText: `koolitus ${training?.code ?? ''} on voorust tagasi võetud`,
        reason: reason.trim(),
      }),
    });
  }
}

export function cancelRound(ctx: Ctx, roundId: string, reason: string): void {
  const round = loadRound(ctx, roundId);
  transition(ctx, round, 'cancelled');
  const lot = loadLot(ctx, round.lotId);

  for (const link of ctx.tx.select().from(roundTrainings).where(eq(roundTrainings.roundId, roundId)).all()) {
    if (link.withdrawnAt === null) releaseTraining(ctx, link.trainingId, 'unassigned');
  }

  ctx.tx
    .update(rounds)
    .set({ status: 'cancelled', cancelledAt: ctx.at, cancelReason: reason })
    .where(eq(rounds.id, roundId))
    .run();

  logAudit(ctx, {
    eventType: 'round.cancelled',
    summary: `Voor ${round.code} tühistatud${reason ? `: ${reason}` : ''}`,
    roundId,
    lotId: lot.id,
    after: { reason },
  });

  if (round.status === 'open') {
    for (const participant of participantsOf(ctx.tx, roundId)) {
      if (participant.excludedAt !== null) continue;
      notify(ctx, {
        recipientKind: 'partner',
        recipientLotPartnerId: participant.lotPartnerId,
        type: 'round_cancelled',
        roundId,
        emailTo: participant.contactEmail,
        notice: renderRoundCancelled({
          roundCode: round.code,
          lotLabel: lotLabel(lot),
          url: partnerUrl(roundId),
          contactName: participant.contactName,
          reason,
        }),
      });
    }
  }
}

/* ------------------------------------------------------------------ *
 * closing [V-06]
 * ------------------------------------------------------------------ */

/**
 * Freeze the proposal at the deadline and record each participant's outcome.
 *
 * Idempotent: it re-checks the status, so the timer, a lazy page load and the
 * clock-advance path can all call it without double-closing.
 */
export function closeRound(ctx: Ctx, roundId: string): { closed: boolean; code: string } {
  const round = loadRound(ctx, roundId);
  if (round.status !== 'open') return { closed: false, code: round.code };
  const lot = loadLot(ctx, round.lotId);

  const input = proposalInput(ctx.tx, roundId);
  const result = allocate(input);

  ctx.tx
    .update(rounds)
    .set({
      status: 'closed',
      closedAt: ctx.at,
      proposalSnapshot: {
        input,
        result,
        computedAt: ctx.at,
        algorithmVersion: ALGORITHM_VERSION,
      },
    })
    .where(eq(rounds.id, roundId))
    .run();

  // [K-08] the outcome of every participant is stored, so non-response is a
  // recorded fact rather than an absence.
  let confirmed = 0;
  let declined = 0;
  let noResponse = 0;
  for (const step of result.trace) {
    const outcome =
      step.outcome === 'excluded'
        ? 'excluded'
        : step.outcome === 'no_response'
          ? 'no_response'
          : step.outcome === 'declined_all'
            ? 'declined_all'
            : 'confirmed';
    if (outcome === 'confirmed') confirmed += 1;
    else if (outcome === 'declined_all') declined += 1;
    else if (outcome === 'no_response') noResponse += 1;

    ctx.tx
      .update(roundParticipants)
      .set({ outcomeAtClose: outcome })
      .where(
        and(
          eq(roundParticipants.roundId, roundId),
          eq(roundParticipants.lotPartnerId, step.lotPartnerId),
        ),
      )
      .run();
  }

  const allocatedCount = result.allocations.reduce((sum, a) => sum + a.trainingIds.length, 0);

  logAudit(ctx, {
    eventType: 'round.closed',
    summary: `Voor ${round.code} suletud: kinnitas ${confirmed}, loobus ${declined}, ei vastanud ${noResponse}; ettepanekus ${allocatedCount} koolitust, jääk ${result.leftover.length}`,
    roundId,
    lotId: lot.id,
    after: {
      confirmed,
      declined,
      noResponse,
      allocatedCount,
      leftoverCount: result.leftover.length,
    },
  });

  notify(ctx, {
    recipientKind: 'buyer',
    type: 'buyer_round_closed',
    roundId,
    emailTo: teamEmail(),
    notice: renderBuyerRoundClosed({
      roundCode: round.code,
      lotLabel: lotLabel(lot),
      url: `${buyerUrl(roundId)}/ulevaatus`,
      confirmedCount: confirmed,
      declinedCount: declined,
      noResponseCount: noResponse,
      allocatedCount,
      leftoverCount: result.leftover.length,
    }),
  });

  return { closed: true, code: round.code };
}

/** [D-05] The reminder 24 hours before a deadline. */
export function sendDeadlineReminder(ctx: Ctx, roundId: string): number {
  const round = loadRound(ctx, roundId);
  if (round.status !== 'open' || round.deadlineAt === null) return 0;
  const lot = loadLot(ctx, round.lotId);
  const counts = projectionCounts(ctx, roundId);

  let sent = 0;
  for (const participant of participantsOf(ctx.tx, roundId)) {
    if (participant.excludedAt !== null || participant.reminderSentAt !== null) continue;

    const latest = latestConfirmation(ctx.tx, roundId, participant.lotPartnerId);
    const projected = counts.get(participant.lotPartnerId) ?? 0;

    const statusText = !latest
      ? 'Te ei ole veel oma valikut kinnitanud.'
      : latest.kind === 'decline_all'
        ? 'Olete loobunud vooru koolitustest.'
        : `Teie kinnitatud valik sisaldab ${latest.marks.length} koolitust.`;

    ctx.tx
      .update(roundParticipants)
      .set({ reminderSentAt: ctx.at })
      .where(eq(roundParticipants.id, participant.id))
      .run();

    notify(ctx, {
      recipientKind: 'partner',
      recipientLotPartnerId: participant.lotPartnerId,
      type: 'reminder_24h',
      roundId,
      emailTo: participant.contactEmail,
      notice: renderDeadlineReminder({
        roundCode: round.code,
        lotLabel: lotLabel(lot),
        deadlineText: formatDateTime(round.deadlineAt),
        url: partnerUrl(roundId),
        contactName: participant.contactName,
        statusText,
        projectionText:
          round.visibilityMode === 'dynamic'
            ? `Praeguse seisuga on teile prognoositud ${projected} koolitust (${formatRemaining(ctx.at, round.deadlineAt)}).`
            : 'Jaotus selgub pärast vastamistähtaega.',
      }),
    });
    sent += 1;
  }
  return sent;
}

/* ------------------------------------------------------------------ *
 * buyer review [T]
 * ------------------------------------------------------------------ */

export interface AdjustmentInput {
  lotPartnerId: string;
  kind: 'skip' | 'cap';
  cap?: number;
  justification: string;
}

/**
 * [T-02] The only adjustments the framework allows: skip a partner for this
 * round, or cap how much they receive. Both require a justification, and
 * neither can hand a training to a chosen partner or reorder the ranking.
 */
export function applyAdjustment(ctx: Ctx, roundId: string, input: AdjustmentInput): void {
  const round = loadRound(ctx, roundId);
  if (round.status !== 'closed') {
    throw new Error('Kohandusi saab teha ainult suletud vooru ülevaatusel.');
  }
  if (!input.justification.trim()) {
    // The right exists because of workload; using it without saying why would
    // leave the audit trail unable to show the reason.
    throw new Error('Kohandus nõuab põhjendust.');
  }
  if (input.kind === 'cap' && (input.cap === undefined || input.cap < 0)) {
    throw new Error('Piirmäär peab olema null või suurem.');
  }

  const participant = participantsOf(ctx.tx, roundId).find(
    (p) => p.lotPartnerId === input.lotPartnerId,
  );
  if (!participant) throw new Error('Partner ei osale selles voorus.');

  ctx.tx
    .insert(buyerAdjustments)
    .values({
      roundId,
      lotPartnerId: input.lotPartnerId,
      kind: input.kind,
      capValue: input.kind === 'cap' ? (input.cap ?? null) : null,
      justification: input.justification.trim(),
      createdBy: ctx.actor.label,
      createdAt: ctx.at,
    })
    .run();

  logAudit(ctx, {
    eventType: 'adjustment.applied',
    summary:
      input.kind === 'skip'
        ? `Voor ${round.code}: ${participant.partnerName} jäetakse vahele — ${input.justification.trim()}`
        : `Voor ${round.code}: ${participant.partnerName} piiratud ${input.cap} koolitusele — ${input.justification.trim()}`,
    roundId,
    lotId: round.lotId,
    lotPartnerId: input.lotPartnerId,
    after: { kind: input.kind, cap: input.cap ?? null, justification: input.justification.trim() },
  });
}

export function clearAdjustment(ctx: Ctx, roundId: string, lotPartnerId: string): void {
  const round = loadRound(ctx, roundId);
  if (round.status !== 'closed') throw new Error('Kohandusi saab muuta ainult ülevaatusel.');

  ctx.tx
    .insert(buyerAdjustments)
    .values({
      roundId,
      lotPartnerId,
      kind: 'clear',
      justification: '',
      createdBy: ctx.actor.label,
      createdAt: ctx.at,
    })
    .run();

  logAudit(ctx, {
    eventType: 'adjustment.cleared',
    summary: `Voor ${round.code}: kohandus tühistatud`,
    roundId,
    lotId: round.lotId,
    lotPartnerId,
  });
}

/**
 * The final allocation as it currently stands, for the review preview.
 *
 * A read, so it takes a reader rather than a mutation context — the review page
 * renders this on every load without opening a transaction.
 */
export function previewFinalAllocation(tx: Tx | Db, roundId: string): AllocationResult {
  return allocate(finalInput(tx, roundId));
}

/**
 * [T-04][T-05] Confirm the allocation: create one order per allocated partner.
 *
 * The order is the operative call-off contract, so it carries a frozen document
 * snapshot and points at the confirmation that binds the partner.
 */
export function confirmAllocation(ctx: Ctx, roundId: string): { orderIds: string[]; leftover: string[] } {
  const round = loadRound(ctx, roundId);
  transition(ctx, round, 'confirmed');
  const lot = loadLot(ctx, round.lotId);

  const input = finalInput(ctx.tx, roundId);
  const result = allocate(input);

  ctx.tx
    .update(rounds)
    .set({
      status: 'confirmed',
      confirmedAt: ctx.at,
      confirmedBy: ctx.actor.label,
      finalSnapshot: { input, result, computedAt: ctx.at, algorithmVersion: ALGORITHM_VERSION },
    })
    .where(eq(rounds.id, roundId))
    .run();

  const year = new Date(ctx.at).getFullYear();
  const orderIds: string[] = [];
  const orderLines: string[] = [];

  const trainingRows = new Map(
    ctx.tx
      .select()
      .from(trainings)
      .where(inArray(trainings.id, roundTrainingList(ctx.tx, roundId).map((t) => t.id)))
      .all()
      .map((t) => [t.id, t] as const),
  );

  for (const allocation of result.allocations) {
    const participant = participantsOf(ctx.tx, roundId).find(
      (p) => p.lotPartnerId === allocation.lotPartnerId,
    );
    if (!participant) continue;

    const membership = ctx.tx
      .select()
      .from(lotPartners)
      .where(eq(lotPartners.id, allocation.lotPartnerId))
      .get();
    const partner = membership
      ? ctx.tx.select().from(partners).where(eq(partners.id, membership.partnerId)).get()
      : undefined;
    if (!membership || !partner) continue;

    const binding = latestConfirmation(ctx.tx, roundId, allocation.lotPartnerId);
    const orderId = crypto.randomUUID();
    const seq = nextSequence(ctx, orderSequences, year);
    const number = orderDisplayNumber(year, seq);

    const rows = allocation.trainingIds
      .map((id) => trainingRows.get(id))
      .filter((row): row is typeof trainings.$inferSelect => Boolean(row));
    const total = rows.length * membership.unitPriceEur;

    const document: OrderDocument = {
      frameworkReference:
        'Raamleping „Eesti.ai koolitajate tellimine“, riigihanke viitenumber 10567384',
      lotCode: lot.code,
      lotName: lot.name,
      roundCode: round.code,
      partnerName: partner.name,
      partnerRegCode: partner.regCode,
      contactName: participant.contactName,
      contactEmail: participant.contactEmail,
      trainings: rows.map((row) => ({
        code: row.code,
        title: row.title,
        workshopType: WORKSHOP_TYPE_LABELS[row.workshopType],
        eventDate: row.eventDate,
        eventEnd: row.eventEnd,
        county: row.county,
        locationText: row.locationText,
        participantCount: row.participantCount,
        language: row.language,
        unitPriceEur: membership.unitPriceEur,
      })),
      totalEur: total,
      partnerConfirmedAt: binding?.confirmedAt ?? null,
      buyerConfirmedAt: ctx.at,
      buyerConfirmedBy: ctx.actor.label,
    };

    ctx.tx
      .insert(orders)
      .values({
        id: orderId,
        orderYear: year,
        orderSeq: seq,
        roundId,
        lotId: lot.id,
        lotPartnerId: allocation.lotPartnerId,
        kind: 'allocation',
        partnerConfirmationId: binding?.id ?? null,
        partnerConfirmedAt: binding?.confirmedAt ?? null,
        buyerConfirmedAt: ctx.at,
        buyerConfirmedBy: ctx.actor.label,
        status: 'active',
        documentSnapshot: document,
        createdAt: ctx.at,
      })
      .run();

    for (const row of rows) {
      ctx.tx
        .insert(orderTrainings)
        .values({
          id: crypto.randomUUID(),
          orderId,
          trainingId: row.id,
          unitPriceEur: membership.unitPriceEur,
        })
        .run();
      ctx.tx
        .update(trainings)
        .set({
          status: 'allocated',
          allocatedLotPartnerId: allocation.lotPartnerId,
          orderId,
          currentRoundId: null,
          updatedAt: ctx.at,
        })
        .where(eq(trainings.id, row.id))
        .run();
    }

    orderIds.push(orderId);
    orderLines.push(`${number} · ${partner.name} · ${rows.length} koolitust · ${formatEur(total)}`);

    logAudit(ctx, {
      eventType: 'order.created',
      summary: `Tellimus ${number} loodud: ${partner.name}, ${rows.length} koolitust`,
      roundId,
      lotId: lot.id,
      lotPartnerId: allocation.lotPartnerId,
      orderId,
      after: { number, trainingCodes: rows.map((r) => r.code), totalEur: total },
    });

    notify(ctx, {
      recipientKind: 'partner',
      recipientLotPartnerId: allocation.lotPartnerId,
      type: 'order_issued',
      roundId,
      orderId,
      emailTo: participant.contactEmail,
      notice: renderOrderIssued({
        roundCode: round.code,
        lotLabel: lotLabel(lot),
        url: orderUrl(orderId),
        contactName: participant.contactName,
        partnerName: partner.name,
        orderNumber: number,
        trainingLines: trainingLines(ctx, allocation.trainingIds),
        totalText: `Hinnanguline kogumaksumus: ${formatEur(total)} (ühikhind ${formatEur(membership.unitPriceEur)}).`,
        partnerConfirmedAtText: binding ? formatDateTimeShort(binding.confirmedAt) : '—',
        buyerConfirmedAtText: formatDateTimeShort(ctx.at),
        buyerContact: ctx.actor.label,
      }),
    });
  }

  // [N-08] Everyone who marked something that went elsewhere gets a neutral
  // note. It never names the other partner, and never says whether the reason
  // was priority or a buyer adjustment.
  for (const participant of participantsOf(ctx.tx, roundId)) {
    if (participant.excludedAt !== null) continue;
    const binding = latestConfirmation(ctx.tx, roundId, participant.lotPartnerId);
    if (!binding || binding.kind === 'decline_all') continue;

    const mine = new Set(
      result.allocations.find((a) => a.lotPartnerId === participant.lotPartnerId)?.trainingIds ?? [],
    );
    const lost = binding.marks.filter((id) => !mine.has(id) && trainingRows.has(id));
    if (lost.length === 0) continue;

    notify(ctx, {
      recipientKind: 'partner',
      recipientLotPartnerId: participant.lotPartnerId,
      type: 'allocated_elsewhere',
      roundId,
      emailTo: participant.contactEmail,
      notice: renderAllocatedElsewhere({
        roundCode: round.code,
        lotLabel: lotLabel(lot),
        url: partnerUrl(roundId),
        contactName: participant.contactName,
        trainingLines: trainingLines(ctx, lost),
        allocatedCount: mine.size,
      }),
    });
  }

  // [J-06][T-06] whatever nobody took waits visibly for a decision.
  for (const trainingId of result.leftover) {
    ctx.tx
      .update(trainings)
      .set({
        status: 'leftover',
        currentRoundId: null,
        leftoverFromRoundId: roundId,
        updatedAt: ctx.at,
      })
      .where(eq(trainings.id, trainingId))
      .run();
  }

  logAudit(ctx, {
    eventType: 'round.confirmed',
    summary: `Voor ${round.code} kinnitatud: ${orderIds.length} tellimust, jääk ${result.leftover.length} koolitust`,
    roundId,
    lotId: lot.id,
    after: { orderCount: orderIds.length, leftoverCount: result.leftover.length },
  });

  notify(ctx, {
    recipientKind: 'buyer',
    type: 'buyer_round_confirmed',
    roundId,
    emailTo: teamEmail(),
    notice: renderBuyerRoundConfirmed({
      roundCode: round.code,
      lotLabel: lotLabel(lot),
      url: buyerUrl(roundId),
      orderLines,
      leftoverCount: result.leftover.length,
    }),
  });

  return { orderIds, leftover: result.leftover };
}

/* ------------------------------------------------------------------ *
 * jääk [T-06]
 * ------------------------------------------------------------------ */

export type LeftoverDecision =
  | { kind: 'new_round'; roundId: string }
  | { kind: 'cancel'; reason: string };

/**
 * [T-06] Re-issue a leftover training into a new round.
 *
 * The same training row is reused, so its identity and the history of every
 * round it has been in are preserved [E-09].
 */
export function reissueLeftover(ctx: Ctx, trainingId: string, roundId: string): void {
  const training = ctx.tx.select().from(trainings).where(eq(trainings.id, trainingId)).get();
  if (!training) throw new Error('Koolitust ei leitud.');
  if (training.status !== 'leftover') throw new Error('See koolitus ei ole jääk.');

  addTrainingsToRound(ctx, roundId, [trainingId]);

  logAudit(ctx, {
    eventType: 'training.leftover_reissued',
    summary: `Jääk ${training.code} lisati uude vooru`,
    trainingId,
    roundId,
    lotId: training.lotId,
  });
}

export function cancelLeftover(ctx: Ctx, trainingId: string, reason: string): void {
  const training = ctx.tx.select().from(trainings).where(eq(trainings.id, trainingId)).get();
  if (!training) throw new Error('Koolitust ei leitud.');
  if (!reason.trim()) throw new Error('Tühistamine nõuab põhjendust.');

  ctx.tx
    .update(trainings)
    .set({ status: 'cancelled', cancelledAt: ctx.at, cancelReason: reason.trim(), updatedAt: ctx.at })
    .where(eq(trainings.id, trainingId))
    .run();

  logAudit(ctx, {
    eventType: 'training.leftover_cancelled',
    summary: `Koolitus ${training.code} tühistatud — ${reason.trim()}`,
    trainingId,
    lotId: training.lotId,
    after: { reason: reason.trim() },
  });
}

/* ------------------------------------------------------------------ *
 * memberships and orders after the fact
 * ------------------------------------------------------------------ */

/**
 * [E-01] Deactivating a framework membership excludes that partner from every
 * open round of the lot.
 *
 * Exclusion is deliberately never offered as a per-round action: choosing who
 * takes part in a single round is exactly the subset selection the framework
 * does not permit [V-01]. It is only ever a consequence of the membership
 * itself ending.
 */
export function deactivateLotPartner(ctx: Ctx, lotPartnerId: string, reason: string): void {
  const membership = ctx.tx.select().from(lotPartners).where(eq(lotPartners.id, lotPartnerId)).get();
  if (!membership) throw new Error('Partneri osalust ei leitud.');
  const partner = ctx.tx.select().from(partners).where(eq(partners.id, membership.partnerId)).get();
  const lot = loadLot(ctx, membership.lotId);

  ctx.tx
    .update(lotPartners)
    .set({ isActive: false, deactivatedAt: ctx.at })
    .where(eq(lotPartners.id, lotPartnerId))
    .run();

  logAudit(ctx, {
    eventType: 'partner.deactivated',
    summary: `${partner?.name ?? 'Partner'} osalus hankeosas ${lot.code} lõpetatud${reason ? `: ${reason}` : ''}`,
    lotId: lot.id,
    lotPartnerId,
    after: { reason },
  });

  const openRounds = ctx.tx
    .select({ id: rounds.id, code: rounds.code })
    .from(rounds)
    .where(and(eq(rounds.lotId, membership.lotId), eq(rounds.status, 'open')))
    .all();

  for (const round of openRounds) {
    const participant = ctx.tx
      .select()
      .from(roundParticipants)
      .where(
        and(
          eq(roundParticipants.roundId, round.id),
          eq(roundParticipants.lotPartnerId, lotPartnerId),
          isNull(roundParticipants.excludedAt),
        ),
      )
      .get();
    if (!participant) continue;

    ctx.tx
      .update(roundParticipants)
      .set({ excludedAt: ctx.at, excludedReason: reason })
      .where(eq(roundParticipants.id, participant.id))
      .run();

    logAudit(ctx, {
      eventType: 'participant.excluded',
      summary: `${partner?.name ?? 'Partner'} arvati voorust ${round.code} välja — osalus hankeosas on lõpetatud`,
      roundId: round.id,
      lotId: lot.id,
      lotPartnerId,
    });

    notify(ctx, {
      recipientKind: 'partner',
      recipientLotPartnerId: lotPartnerId,
      type: 'participant_excluded',
      roundId: round.id,
      emailTo: participant.contactEmailSnapshot,
      notice: renderParticipantExcluded({
        roundCode: round.code,
        lotLabel: lotLabel(lot),
        url: partnerUrl(round.id),
        contactName: participant.contactNameSnapshot,
        reason,
      }),
    });

    notify(ctx, {
      recipientKind: 'buyer',
      type: 'participant_excluded',
      roundId: round.id,
      emailTo: teamEmail(),
      notice: {
        title: `${partner?.name ?? 'Partner'} arvati voorust ${round.code} välja`,
        body: `Partneri osalus hankeosas ${lot.code} lõpetati, seetõttu ei arvestata tema märkeid voorus ${round.code}.`,
        bodyHtml: '',
      },
    });
  }
}

export function markTrainingCompleted(ctx: Ctx, trainingId: string): void {
  const training = ctx.tx.select().from(trainings).where(eq(trainings.id, trainingId)).get();
  if (!training) throw new Error('Koolitust ei leitud.');
  if (training.status !== 'allocated') throw new Error('Lõpetada saab ainult määratud koolituse.');

  ctx.tx
    .update(trainings)
    .set({ status: 'completed', completedAt: ctx.at, updatedAt: ctx.at })
    .where(eq(trainings.id, trainingId))
    .run();

  logAudit(ctx, {
    eventType: 'training.completed',
    summary: `Koolitus ${training.code} märgiti läbiviiduks`,
    trainingId,
    lotId: training.lotId,
    orderId: training.orderId,
  });
}

/** [E-07] The buyer cancels a training that had already been allocated. */
export function cancelOrderTraining(
  ctx: Ctx,
  orderId: string,
  trainingId: string,
  reason: string,
): void {
  if (!reason.trim()) throw new Error('Tühistamine nõuab põhjendust.');
  const link = ctx.tx
    .select()
    .from(orderTrainings)
    .where(and(eq(orderTrainings.orderId, orderId), eq(orderTrainings.trainingId, trainingId)))
    .get();
  if (!link || link.cancelledAt !== null) throw new Error('Koolitust ei ole selles tellimuses.');

  ctx.tx
    .update(orderTrainings)
    .set({ cancelledAt: ctx.at, cancelReason: reason.trim() })
    .where(eq(orderTrainings.id, link.id))
    .run();
  ctx.tx
    .update(trainings)
    .set({ status: 'cancelled', cancelledAt: ctx.at, cancelReason: reason.trim(), updatedAt: ctx.at })
    .where(eq(trainings.id, trainingId))
    .run();

  const training = ctx.tx.select().from(trainings).where(eq(trainings.id, trainingId)).get();
  logAudit(ctx, {
    eventType: 'order.training_cancelled',
    summary: `Tellimusest tühistati koolitus ${training?.code ?? trainingId} — ${reason.trim()}`,
    orderId,
    trainingId,
    after: { reason: reason.trim() },
  });
}

/**
 * [E-07] A partner withdrew after the order was confirmed.
 *
 * Recorded as its own event and flagged for contract follow-up, which happens
 * outside this tool: the order is a hankeleping, so a withdrawal is a
 * contractual matter, not a state change the cascade can absorb.
 */
export function recordPartnerWithdrawal(
  ctx: Ctx,
  orderId: string,
  trainingId: string,
  note: string,
): void {
  const link = ctx.tx
    .select()
    .from(orderTrainings)
    .where(and(eq(orderTrainings.orderId, orderId), eq(orderTrainings.trainingId, trainingId)))
    .get();
  if (!link) throw new Error('Koolitust ei ole selles tellimuses.');

  ctx.tx
    .update(orderTrainings)
    .set({ partnerWithdrewAt: ctx.at, partnerWithdrawNote: note })
    .where(eq(orderTrainings.id, link.id))
    .run();
  ctx.tx
    .update(trainings)
    .set({ status: 'leftover', allocatedLotPartnerId: null, updatedAt: ctx.at })
    .where(eq(trainings.id, trainingId))
    .run();

  const training = ctx.tx.select().from(trainings).where(eq(trainings.id, trainingId)).get();
  logAudit(ctx, {
    eventType: 'order.partner_withdrew',
    summary: `Partner loobus pärast kinnitamist koolitusest ${training?.code ?? trainingId}${note ? `: ${note}` : ''} — vajab lepingulist järelmenetlust`,
    orderId,
    trainingId,
    after: { note },
  });
}

/* re-exported so callers do not need a second import */
export { effectiveAdjustments, projectionInput, workloadFor };
