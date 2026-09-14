/**
 * Import the framework partner ranking per lot.
 *
 * The same table shape that carries the sample partners carries the real
 * framework results once the agreements are signed, so this path is not demo
 * scaffolding — it is how the ranking gets into the system. Since v2.3 it is
 * also one sheet of the framework workbook [L-21], which is why the writing
 * half is exported on its own: both importers must rank identically.
 *
 * Three invariants govern the write:
 *
 *  - Ranks are rewritten in two phases (park on unique negatives, then apply),
 *    because `lot_partners` has a partial unique index on (lot, rank) among
 *    active rows and a straight update would collide mid-transaction [E-08].
 *  - Open rounds are never touched. Each round froze its ranking at publication
 *    in `round_participants.rankAtPublication`, so a new ranking applies only to
 *    rounds published afterwards [V-07]. The preview says so explicitly.
 *  - The official contact becomes the partner's sign-in, so the ranking write
 *    ends by syncing the representatives [L-21]. A contact that cannot be a
 *    login is refused at preview time, not silently dropped later.
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
import { countRows, parsePartnerRows, type PartnerRow, type RowDiagnostic } from '@/domain/import-rows';
import { logAudit } from '../audit';
import type { Ctx } from '../context';
import { representativeCollision, syncFrameworkContacts } from '../framework';
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

/** What the preview can say about a set of ranking rows before anything is written. */
export interface PartnerPreviewAnnotation {
  created: number;
  updated: number;
  /** lot members that `deactivateMissing` would switch off */
  wouldDeactivate: Array<{ lotCode: string; partnerName: string; rank: number; inOpenRound: boolean }>;
  openRoundCount: number;
}

export interface PartnerPreviewResult extends PartnerPreviewAnnotation {
  batchId: string;
  rows: StoredPartnerRow[];
  fileErrors: RowDiagnostic[];
  summary: ImportSummary;
}

/** The payload a previewed ranking batch stores, so the page can render it. */
export interface PartnerBatchPayload {
  rows: StoredPartnerRow[];
  fileErrors: RowDiagnostic[];
  wouldDeactivate?: PartnerPreviewAnnotation['wouldDeactivate'];
  openRoundCount?: number;
}

/**
 * Which rows create and which update, and who would be switched off.
 *
 * `newLotCodes` are lots that do not exist yet because the same workbook
 * creates them — their memberships are all new, and they can have nobody to
 * deactivate.
 */
export function annotatePartnerPreview(
  ctx: Ctx,
  stored: readonly StoredPartnerRow[],
  newLotCodes: ReadonlySet<string> = new Set(),
): PartnerPreviewAnnotation {
  const lotRows = ctx.tx.select({ id: lots.id, code: lots.code }).from(lots).all();
  const lotIdByCode = new Map(lotRows.map((l) => [l.code, l.id] as const));

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

  let created = 0;
  let updated = 0;
  const touchedKeys = new Set<string>();
  const affectedLotIds = new Set<string>();

  for (const row of stored) {
    if (!row.value) continue;
    const lotId = lotIdByCode.get(row.value.lotCode);
    if (!lotId) {
      // A lot this same file creates: everything in it is new.
      if (newLotCodes.has(row.value.lotCode)) created += 1;
      continue;
    }
    affectedLotIds.add(lotId);
    const k = key(lotId, row.value.regCode);
    touchedKeys.add(k);
    if (existingByKey.has(k)) updated += 1;
    else created += 1;
  }

  const openRounds = ctx.tx
    .select({ id: rounds.id, lotId: rounds.lotId })
    .from(rounds)
    .where(eq(rounds.status, 'open'))
    .all();
  const lotsWithOpenRound = new Set(openRounds.map((r) => r.lotId));

  const wouldDeactivate = existingMemberships
    .filter((m) => m.isActive && affectedLotIds.has(m.lotId) && !touchedKeys.has(key(m.lotId, m.regCode)))
    .map((m) => ({
      lotCode: lotRows.find((l) => l.id === m.lotId)?.code ?? '',
      partnerName: m.partnerName,
      rank: m.rank,
      inOpenRound: lotsWithOpenRound.has(m.lotId),
    }));

  return {
    created,
    updated,
    wouldDeactivate,
    openRoundCount: openRounds.filter((r) => affectedLotIds.has(r.lotId)).length,
  };
}

/**
 * Refuse a contact address that cannot become the partner's sign-in.
 *
 * The official contact *is* the login [L-21], so an address that belongs to a
 * buyer user, or that already represents another company, cannot be the
 * contact either — the formal notices would go somewhere nobody can answer
 * from. Two rows in the same file claiming one address are refused too.
 */
