/**
 * Building, hashing and storing a round's protocol [L-22].
 *
 * The protocol is written once, when the round ends, inside the same
 * transaction as the ending — so it either exists with the decision or neither
 * does. What is stored is the canonical JSON text and its SHA-256; the PDF and
 * the .xlsx annex are rendered from that text on demand.
 *
 * Two properties this module owes the rest of the system:
 *
 *  - **Determinism.** Every query here has a total order, so building the same
 *    round twice yields the same bytes and therefore the same hash. Anything
 *    unordered (a `Set`, an object keyed by id) is sorted before it goes in.
 *  - **No recomputation.** The allocation snapshots are copied as they were
 *    stored, the deadline history comes from the audit rows that changed it, and
 *    the frozen contact names come from `round_participants`. Nothing is
 *    re-derived from today's framework data, because the protocol documents a
 *    decision made under yesterday's.
 */

import { createHash } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import {
  auditEvents,
  buyerAdjustments,
  lotPartners,
  lots,
  notifications,
  orderTrainings,
  orders,
  partners,
  roundParticipants,
  roundProtocols,
  roundTrainings,
  rounds,
  trainings,
  type AllocationSnapshot,
} from '@/db/schema';
import { WORKSHOP_TYPE_LABELS, orderDisplayNumber } from '@/domain/statuses';
import {
  CAP_OPTIONS_LABELS,
  ORDER_STATUS_LABELS,
  ROUND_STATUS_LABELS,
  VISIBILITY_MODE_LABELS,
} from '@/domain/round-statuses';
import { frameworkIdentity } from '../framework';
import {
  PROTOCOL_SCHEMA_VERSION,
  canonicalJson,
  type ProtocolAdjustment,
  type ProtocolAllocationRow,
  type ProtocolAuditRow,
  type ProtocolBid,
  type ProtocolDeadlineChange,
  type ProtocolKind,
  type ProtocolNotice,
  type ProtocolOrder,
  type ProtocolParticipant,
  type ProtocolTraceRow,
  type ProtocolTraining,
  type RoundProtocolData,
} from '@/domain/round-protocol';
import { logAudit } from '../audit';
import type { Ctx, Db, Tx } from '../context';
import { allConfirmations, participantsOf } from './views';

type Reader = Tx | Db;

/**
 * The protocol's identity: the SHA-256 of its canonical JSON.
 *
 * Synchronous on purpose — it runs inside the write transaction, and
 * better-sqlite3 transactions cannot span an await.
 */
export function protocolHash(data: RoundProtocolData): { json: string; hash: string } {
  const json = canonicalJson(data);
  return { json, hash: createHash('sha256').update(json, 'utf8').digest('hex') };
}

/** Recompute the hash of a stored text, to check it has not been edited. */
export function hashOf(json: string): string {
  return createHash('sha256').update(json, 'utf8').digest('hex');
}

/* ------------------------------------------------------------------ *
 * the deadline's history, read out of the trail [E-06]
 * ------------------------------------------------------------------ */

/**
 * What the deadline was at publication and every time it moved.
 *
 * Deliberately not recomputed from the lot: `deadlineLocalTime` and the
 * working-day count are today's configuration, and the round may have been
 * published under different ones. The audit rows are the only record of the
 * instants that actually applied.
 */
function deadlineHistory(
  tx: Reader,
  roundId: string,
): { originalDeadlineAt: number | null; changes: ProtocolDeadlineChange[] } {
  const rows = tx
    .select({
      id: auditEvents.id,
      occurredAt: auditEvents.occurredAt,
      eventType: auditEvents.eventType,
      actorLabel: auditEvents.actorLabel,
      before: auditEvents.before,
      after: auditEvents.after,
    })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.roundId, roundId),
        inArray(auditEvents.eventType, ['round.published', 'round.deadline_extended']),
      ),
    )
    .orderBy(auditEvents.id)
    .all();

  let originalDeadlineAt: number | null = null;
  const changes: ProtocolDeadlineChange[] = [];

  for (const row of rows) {
    const after = (row.after ?? {}) as { deadlineAt?: number; reason?: string };
    const before = (row.before ?? {}) as { deadlineAt?: number | null };
    if (row.eventType === 'round.published') {
      originalDeadlineAt = typeof after.deadlineAt === 'number' ? after.deadlineAt : null;
      continue;
    }
    if (typeof after.deadlineAt !== 'number') continue;
    changes.push({
      at: after.deadlineAt,
      from: typeof before.deadlineAt === 'number' ? before.deadlineAt : null,
      reason: after.reason ?? '',
      by: row.actorLabel,
      occurredAt: row.occurredAt,
    });
  }

  return { originalDeadlineAt, changes };
}

