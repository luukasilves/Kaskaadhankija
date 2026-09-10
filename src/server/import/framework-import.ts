/**
 * The framework-data workbook [L-21]: one file, four sheets, one transaction.
 *
 * What the buyer receives when the tender concludes is a table, so this is how
 * the framework gets into the system — and it is the same file an admin
 * downloads filled in, edits and drops back. The screen can change every one of
 * these things field by field too; both call the same writers in
 * `../framework.ts`, so the two paths cannot drift.
 *
 * All-or-nothing, like the round scheme [L-20]: a ranking with a hole in it is
 * not a ranking, and half a lot's settings is worse than none. The preview says
 * exactly what would change — including who would lose their place and who is
 * about to lose the ability to sign in — and nothing is written until the buyer
 * confirms what they saw.
 *
 * Order inside the transaction is deliberate: identity, then lots (so a lot the
 * same file creates can be referenced by the ranking), then the ranking, then
 * the extra representatives, and the contact sync last — after which every
 * official contact is a login again.
 */

import { eq } from 'drizzle-orm';
import { importBatches, lots, partners, type ImportSummary } from '@/db/schema';
import type { FrameworkIdentity } from '@/domain/framework';
import {
  parseFrameworkSheet,
  parseLotRows,
  type LotRow,
} from '@/domain/framework-definition';
import {
  countRows,
  parsePartnerRows,
  parseRepresentativeRows,
  type RawRow,
  type RowDiagnostic,
} from '@/domain/import-rows';
import { logAudit } from '../audit';
import type { Ctx } from '../context';
import {
  applyLotRows,
  deactivateLot,
  frameworkIdentity,
  lotDeactivationBlockers,
  syncFrameworkContacts,
  updateFrameworkIdentity,
  type FrameworkContactSyncReport,
  type LotApplyReport,
} from '../framework';
import {
  annotatePartnerPreview,
  applyPartnerRows,
  checkPartnerContacts,
  openRoundParticipantCount,
  type PartnerPreviewAnnotation,
  type StoredPartnerRow,
} from './partners-import';
import {
  applyRepresentativeRows,
  type StoredRepresentativeRow,
} from './representatives-import';
import type { ImportSource } from './trainings-import';

export interface FrameworkImportOptions {
  /**
   * Retire what the file leaves out: lot members absent from the ranking, and
   * lots absent from the Hankeosad sheet. Off by default — an upload is usually
   * a correction, and silently retiring a partner changes who gets work.
   */
  deactivateMissing: boolean;
}

export interface StoredLotRow {
  rowNumber: number;
  value: LotRow | null;
  errors: RowDiagnostic[];
  warnings: RowDiagnostic[];
  action?: 'created' | 'updated' | 'unchanged';
}

export interface FrameworkSheets {
  raamleping?: RawRow[];
  hankeosad?: RawRow[];
  partnerid: RawRow[];
  esindajad?: RawRow[];
}

export interface FrameworkImportPayload {
  framework: {
    present: boolean;
    value: FrameworkIdentity | null;
    current: FrameworkIdentity;
    errors: RowDiagnostic[];
  };
  lots: {
    present: boolean;
    rows: StoredLotRow[];
    fileErrors: RowDiagnostic[];
    /** lots the file leaves out, with the rounds that stop them being retired */
    toDeactivate: Array<{ code: string; name: string; blockedBy: string[] }>;
  };
  partners: {
    rows: StoredPartnerRow[];
    fileErrors: RowDiagnostic[];
  } & PartnerPreviewAnnotation;
  representatives: {
    present: boolean;
    rows: StoredRepresentativeRow[];
    fileErrors: RowDiagnostic[];
  };
}

export interface FrameworkPreviewResult extends FrameworkImportPayload {
  batchId: string;
  summary: ImportSummary;
  canApply: boolean;
}

export interface FrameworkApplyResult {
  summary: ImportSummary;
  framework: { changed: boolean };
  lots: LotApplyReport & { deactivated: string[]; kept: string[] };
  partners: { created: number; updated: number };
  representatives: ImportSummary | null;
  contacts: FrameworkContactSyncReport;
}

