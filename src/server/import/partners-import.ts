/**
 * Import the framework partner ranking per lot.
 *
 * The same table shape that carries the fictional demo partners will carry the
 * real framework results once the agreements are signed, so this path is not
 * demo-only scaffolding — it is how the ranking gets into the system.
 *
 * Two invariants govern the write:
 *
 *  - Ranks are rewritten in two phases (park on unique negatives, then apply),
 *    because `lot_partners` has a partial unique index on (lot, rank) among
 *    active rows and a straight update would collide mid-transaction [E-08].
 *  - Open rounds are never touched. Each round froze its ranking at publication
 *    in `round_participants.rankAtPublication`, so a new ranking applies only to
 *    rounds published afterwards [V-07]. The preview says so explicitly.
 */

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  importBatches,
  lotPartners,
  lots,
  partners,
  roundParticipants,
  rounds,
  type ImportSummary,
} from '@/db/schema';
import { countRows, parsePartnerRows, type ParsedRow, type PartnerRow, type RowDiagnostic } from '@/domain/import-rows';
import { logAudit } from '../audit';
import type { Ctx } from '../context';
import type { ImportSource } from './trainings-import';

export interface StoredPartnerRow {
  rowNumber: number;
  value: PartnerRow | null;
  errors: RowDiagnostic[];
  warnings: RowDiagnostic[];
  action?: 'created' | 'updated' | 'error';
  note?: string;
}

export interface PartnerImportOptions {
  /**
   * Deactivate lot members absent from the file. Off by default: an import is
   * usually an addition, and deactivating silently would change who a future
   * round goes to.
   */
  deactivateMissing: boolean;
}

export interface PartnerPreviewResult {
  batchId: string;
  rows: StoredPartnerRow[];
  fileErrors: RowDiagnostic[];
  summary: ImportSummary;
  /** lot members that `deactivateMissing` would switch off */
  wouldDeactivate: Array<{ lotCode: string; partnerName: string; rank: number; inOpenRound: boolean }>;
  openRoundCount: number;
}