/* ------------------------------------------------------------------ *
 * the builder
 * ------------------------------------------------------------------ */

/**
 * Collect everything the protocol asserts about one round.
 *
 * Readable outside a transaction too, which is what lets the page show the
 * counts and a test compare two builds byte for byte.
 */
export function buildRoundProtocol(
  tx: Reader,
  roundId: string,
  input: { kind: ProtocolKind; at: number; by: string },
): RoundProtocolData {
  const round = tx.select().from(rounds).where(eq(rounds.id, roundId)).get();
  if (!round) throw new Error('Voorust ei leitud.');
  const lot = tx.select().from(lots).where(eq(lots.id, round.lotId)).get();
  if (!lot) throw new Error('Hankeosa ei leitud.');

  const origin = round.originRoundId
    ? tx.select({ code: rounds.code }).from(rounds).where(eq(rounds.id, round.originRoundId)).get()
    : undefined;

  /* --- trainings, withdrawn ones included [V-04] --- */
  const trainingRows = tx
    .select({
      id: trainings.id,
      code: trainings.code,
      title: trainings.title,
      workshopType: trainings.workshopType,
      eventDate: trainings.eventDate,
      eventEnd: trainings.eventEnd,
      county: trainings.county,
      locationText: trainings.locationText,
      participantCount: trainings.participantCount,
      language: trainings.language,
      withdrawnAt: roundTrainings.withdrawnAt,
      withdrawnReason: roundTrainings.withdrawnReason,
      withdrawnBy: roundTrainings.withdrawnBy,
    })
    .from(roundTrainings)
    .innerJoin(trainings, eq(trainings.id, roundTrainings.trainingId))
    .where(eq(roundTrainings.roundId, roundId))
    .all()
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate) || a.code.localeCompare(b.code));

  const codeById = new Map(trainingRows.map((row) => [row.id, row.code] as const));
  const protocolTrainings: ProtocolTraining[] = trainingRows.map((row) => ({
    code: row.code,
    title: row.title,
    workshopType: WORKSHOP_TYPE_LABELS[row.workshopType],
    eventDate: row.eventDate,
    eventEnd: row.eventEnd,
    county: row.county,
    locationText: row.locationText,
    participantCount: row.participantCount,
    language: row.language,
    withdrawnAt: row.withdrawnAt,
    withdrawnReason: row.withdrawnReason,
    withdrawnBy: row.withdrawnBy ?? '',
  }));

  /* --- participants in frozen rank order [V-07] --- */
  const membershipRows = tx
    .select({
      lotPartnerId: lotPartners.id,
      unitPriceEur: lotPartners.unitPriceEur,
      partnerName: partners.name,
      partnerRegCode: partners.regCode,
    })
    .from(roundParticipants)
    .innerJoin(lotPartners, eq(lotPartners.id, roundParticipants.lotPartnerId))
    .innerJoin(partners, eq(partners.id, lotPartners.partnerId))
    .where(eq(roundParticipants.roundId, roundId))
    .all();
  const membershipById = new Map(membershipRows.map((row) => [row.lotPartnerId, row] as const));

  const participantRows = participantsOf(tx, roundId);
  const nameOf = (lotPartnerId: string): string =>
    membershipById.get(lotPartnerId)?.partnerName ??
    participantRows.find((p) => p.lotPartnerId === lotPartnerId)?.partnerName ??
    '';
  const rankOf = (lotPartnerId: string): number =>
    participantRows.find((p) => p.lotPartnerId === lotPartnerId)?.rankAtPublication ?? 0;

  const protocolParticipants: ProtocolParticipant[] = participantRows.map((row) => ({
    lotPartnerId: row.lotPartnerId,
    rank: row.rankAtPublication,
    partnerName: row.partnerName,
    partnerRegCode: membershipById.get(row.lotPartnerId)?.partnerRegCode ?? '',
    contactName: row.contactName,
    contactEmail: row.contactEmail,
    unitPriceEur: membershipById.get(row.lotPartnerId)?.unitPriceEur ?? 0,
    excludedAt: row.excludedAt,
    excludedReason: row.excludedReason,
    outcomeAtClose: row.outcomeAtClose,
  }));

  /* --- the allocation, exactly as it was stored [V-06][T-04] --- */
  const proposal: AllocationSnapshot | null = round.proposalSnapshot ?? null;
  const final: AllocationSnapshot | null = round.finalSnapshot ?? null;

  const bindingIds = new Set(
    (final?.result.trace ?? [])
      .map((step) => step.usedConfirmationId)
      .filter((id): id is number => typeof id === 'number'),
  );

  /* --- bids: every confirmation row, in arrival order [K-09] --- */
  const bids: ProtocolBid[] = allConfirmations(tx, roundId).map((row, index) => ({
    seq: index + 1,
    confirmationId: row.id,
    lotPartnerId: row.lotPartnerId,
    partnerName: nameOf(row.lotPartnerId),
    rank: rankOf(row.lotPartnerId),
    kind: row.kind,
    marks: row.marks.map((id) => codeById.get(id) ?? id),
    cap: row.cap,
    capKind: row.capKind,
    confirmedAt: row.confirmedAt,
    actorLabel: row.actorLabel,
    contactEmail: row.contactEmail,
    ip: row.ip,
    ua: row.ua,
    binding: bindingIds.has(row.id),
  }));

  /* --- adjustments: the whole append-only history, latest per partner marked --- */
  const adjustmentRows = tx
    .select()
    .from(buyerAdjustments)
    .where(eq(buyerAdjustments.roundId, roundId))
    .orderBy(buyerAdjustments.createdAt, buyerAdjustments.id)
    .all();
  const lastPerPartner = new Map<string, number>();
  for (const row of adjustmentRows) lastPerPartner.set(row.lotPartnerId, row.id);
  const adjustments: ProtocolAdjustment[] = adjustmentRows.map((row) => ({
    lotPartnerId: row.lotPartnerId,
    partnerName: nameOf(row.lotPartnerId),
    kind: row.kind,
    capValue: row.capValue,
    justification: row.justification,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    effective: lastPerPartner.get(row.lotPartnerId) === row.id && row.kind !== 'clear',
  }));

  /* --- proposal beside final, per training [T-03] --- */
  const byTraining: ProtocolAllocationRow[] = trainingRows
    .filter((row) => row.withdrawnAt === null)
    .map((row) => {
      const proposedId = proposal?.result.byTraining[row.id];
      const finalId = final?.result.byTraining[row.id];
      const proposed = proposedId ? nameOf(proposedId) : null;
      const finalName = finalId ? nameOf(finalId) : null;
      return {
        trainingCode: row.code,
        proposed,
        final: finalName,
        changed: (proposedId ?? null) !== (finalId ?? null),
      };
    });

  const trace: ProtocolTraceRow[] = (final?.result.trace ?? proposal?.result.trace ?? []).map(
    (step) => ({
      rank: step.rank,
      partnerName: nameOf(step.lotPartnerId),
      outcome: step.outcome,
      wanted: step.wanted.map((id) => codeById.get(id) ?? id),
      taken: step.taken.map((id) => codeById.get(id) ?? id),
      limit: step.limit,
      capKind: step.capKind,
      participantLimit: step.participantLimit,
      participantsTaken: step.participantsTaken,
      usedConfirmationId: step.usedConfirmationId,
    }),
  );

  const leftover = (final?.result.leftover ?? [])
    .map((id) => codeById.get(id) ?? id)
    .sort((a, b) => a.localeCompare(b));

  /* --- orders, from their frozen documents [T-05] --- */
  const orderRows = tx
    .select()
    .from(orders)
    .where(eq(orders.roundId, roundId))
    .orderBy(orders.orderYear, orders.orderSeq)
    .all();
  const orderTrainingRows = orderRows.length
    ? tx
        .select({
          orderId: orderTrainings.orderId,
          trainingId: orderTrainings.trainingId,
        })
        .from(orderTrainings)
        .where(
          inArray(
            orderTrainings.orderId,
            orderRows.map((row) => row.id),
          ),
        )
        .all()
    : [];
  const protocolOrders: ProtocolOrder[] = orderRows.map((row) => {
    const doc = row.documentSnapshot;
    // Prefer the frozen document's own list; the join is the fallback for a
    // snapshot written before a field existed.
    const codes = doc.trainings.length
      ? doc.trainings.map((t) => t.code)
      : orderTrainingRows
          .filter((link) => link.orderId === row.id)
          .map((link) => codeById.get(link.trainingId) ?? link.trainingId);
    return {
      number: orderDisplayNumber(row.orderYear, row.orderSeq),
      partnerName: doc.partnerName,
      partnerRegCode: doc.partnerRegCode,
      trainingCodes: [...codes].sort((a, b) => a.localeCompare(b)),
      totalEur: doc.totalEur,
      unitPriceEur: doc.trainings[0]?.unitPriceEur ?? 0,
      partnerConfirmedAt: row.partnerConfirmedAt,
      buyerConfirmedAt: row.buyerConfirmedAt,
      buyerConfirmedBy: row.buyerConfirmedBy,
      // Written as the label, not the enum: the protocol is read by people
      // outside this system, so `active` would be an untranslated leak.
      status: ORDER_STATUS_LABELS[row.status],
    };
  });

  /* --- what each participant was told [D-01..D-07]. Delivery status stays in
         the log: the mail goes out after this transaction commits. --- */
  const notices: ProtocolNotice[] = tx
    .select({
      createdAt: notifications.createdAt,
      type: notifications.type,
      recipientKind: notifications.recipientKind,
      recipientLotPartnerId: notifications.recipientLotPartnerId,
      title: notifications.title,
      id: notifications.id,
    })
    .from(notifications)
    .where(eq(notifications.roundId, roundId))
    .all()
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    .map((row) => ({
      createdAt: row.createdAt,
      type: row.type,
      recipientKind: row.recipientKind,
      recipientName: row.recipientLotPartnerId ? nameOf(row.recipientLotPartnerId) : 'Tellija',
      title: row.title,
    }));

  const audit: ProtocolAuditRow[] = tx
    .select({
      id: auditEvents.id,
      occurredAt: auditEvents.occurredAt,
      eventType: auditEvents.eventType,
      actorLabel: auditEvents.actorLabel,
      viaLabel: auditEvents.viaLabel,
      summary: auditEvents.summary,
    })
    .from(auditEvents)
    .where(eq(auditEvents.roundId, roundId))
    .orderBy(auditEvents.id)
    .all();

  const publishedRow = audit.find((row) => row.eventType === 'round.published');
  const { originalDeadlineAt, changes } = deadlineHistory(tx, roundId);

  return {
    schemaVersion: PROTOCOL_SCHEMA_VERSION,
    kind: input.kind,
    generatedAt: input.at,
    generatedBy: input.by,
    framework: frameworkIdentity(tx),
    lot: { code: lot.code, name: lot.name, description: lot.description },
    round: {
      code: round.code,
      status: ROUND_STATUS_LABELS[round.status],
      originRoundCode: origin?.code ?? null,
      createdAt: round.createdAt,
      createdBy: round.createdBy,
    },
    conditions: {
      visibilityMode: VISIBILITY_MODE_LABELS[round.visibilityMode],
      capOptions: CAP_OPTIONS_LABELS[round.capOptions],
      workloadThreshold: round.workloadThresholdSnapshot,
      responseWorkingDays: round.responseWorkingDaysSnapshot,
      note: round.note,
      plannedPublishAt: round.plannedPublishAt,
      plannedDeadlineAt: round.plannedDeadlineAt,
      publishedAt: round.publishedAt,
      publishedBy: publishedRow?.actorLabel ?? '',
      originalDeadlineAt,
      deadlineChanges: changes,
      deadlineAt: round.deadlineAt,
      expectedDecisionAt: round.expectedDecisionAt,
      // [J-05] the cut the allocation actually used, from the snapshot itself.
      cutAt: final?.input.cutAt ?? proposal?.input.cutAt ?? null,
      closedAt: round.closedAt,
      confirmedAt: round.confirmedAt,
      confirmedBy: round.confirmedBy ?? '',
      cancelledAt: round.cancelledAt,
      cancelReason: round.cancelReason,
    },
    trainings: protocolTrainings,
    participants: protocolParticipants,
    bids,
    adjustments,
    allocation: { proposal, final, byTraining, trace, leftover },
    orders: protocolOrders,
    notices,
    audit,
  };
}