/** Nothing may be written from a file with a single bad row [L-21]. */
function decideCanApply(payload: FrameworkImportPayload): boolean {
  if (payload.framework.present && (payload.framework.errors.length > 0 || !payload.framework.value)) {
    return false;
  }
  if (payload.lots.present) {
    if (payload.lots.fileErrors.length > 0) return false;
    if (payload.lots.rows.length === 0) return false;
    if (payload.lots.rows.some((row) => row.value === null)) return false;
  }
  if (payload.partners.rows.length === 0) return false;
  if (payload.partners.rows.some((row) => row.value === null)) return false;
  if (payload.representatives.present) {
    if (payload.representatives.rows.some((row) => row.value === null)) return false;
  }
  return true;
}

export function previewFrameworkImport(
  ctx: Ctx,
  input: {
    fileName: string;
    fileSize: number;
    source: ImportSource;
    sheets: FrameworkSheets;
    options: FrameworkImportOptions;
  },
): FrameworkPreviewResult {
  /* 1. the framework's own identity */
  const hasFrameworkSheet = (input.sheets.raamleping?.length ?? 0) > 0;
  const framework = hasFrameworkSheet
    ? parseFrameworkSheet(input.sheets.raamleping!)
    : { value: null, errors: [] as RowDiagnostic[] };

  /* 2. the lots */
  const hasLotSheet = (input.sheets.hankeosad?.length ?? 0) > 0;
  const parsedLots = hasLotSheet
    ? parseLotRows(input.sheets.hankeosad!)
    : { rows: [], fileErrors: [] as RowDiagnostic[] };
  const storedLots: StoredLotRow[] = parsedLots.rows.map((row) => ({
    rowNumber: row.rowNumber,
    value: row.value,
    errors: row.errors,
    warnings: row.warnings,
  }));

  const existingLots = ctx.tx.select().from(lots).all();
  const fileLotCodes = new Set(
    storedLots.map((row) => row.value?.code).filter((code): code is string => Boolean(code)),
  );
  const newLotCodes = new Set(
    [...fileLotCodes].filter((code) => !existingLots.some((lot) => lot.code === code)),
  );
  for (const row of storedLots) {
    if (!row.value) continue;
    row.action = newLotCodes.has(row.value.code) ? 'created' : 'updated';
  }

  const toDeactivate =
    hasLotSheet && input.options.deactivateMissing
      ? existingLots
          .filter((lot) => lot.isActive && !fileLotCodes.has(lot.code))
          .map((lot) => ({
            code: lot.code,
            name: lot.name,
            blockedBy: lotDeactivationBlockers(ctx.tx, lot.id),
          }))
      : [];

  /* 3. the ranking — lots this same file creates count as known */
  const knownLotCodes = [
    ...new Set([...existingLots.map((lot) => lot.code), ...fileLotCodes]),
  ];
  const parsedPartners = parsePartnerRows(input.sheets.partnerid ?? [], { knownLotCodes });
  const storedPartners: StoredPartnerRow[] = parsedPartners.rows.map((row) => ({
    rowNumber: row.rowNumber,
    value: row.value,
    errors: row.errors,
    warnings: row.warnings,
  }));
  checkPartnerContacts(ctx, storedPartners);
  const partnerFileErrors = [...parsedPartners.fileErrors];
  if (!hasLotSheet && storedPartners.some((row) => row.errors.some((e) => e.field === 'hankeosa'))) {
    partnerFileErrors.push({
      message:
        'Mõnda hankeosa ei tunta. Kui tegemist on uue hankeosaga, lisa see lehele „Hankeosad“; muidu kontrolli koodi.',
    });
  }
  const annotation = annotatePartnerPreview(ctx, storedPartners, newLotCodes);

  /* 4. the extra representatives — a company this same file introduces counts */
  const hasRepresentativeSheet = (input.sheets.esindajad?.length ?? 0) > 0;
  const knownRegCodes = [
    ...new Set([
      ...ctx.tx.select({ regCode: partners.regCode }).from(partners).all().map((row) => row.regCode),
      ...storedPartners
        .map((row) => row.value?.regCode)
        .filter((code): code is string => Boolean(code)),
    ]),
  ];
  const parsedReps = hasRepresentativeSheet
    ? parseRepresentativeRows(input.sheets.esindajad!, { knownRegCodes })
    : { rows: [], fileErrors: [] as RowDiagnostic[] };
  const partnerNameByReg = new Map<string, string>([
    ...ctx.tx
      .select({ regCode: partners.regCode, name: partners.name })
      .from(partners)
      .all()
      .map((row) => [row.regCode, row.name] as const),
    // A company the ranking sheet introduces has no row yet, but it does have
    // a name — and the preview table is easier to read with it.
    ...storedPartners
      .map((row) => row.value)
      .filter((value): value is NonNullable<typeof value> => value !== null)
      .map((value) => [value.regCode, value.partnerName] as const),
  ]);
  const storedReps: StoredRepresentativeRow[] = parsedReps.rows.map((row) => ({
    rowNumber: row.rowNumber,
    value: row.value,
    partnerName: row.value ? partnerNameByReg.get(row.value.regCode) ?? '' : '',
    errors: row.errors,
    warnings: row.warnings,
  }));

  const counts = countRows(storedPartners);
  const summary: ImportSummary = {
    total: counts.total,
    valid: counts.valid,
    created: annotation.created,
    updated: annotation.updated,
    locked: 0,
    withErrors: counts.withErrors,
    withWarnings: counts.withWarnings,
  };

  const payload: FrameworkImportPayload = {
    framework: {
      present: hasFrameworkSheet,
      value: framework.value,
      current: frameworkIdentity(ctx.tx),
      errors: framework.errors,
    },
    lots: {
      present: hasLotSheet,
      rows: storedLots,
      fileErrors: parsedLots.fileErrors,
      toDeactivate,
    },
    partners: { rows: storedPartners, fileErrors: partnerFileErrors, ...annotation },
    representatives: {
      present: hasRepresentativeSheet,
      rows: storedReps,
      fileErrors: parsedReps.fileErrors,
    },
  };

  const batchId = crypto.randomUUID();
  ctx.tx
    .insert(importBatches)
    .values({
      id: batchId,
      kind: 'framework',
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
    summary: `Raamhanke andmete import eelvaadatud: ${input.fileName} — ${summary.valid}/${summary.total} järjestuse rida korras`,
    after: { batchId, fileName: input.fileName, summary },
  });

  return { batchId, summary, canApply: decideCanApply(payload), ...payload };
}