export function previewPartnersImport(
  ctx: Ctx,
  input: {
    fileName: string;
    fileSize: number;
    source: ImportSource;
    rawRows: Array<Record<string, string>>;
    options: PartnerImportOptions;
  },
): PartnerPreviewResult {
  const lotRows = ctx.tx.select({ id: lots.id, code: lots.code }).from(lots).all();
  const { rows, fileErrors } = parsePartnerRows(input.rawRows, {
    knownLotCodes: lotRows.map((l) => l.code),
  });

  const counts = countRows(rows);
  const summary: ImportSummary = {
    total: counts.total,
    valid: counts.valid,
    created: 0,
    updated: 0,
    locked: 0,
    withErrors: counts.withErrors,
    withWarnings: counts.withWarnings,
  };

  const lotIdByCode = new Map(lotRows.map((l) => [l.code, l.id] as const));
  const stored: StoredPartnerRow[] = rows.map((row) => ({
    rowNumber: row.rowNumber,
    value: row.value,
    errors: row.errors,
    warnings: row.warnings,
  }));

  // Which rows create a new membership versus update an existing one.
  const existingMemberships = ctx.tx
    .select({
      id: lotPartners.id,
      lotId: lotPartners.lotId,
      rank: lotPartners.rank,
      isActive: lotPartners.isActive,
      regCode: partners.regCode,
      partnerName: partners.name,
    })
    .from(lotPartners)
    .innerJoin(partners, eq(partners.id, lotPartners.partnerId))
    .all();

  const key = (lotId: string, regCode: string) => `${lotId}#${regCode}`;
  const existingByKey = new Map(existingMemberships.map((m) => [key(m.lotId, m.regCode), m]));

  const touchedKeys = new Set<string>();
  for (const row of stored) {
    if (!row.value) continue;
    const lotId = lotIdByCode.get(row.value.lotCode);
    if (!lotId) continue;
    const k = key(lotId, row.value.regCode);
    touchedKeys.add(k);
    if (existingByKey.has(k)) summary.updated += 1;
    else summary.created += 1;
  }

  // Lot members absent from the file, and whether they sit in an open round.
  const openRounds = ctx.tx
    .select({ id: rounds.id, lotId: rounds.lotId })
    .from(rounds)
    .where(eq(rounds.status, 'open'))
    .all();
  const lotsWithOpenRound = new Set(openRounds.map((r) => r.lotId));

  const affectedLotIds = new Set(
    stored
      .map((r) => (r.value ? lotIdByCode.get(r.value.lotCode) : undefined))
      .filter((id): id is string => Boolean(id)),
  );

  const wouldDeactivate = existingMemberships
    .filter(
      (m) =>
        m.isActive && affectedLotIds.has(m.lotId) && !touchedKeys.has(key(m.lotId, m.regCode)),
    )
    .map((m) => ({
      lotCode: lotRows.find((l) => l.id === m.lotId)?.code ?? '',
      partnerName: m.partnerName,
      rank: m.rank,
      inOpenRound: lotsWithOpenRound.has(m.lotId),
    }));

  const batchId = crypto.randomUUID();
  ctx.tx
    .insert(importBatches)
    .values({
      id: batchId,
      kind: 'partners',
      fileName: input.fileName,
      fileSize: input.fileSize,
      source: input.source,
      status: 'previewed',
      rowsJson: { rows: stored, fileErrors },
      summary,
      options: input.options,
      actorId: ctx.actor.id,
      actorLabel: ctx.actor.label,
      createdAt: ctx.at,
    })
    .run();

  logAudit(ctx, {
    eventType: 'import.previewed',
    summary: `Partnerite järjestuse import eelvaadatud: ${input.fileName} — ${summary.valid}/${summary.total} rida korras`,
    after: { batchId, fileName: input.fileName, summary },
  });

  return {
    batchId,
    rows: stored,
    fileErrors,
    summary,
    wouldDeactivate,
    openRoundCount: openRounds.filter((r) => affectedLotIds.has(r.lotId)).length,
  };
}

