/**
 * Import the koolituskalender — the synthetic (later real) procurement table.
 *
 * One code path serves all three ways trainings enter the system, so they
 * cannot diverge: the seed loading the committed sample file, the demo-only
 * "Laadi näidisandmed" button, and a buyer uploading their own table.
 *
 * Import is two-step: `previewTrainingsImport` parses and stores the normalised
 * rows with per-row diagnostics, then `applyTrainingsImport` writes them. The
 * file is therefore uploaded once, and the buyer confirms what they saw.
 *
 * Matching is by `code`, so a re-import updates rather than duplicates and a
 * training keeps its identity and history across rounds [E-09].
 */

import { eq, inArray } from 'drizzle-orm';
import { importBatches, lots, trainings, type ImportSummary } from '@/db/schema';
import { countRows, parseTrainingRows, type ParsedRow, type RowDiagnostic, type TrainingRow } from '@/domain/import-rows';
import { isTrainingImportable } from '@/domain/round-statuses';
import { tallinnIsoDay } from '@/domain/format';
import { logAudit } from '../audit';
import type { Ctx } from '../context';
import { parseCsv } from './csv';
import { parseXlsx } from './xlsx';

export type ImportSource = 'upload' | 'seed' | 'sample';

/** What happened to one row when the import was applied. */
export type RowAction = 'created' | 'updated' | 'locked' | 'error';

export interface StoredRow {
  rowNumber: number;
  value: TrainingRow | null;
  errors: RowDiagnostic[];
  warnings: RowDiagnostic[];
  /** filled in by `applyTrainingsImport` */
  action?: RowAction;
  /** why the row was locked, in Estonian */
  note?: string;
}

export interface PreviewResult {
  batchId: string;
  rows: StoredRow[];
  fileErrors: RowDiagnostic[];
  summary: ImportSummary;
}

const MAX_ROWS = 2000;

function knownLotCodes(ctx: Ctx): string[] {
  return ctx.tx
    .select({ code: lots.code })
    .from(lots)
    .all()
    .map((r) => r.code);
}

/** Read an uploaded file into raw rows, choosing the reader by extension. */
export async function readTable(
  fileName: string,
  content: Buffer,
): Promise<{ rows: Array<Record<string, string>>; error?: string }> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.xlsx')) {
    const parsed = await parseXlsx(content);
    return { rows: parsed.rows };
  }
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
    return { rows: parseCsv(content.toString('utf8')).rows };
  }
  return { rows: [], error: 'Toetatud failitüübid on .csv ja .xlsx.' };
}

/**
 * Parse and validate, storing the result as a `previewed` batch. Nothing is
 * written to `trainings` yet.
 */
export function previewTrainingsImport(
  ctx: Ctx,
  input: {
    fileName: string;
    fileSize: number;
    source: ImportSource;
    rawRows: Array<Record<string, string>>;
  },
): PreviewResult {
  const lotCodes = knownLotCodes(ctx);
  const raws = input.rawRows.slice(0, MAX_ROWS);
  const { rows, fileErrors } = parseTrainingRows(raws, {
    knownLotCodes: lotCodes,
    todayIso: tallinnIsoDay(ctx.at),
  });

  if (input.rawRows.length > MAX_ROWS) {
    fileErrors.push({
      message: `Failis on ${input.rawRows.length} rida; imporditakse esimesed ${MAX_ROWS}.`,
    });
  }

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

  // Show, before anything is written, which valid rows would be refused
  // because the training is already committed to a round or a partner [V-04].
  const stored: StoredRow[] = rows.map((row) => ({
    rowNumber: row.rowNumber,
    value: row.value,
    errors: row.errors,
    warnings: row.warnings,
  }));
  annotateLockState(ctx, stored, summary);

  const batchId = crypto.randomUUID();
  ctx.tx
    .insert(importBatches)
    .values({
      id: batchId,
      kind: 'trainings',
      fileName: input.fileName,
      fileSize: input.fileSize,
      source: input.source,
      status: 'previewed',
      rowsJson: { rows: stored, fileErrors },
      summary,
      options: {},
      actorId: ctx.actor.id,
      actorLabel: ctx.actor.label,
      createdAt: ctx.at,
    })
    .run();

  logAudit(ctx, {
    eventType: 'import.previewed',
    summary: `Koolituskalendri import eelvaadatud: ${input.fileName} — ${summary.valid}/${summary.total} rida korras`,
    after: { batchId, fileName: input.fileName, summary },
  });

  return { batchId, rows: stored, fileErrors, summary };
}

/** Mark rows whose training exists but is no longer importable. */
function annotateLockState(ctx: Ctx, stored: StoredRow[], summary: ImportSummary): void {
  const codes = stored.map((r) => r.value?.code).filter((c): c is string => Boolean(c));
  if (codes.length === 0) return;

  const existing = ctx.tx
    .select({ code: trainings.code, status: trainings.status })
    .from(trainings)
    .where(inArray(trainings.code, codes))
    .all();
  const statusByCode = new Map(existing.map((e) => [e.code, e.status]));

  let locked = 0;
  let updated = 0;
  let created = 0;
  for (const row of stored) {
    if (!row.value) continue;
    const status = statusByCode.get(row.value.code);
    if (status === undefined) {
      created += 1;
    } else if (isTrainingImportable(status)) {
      updated += 1;
    } else {
      locked += 1;
      row.note = 'koolitus on juba voorus või määratud — andmeid ei muudeta';
    }
  }
  summary.created = created;
  summary.updated = updated;
  summary.locked = locked;
}