export function applyFrameworkImport(ctx: Ctx, batchId: string): FrameworkApplyResult {
  const batch = ctx.tx.select().from(importBatches).where(eq(importBatches.id, batchId)).get();
  if (!batch) throw new Error('Importi ei leitud.');
  if (batch.kind !== 'framework') throw new Error('Vale impordi tüüp.');
  if (batch.status !== 'previewed') throw new Error('See import on juba tehtud või kõrvale jäetud.');

  const payload = batch.rowsJson as FrameworkImportPayload;
  const options = (batch.options ?? {}) as Partial<FrameworkImportOptions>;
  const deactivateMissing = Boolean(options.deactivateMissing);

  // The state may have moved since the preview; re-check rather than trust it.
  checkPartnerContacts(ctx, payload.partners.rows);
  if (!decideCanApply(payload)) {
    throw new Error(
      'Raamhanke andmeid ei saa importida: paranda eelvaates näidatud vead ja laadi fail uuesti.',
    );
  }

  /* 1. identity */
  const frameworkChanged =
    payload.framework.present && payload.framework.value
      ? updateFrameworkIdentity(ctx, payload.framework.value)
      : false;

  /* 2. lots, before the ranking that may reference a new one */
  const lotRows = payload.lots.rows
    .map((row) => row.value)
    .filter((value): value is LotRow => value !== null);
  const lotReport = applyLotRows(ctx, lotRows);

  const deactivated: string[] = [];
  const kept: string[] = [];
  for (const candidate of payload.lots.toDeactivate) {
    const lot = ctx.tx.select().from(lots).where(eq(lots.code, candidate.code)).get();
    if (!lot) continue;
    const blockers = lotDeactivationBlockers(ctx.tx, lot.id);
    if (blockers.length > 0) {
      // Refused rather than fatal: the rest of the file is still correct, and
      // the reason is on the screen afterwards.
      kept.push(`${candidate.code} (${blockers.join(', ')})`);
      continue;
    }
    deactivateLot(ctx, lot.id, 'puudus raamhanke andmete failist');
    deactivated.push(candidate.code);
  }

  /* 3. the ranking */
  const partnersWritten = applyPartnerRows(ctx, payload.partners.rows, { deactivateMissing });

  /* 4. the extra representatives */
  const representatives = payload.representatives.present
    ? applyRepresentativeRows(ctx, payload.representatives.rows, {
        deactivateMissing,
        batchId,
      })
    : null;

  /* 5. and now every official contact is a login again */
  const contacts = syncFrameworkContacts(ctx);

  const summary: ImportSummary = {
    total: payload.partners.rows.length,
    valid: payload.partners.rows.filter((row) => row.value !== null).length,
    created: partnersWritten.created,
    updated: partnersWritten.updated,
    locked: 0,
    withErrors: payload.partners.rows.filter((row) => row.errors.length > 0).length,
    withWarnings: payload.partners.rows.filter((row) => row.warnings.length > 0).length,
  };

  ctx.tx
    .update(importBatches)
    .set({ status: 'imported', importedAt: ctx.at, rowsJson: payload, summary })
    .where(eq(importBatches.id, batchId))
    .run();

  const report: FrameworkApplyResult = {
    summary,
    framework: { changed: frameworkChanged },
    lots: { ...lotReport, deactivated, kept },
    partners: partnersWritten,
    representatives,
    contacts,
  };

  logAudit(ctx, {
    eventType: 'import.framework_imported',
    summary:
      `Raamhanke andmed imporditud failist ${batch.fileName}: ` +
      `${lotReport.created.length} uut hankeosa, ${summary.created} uut ja ${summary.updated} uuendatud partneri kohta` +
      `${contacts.created.length > 0 ? `, ${contacts.created.length} uut sisselogimist` : ''}`,
    after: {
      batchId,
      deactivateMissing,
      ...report,
      openRoundParticipantsUnchanged: openRoundParticipantCount(ctx),
    },
  });

  return report;
}