export function checkPartnerContacts(ctx: Ctx, stored: readonly StoredPartnerRow[]): void {
  const seenInFile = new Map<string, string>();

  for (const row of stored) {
    if (!row.value) continue;
    const email = row.value.contactEmail.trim().toLowerCase();
    const regCode = row.value.regCode;

    const claimedBy = seenInFile.get(email);
    if (claimedBy && claimedBy !== regCode) {
      row.errors.push({
        field: 'e_post',
        message: `sama aadress on failis ka partneril registrikoodiga ${claimedBy} — üks aadress esindab ühte ettevõtet`,
      });
      row.value = null;
      continue;
    }
    seenInFile.set(email, regCode);

    const partner = ctx.tx
      .select({ id: partners.id })
      .from(partners)
      .where(eq(partners.regCode, regCode))
      .get();
    const collision = representativeCollision(ctx.tx, email, partner?.id ?? 'uus');
    if (collision) {
      row.errors.push({ field: 'e_post', message: collision });
      row.value = null;
    }
  }
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

  const stored: StoredPartnerRow[] = rows.map((row) => ({
    rowNumber: row.rowNumber,
    value: row.value,
    errors: row.errors,
    warnings: row.warnings,
  }));
  checkPartnerContacts(ctx, stored);

  const counts = countRows(stored);
  const annotation = annotatePartnerPreview(ctx, stored);
  const summary: ImportSummary = {
    total: counts.total,
    valid: counts.valid,
    created: annotation.created,
    updated: annotation.updated,
    locked: 0,
    withErrors: counts.withErrors,
    withWarnings: counts.withWarnings,
  };

  const payload: PartnerBatchPayload = {
    rows: stored,
    fileErrors,
    wouldDeactivate: annotation.wouldDeactivate,
    openRoundCount: annotation.openRoundCount,
  };

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
      rowsJson: payload,
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

  return { batchId, rows: stored, fileErrors, summary, ...annotation };
}

/**
 * Write a set of ranking rows: upsert the companies, rewrite the ranking of
 * every lot the rows touch, and deal with the members the file left out.
 *
 * Shared with the framework workbook, so a ranking is written one way only.
 * Mutates each row's `action`, which the preview page shows back.
 */
export function applyPartnerRows(
  ctx: Ctx,
  rows: StoredPartnerRow[],
  options: PartnerImportOptions,
): { created: number; updated: number } {
  const lotIdByCode = new Map(
    ctx.tx
      .select({ id: lots.id, code: lots.code })
      .from(lots)
      .all()
      .map((l) => [l.code, l.id] as const),
  );

  let created = 0;
  let updated = 0;

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

  for (const row of valid) {
    const lotId = lotIdByCode.get(row.value.lotCode);
    const partnerId = partnerIdByRegCode.get(row.value.regCode);
    if (!lotId || !partnerId) {
      row.action = 'error';
      row.note = 'hankeosa või partner puudub';
      continue;
    }
    const existing = membershipByKey.get(membershipKey(lotId, partnerId));

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
      updated += 1;
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
      created += 1;
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

  return { created, updated };
}

/** [V-07] proof for the reader: open rounds keep their frozen participant list. */
export function openRoundParticipantCount(ctx: Ctx): number {
  return (
    ctx.tx
      .select({ count: sql<number>`count(*)` })
      .from(roundParticipants)
      .innerJoin(rounds, eq(rounds.id, roundParticipants.roundId))
      .where(and(eq(rounds.status, 'open'), isNull(roundParticipants.excludedAt)))
      .get()?.count ?? 0
  );
}

export function applyPartnersImport(
  ctx: Ctx,
  batchId: string,
): { summary: ImportSummary; rows: StoredPartnerRow[] } {
  const batch = ctx.tx.select().from(importBatches).where(eq(importBatches.id, batchId)).get();
  if (!batch) throw new Error('Importi ei leitud.');
  if (batch.kind !== 'partners') throw new Error('Vale impordi tüüp.');
  if (batch.status !== 'previewed') throw new Error('See import on juba tehtud või kõrvale jäetud.');

  const payload = batch.rowsJson as PartnerBatchPayload;
  const options = (batch.options ?? {}) as Partial<PartnerImportOptions>;
  const rows = payload.rows;

  const written = applyPartnerRows(ctx, rows, {
    deactivateMissing: Boolean(options.deactivateMissing),
  });
  // The official contacts are the partners' sign-ins [L-21].
  const contacts = syncFrameworkContacts(ctx);

  const summary: ImportSummary = {
    total: rows.length,
    valid: rows.filter((r) => r.value !== null).length,
    created: written.created,
    updated: written.updated,
    locked: 0,
    withErrors: rows.filter((r) => r.errors.length > 0).length,
    withWarnings: rows.filter((r) => r.warnings.length > 0).length,
  };

  ctx.tx
    .update(importBatches)
    .set({
      status: 'imported',
      importedAt: ctx.at,
      rowsJson: { ...payload, rows },
      summary,
    })
    .where(eq(importBatches.id, batchId))
    .run();

  logAudit(ctx, {
    eventType: 'import.partners_imported',
    summary: `Partnerite järjestus imporditud failist ${batch.fileName}: ${summary.created} uut, ${summary.updated} uuendatud${options.deactivateMissing ? ', puuduvad deaktiveeritud' : ''}`,
    after: {
      batchId,
      summary,
      deactivateMissing: Boolean(options.deactivateMissing),
      openRoundParticipantsUnchanged: openRoundParticipantCount(ctx),
      contacts,
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