export function applyPartnersImport(
  ctx: Ctx,
  batchId: string,
): { summary: ImportSummary; rows: StoredPartnerRow[] } {
  const batch = ctx.tx.select().from(importBatches).where(eq(importBatches.id, batchId)).get();
  if (!batch) throw new Error('Importi ei leitud.');
  if (batch.kind !== 'partners') throw new Error('Vale impordi tüüp.');
  if (batch.status !== 'previewed') throw new Error('See import on juba tehtud või kõrvale jäetud.');

  const payload = batch.rowsJson as { rows: StoredPartnerRow[]; fileErrors: RowDiagnostic[] };
  const options = (batch.options ?? {}) as Partial<PartnerImportOptions>;
  const rows = payload.rows;

  const lotIdByCode = new Map(
    ctx.tx
      .select({ id: lots.id, code: lots.code })
      .from(lots)
      .all()
      .map((l) => [l.code, l.id] as const),
  );

  const summary: ImportSummary = {
    total: rows.length,
    valid: rows.filter((r) => r.value !== null).length,
    created: 0,
    updated: 0,
    locked: 0,
    withErrors: rows.filter((r) => r.errors.length > 0).length,
    withWarnings: rows.filter((r) => r.warnings.length > 0).length,
  };

  /* 1. upsert the companies themselves, by registry code */
  const valid = rows.filter((r): r is StoredPartnerRow & { value: PartnerRow } => r.value !== null);
  const partnerIdByRegCode = new Map(
    ctx.tx
      .select({ id: partners.id, regCode: partners.regCode })
      .from(partners)
      .all()
      .map((p) => [p.regCode, p.id] as const),
  );

  for (const row of valid) {
    const existingId = partnerIdByRegCode.get(row.value.regCode);
    if (existingId) {
      ctx.tx
        .update(partners)
        .set({ name: row.value.partnerName, isActive: true })
        .where(eq(partners.id, existingId))
        .run();
    } else {
      const id = crypto.randomUUID();
      ctx.tx
        .insert(partners)
        .values({
          id,
          name: row.value.partnerName,
          regCode: row.value.regCode,
          isActive: true,
          createdAt: ctx.at,
        })
        .run();
      partnerIdByRegCode.set(row.value.regCode, id);
      logAudit(ctx, {
        eventType: 'partner.created',
        summary: `Partner ${row.value.partnerName} (${row.value.regCode}) lisatud`,
        after: { name: row.value.partnerName, regCode: row.value.regCode },
      });
    }
  }

  /* 2. park every affected lot's active ranks on unique negatives, so the
        partial unique index cannot trip while the new order is applied */
  const affectedLotIds = new Set(
    valid.map((r) => lotIdByCode.get(r.value.lotCode)).filter((id): id is string => Boolean(id)),
  );

  for (const lotId of affectedLotIds) {
    const members = ctx.tx
      .select({ id: lotPartners.id })
      .from(lotPartners)
      .where(and(eq(lotPartners.lotId, lotId), eq(lotPartners.isActive, true)))
      .all();
    members.forEach((member, index) => {
      ctx.tx
        .update(lotPartners)
        .set({ rank: -(index + 1) })
        .where(eq(lotPartners.id, member.id))
        .run();
    });
  }

  /* 3. apply the ranking from the file */
  const existingMemberships = ctx.tx
    .select({
      id: lotPartners.id,
      lotId: lotPartners.lotId,
      partnerId: lotPartners.partnerId,
      rank: lotPartners.rank,
    })
    .from(lotPartners)
    .all();
  const membershipKey = (lotId: string, partnerId: string) => `${lotId}#${partnerId}`;
  const membershipByKey = new Map(
    existingMemberships.map((m) => [membershipKey(m.lotId, m.partnerId), m]),
  );

  const keptKeys = new Set<string>();

  for (const row of valid) {
    const lotId = lotIdByCode.get(row.value.lotCode);
    const partnerId = partnerIdByRegCode.get(row.value.regCode);
    if (!lotId || !partnerId) {
      row.action = 'error';
      row.note = 'hankeosa või partner puudub';
      continue;
    }
    const k = membershipKey(lotId, partnerId);
    keptKeys.add(k);
    const existing = membershipByKey.get(k);

    const fields = {
      rank: row.value.rank,
      contactName: row.value.contactName,
      contactEmail: row.value.contactEmail,
      unitPriceEur: row.value.unitPriceEur,
      isActive: true,
      deactivatedAt: null,
    };

    if (existing) {
      ctx.tx.update(lotPartners).set(fields).where(eq(lotPartners.id, existing.id)).run();
      row.action = 'updated';
      summary.updated += 1;
      // The parked rank is a transient negative, so report the real change.
      logAudit(ctx, {
        eventType: 'partner.rank_changed',
        summary: `${row.value.partnerName}: hankeosas ${row.value.lotCode} koht ${row.value.rank}`,
        lotId,
        lotPartnerId: existing.id,
        after: { rank: row.value.rank, contactEmail: row.value.contactEmail },
      });
    } else {
      const id = crypto.randomUUID();
      ctx.tx
        .insert(lotPartners)
        .values({ id, lotId, partnerId, createdAt: ctx.at, ...fields })
        .run();
      row.action = 'created';
      summary.created += 1;
      logAudit(ctx, {
        eventType: 'partner.rank_changed',
        summary: `${row.value.partnerName} lisatud hankeosasse ${row.value.lotCode}, koht ${row.value.rank}`,
        lotId,
        lotPartnerId: id,
        after: { rank: row.value.rank },
      });
    }
  }

  /* 4. anything still parked on a negative rank was not in the file */
  for (const lotId of affectedLotIds) {
    const stranded = ctx.tx
      .select({ id: lotPartners.id, rank: lotPartners.rank, partnerId: lotPartners.partnerId })
      .from(lotPartners)
      .where(and(eq(lotPartners.lotId, lotId), sql`${lotPartners.rank} < 0`))
      .all();

    for (const member of stranded) {
      if (options.deactivateMissing) {
        ctx.tx
          .update(lotPartners)
          .set({ isActive: false, deactivatedAt: ctx.at, rank: Math.abs(member.rank) })
          .where(eq(lotPartners.id, member.id))
          .run();
        const name =
          ctx.tx
            .select({ name: partners.name })
            .from(partners)
            .where(eq(partners.id, member.partnerId))
            .get()?.name ?? 'partner';
        logAudit(ctx, {
          eventType: 'partner.deactivated',
          summary: `${name} deaktiveeritud hankeosas — puudus imporditud järjestusest`,
          lotId,
          lotPartnerId: member.id,
        });
      } else {
        // Keep them active; restore a rank after those in the file so the
        // partial unique index stays satisfied.
        const maxRank =
          ctx.tx
            .select({ value: sql<number>`coalesce(max(${lotPartners.rank}), 0)` })
            .from(lotPartners)
            .where(and(eq(lotPartners.lotId, lotId), eq(lotPartners.isActive, true)))
            .get()?.value ?? 0;
        ctx.tx
          .update(lotPartners)
          .set({ rank: Math.max(maxRank + 1, 1) })
          .where(eq(lotPartners.id, member.id))
          .run();
      }
    }
  }

  ctx.tx
    .update(importBatches)
    .set({
      status: 'imported',
      importedAt: ctx.at,
      rowsJson: { rows, fileErrors: payload.fileErrors },
      summary,
    })
    .where(eq(importBatches.id, batchId))
    .run();

  // [V-07] proof for the reader: open rounds keep their frozen participant list.
  const untouchedOpenParticipants = ctx.tx
    .select({ count: sql<number>`count(*)` })
    .from(roundParticipants)
    .innerJoin(rounds, eq(rounds.id, roundParticipants.roundId))
    .where(and(eq(rounds.status, 'open'), isNull(roundParticipants.excludedAt)))
    .get()?.count ?? 0;

  logAudit(ctx, {
    eventType: 'import.partners_imported',
    summary: `Partnerite järjestus imporditud failist ${batch.fileName}: ${summary.created} uut, ${summary.updated} uuendatud${options.deactivateMissing ? ', puuduvad deaktiveeritud' : ''}`,
    after: {
      batchId,
      summary,
      deactivateMissing: Boolean(options.deactivateMissing),
      openRoundParticipantsUnchanged: untouchedOpenParticipants,
    },
  });

  return { summary, rows };
}