/** Convenience for the seed: preview then apply in one call. */
export function importFrameworkFromSheets(
  ctx: Ctx,
  input: {
    fileName: string;
    fileSize: number;
    source: ImportSource;
    sheets: FrameworkSheets;
    options?: FrameworkImportOptions;
  },
): FrameworkApplyResult {
  const preview = previewFrameworkImport(ctx, {
    ...input,
    options: input.options ?? { deactivateMissing: false },
  });
  if (!preview.canApply) {
    const problems = [
      ...preview.framework.errors.map((e) => e.message),
      ...preview.lots.fileErrors.map((e) => e.message),
      ...preview.lots.rows.flatMap((row) => row.errors.map((e) => `hankeosad rida ${row.rowNumber}: ${e.message}`)),
      ...preview.partners.fileErrors.map((e) => e.message),
      ...preview.partners.rows.flatMap((row) => row.errors.map((e) => `partnerid rida ${row.rowNumber}: ${e.message}`)),
      ...preview.representatives.rows.flatMap((row) => row.errors.map((e) => `esindajad rida ${row.rowNumber}: ${e.message}`)),
    ];
    throw new Error(`Raamhanke andmete faili ei õnnestu lugeda: ${problems.join('; ')}`);
  }
  return applyFrameworkImport(ctx, preview.batchId);
}