export interface ApplyResult {
  summary: ImportSummary;
  rows: StoredRow[];
}

/**
 * Write a previewed batch. Re-validates against the database, because a lot may
 * have been removed or a training may have entered a round since the preview.
 */
export function applyTrainingsImport(ctx: Ctx, batchId: string): ApplyResult {
  const batch = ctx.tx.select().from(importBatches).where(eq(importBatches.id, batchId)).get();
  if (!batch) throw new Error('Importi ei leitud.');
  if (batch.kind !== 'trainings') throw new Error('Vale impordi tüüp.');
  if (batch.status === 'imported') throw new Error('See import on juba tehtud.');
  if (batch.status === 'discarded') throw new Error('See import on kõrvale jäetud.');

  const payload = batch.rowsJson as { rows: StoredRow[]; fileErrors: RowDiagnostic[] };
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

  for (const row of rows) {
    if (!row.value) {
      row.action = 'error';
      continue;
    }
    const lotId = lotIdByCode.get(row.value.lotCode);
    if (!lotId) {
      row.action = 'error';
      row.note = `hankeosa ${row.value.lotCode} ei ole enam olemas`;
      summary.withErrors += 1;
      continue;
    }

    const existing = ctx.tx
      .select({ id: trainings.id, status: trainings.status })
      .from(trainings)
      .where(eq(trainings.code, row.value.code))
      .get();

    const fields = {
      lotId,
      title: row.value.title,
      workshopType: row.value.workshopType,
      eventDate: row.value.eventDate,
      eventEnd: row.value.eventEnd,
      county: row.value.county,
      locationText: row.value.locationText,
      targetGroup: row.value.targetGroup,
      participantCount: row.value.participantCount,
      language: row.value.language,
      estimatedValueEur: row.value.estimatedValueEur,
      notes: row.value.notes,
      importBatchId: batchId,
      updatedAt: ctx.at,
    };

    if (!existing) {
      ctx.tx
        .insert(trainings)
        .values({
          id: crypto.randomUUID(),
          code: row.value.code,
          status: 'unassigned',
          createdAt: ctx.at,
          createdBy: ctx.actor.label,
          ...fields,
        })
        .run();
      row.action = 'created';
      summary.created += 1;
      continue;
    }

    if (!isTrainingImportable(existing.status)) {
      // Published round contents are frozen: the partners were offered these
      // terms and may already have confirmed against them [V-04].
      row.action = 'locked';
      row.note = 'koolitus on juba voorus või määratud — andmeid ei muudetud';
      summary.locked += 1;
      continue;
    }

    ctx.tx.update(trainings).set(fields).where(eq(trainings.id, existing.id)).run();
    row.action = 'updated';
    summary.updated += 1;
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

  logAudit(ctx, {
    eventType: 'import.trainings_imported',
    summary: `Koolituskalender imporditud failist ${batch.fileName}: ${summary.created} uut, ${summary.updated} uuendatud, ${summary.locked} lukus, ${summary.withErrors} veaga`,
    after: { batchId, fileName: batch.fileName, source: batch.source, summary },
  });

  return { summary, rows };
}

/** Convenience for the seed and the sample-data button: preview then apply. */
export function importTrainingsFromRows(
  ctx: Ctx,
  input: { fileName: string; fileSize: number; source: ImportSource; rawRows: Array<Record<string, string>> },
): ApplyResult & { batchId: string; fileErrors: RowDiagnostic[] } {
  const preview = previewTrainingsImport(ctx, input);
  if (preview.fileErrors.length > 0 && preview.summary.valid === 0) {
    throw new Error(
      `Näidisandmete faili ei õnnestu lugeda: ${preview.fileErrors.map((e) => e.message).join('; ')}`,
    );
  }
  const applied = applyTrainingsImport(ctx, preview.batchId);
  return { ...applied, batchId: preview.batchId, fileErrors: preview.fileErrors };
}

export function discardImport(ctx: Ctx, batchId: string): void {
  const batch = ctx.tx.select().from(importBatches).where(eq(importBatches.id, batchId)).get();
  if (!batch || batch.status !== 'previewed') return;
  ctx.tx
    .update(importBatches)
    .set({ status: 'discarded' })
    .where(eq(importBatches.id, batchId))
    .run();
  logAudit(ctx, {
    eventType: 'import.discarded',
    summary: `Import ${batch.fileName} jäeti kõrvale`,
    after: { batchId },
  });
}

/** Next free training code for a manually created training. */
export function nextTrainingCode(ctx: Ctx, year: number): string {
  const prefix = `KK-${year}-`;
  const existing = ctx.tx.select({ code: trainings.code }).from(trainings).all();
  let max = 100;
  for (const row of existing) {
    if (!row.code.startsWith(prefix)) continue;
    const seq = Number(row.code.slice(prefix.length));
    if (Number.isFinite(seq) && seq > max) max = seq;
  }
  return `${prefix}${max + 1}`;
}