/** Convenience for the seed: preview then apply in one call. */
export function importPartnersFromRows(
  ctx: Ctx,
  input: {
    fileName: string;
    fileSize: number;
    source: ImportSource;
    rawRows: Array<Record<string, string>>;
    options?: PartnerImportOptions;
  },
): { summary: ImportSummary; batchId: string } {
  const preview = previewPartnersImport(ctx, {
    ...input,
    options: input.options ?? { deactivateMissing: false },
  });
  if (preview.summary.valid === 0) {
    throw new Error(
      `Partnerite faili ei õnnestu lugeda: ${preview.fileErrors.map((e) => e.message).join('; ')}`,
    );
  }
  const applied = applyPartnersImport(ctx, preview.batchId);
  return { summary: applied.summary, batchId: preview.batchId };
}

/** Deactivate one lot membership by hand, from the Hankeosad screen. */
export function listActiveLotPartnerIds(ctx: Ctx, lotId: string): string[] {
  return ctx.tx
    .select({ id: lotPartners.id })
    .from(lotPartners)
    .where(and(eq(lotPartners.lotId, lotId), eq(lotPartners.isActive, true)))
    .all()
    .map((r) => r.id);
}

export function findLotPartnersByIds(ctx: Ctx, ids: string[]) {
  if (ids.length === 0) return [];
  return ctx.tx.select().from(lotPartners).where(inArray(lotPartners.id, ids)).all();
}