/* ------------------------------------------------------------------ *
 * storing
 * ------------------------------------------------------------------ */

/**
 * Write the protocol of a round that has just ended.
 *
 * Called from inside `confirmAllocation` and `cancelRound`, so the row commits
 * with the ending itself. Returns null when a protocol already exists: the
 * ending is idempotent and so is this.
 */
export function storeRoundProtocol(
  ctx: Ctx,
  roundId: string,
  kind: ProtocolKind,
): { hash: string; id: string } | null {
  const existing = ctx.tx
    .select({ id: roundProtocols.id, contentHash: roundProtocols.contentHash })
    .from(roundProtocols)
    .where(eq(roundProtocols.roundId, roundId))
    .get();
  if (existing) return null;

  const data = buildRoundProtocol(ctx.tx, roundId, {
    kind,
    at: ctx.at,
    by: ctx.actor.label,
  });
  const { json, hash } = protocolHash(data);
  const id = crypto.randomUUID();

  ctx.tx
    .insert(roundProtocols)
    .values({
      id,
      roundId,
      kind,
      version: PROTOCOL_SCHEMA_VERSION,
      contentJson: json,
      contentHash: hash,
      algorithmVersion: data.allocation.final?.algorithmVersion ?? null,
      generatedAt: ctx.at,
      generatedBy: ctx.actor.label,
    })
    .run();

  // The hash in the trail is what makes a later edit of the row detectable.
  logAudit(ctx, {
    eventType: 'protocol.generated',
    summary: `Vooru ${data.round.code} protokoll koostatud (SHA-256 ${hash.slice(0, 16)})`,
    roundId,
    after: {
      kind,
      contentHash: hash,
      schemaVersion: PROTOCOL_SCHEMA_VERSION,
      bidCount: data.bids.length,
      orderCount: data.orders.length,
      leftoverCount: data.allocation.leftover.length,
    },
  });

  return { hash, id };
}

export interface StoredProtocol {
  id: string;
  roundId: string;
  kind: ProtocolKind;
  version: number;
  contentHash: string;
  generatedAt: number;
  generatedBy: string;
  data: RoundProtocolData;
  /** false when the stored text no longer hashes to the stored hash */
  intact: boolean;
}

/** Read a stored protocol back, checking that the text still matches its hash. */
export function getRoundProtocol(tx: Reader, roundId: string): StoredProtocol | null {
  const row = tx
    .select()
    .from(roundProtocols)
    .where(eq(roundProtocols.roundId, roundId))
    .get();
  if (!row) return null;
  return {
    id: row.id,
    roundId: row.roundId,
    kind: row.kind,
    version: row.version,
    contentHash: row.contentHash,
    generatedAt: row.generatedAt,
    generatedBy: row.generatedBy,
    data: JSON.parse(row.contentJson) as RoundProtocolData,
    intact: hashOf(row.contentJson) === row.contentHash,
  };
}

/**
 * Generate a protocol for a round that ended before protocols existed.
 *
 * The same builder over the same stored facts, so a v2.2 round yields a
 * protocol of exactly the shape a new one does — only `generatedAt` says it was
 * written later. Refuses a round that is not finished, and one that already has
 * a protocol, so this can never overwrite a signed document.
 */
export function generateProtocolForEndedRound(
  ctx: Ctx,
  roundId: string,
): { hash: string; id: string } {
  const round = ctx.tx.select().from(rounds).where(eq(rounds.id, roundId)).get();
  if (!round) throw new Error('Voorust ei leitud.');

  const kind: ProtocolKind | null =
    round.status === 'confirmed'
      ? 'confirmed'
      : round.status === 'cancelled' && round.publishedAt !== null
        ? 'cancelled'
        : null;
  if (!kind) {
    throw new Error(
      'Protokolli saab koostada ainult kinnitatud voorust või avaldatud voorust, mis tühistati.',
    );
  }

  const written = storeRoundProtocol(ctx, roundId, kind);
  if (!written) throw new Error('Sellel vooril on protokoll juba olemas.');
  return written;
}
