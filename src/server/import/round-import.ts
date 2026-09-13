/**
 * Cascade rounds from an uploaded workbook [L-20].
 *
 * The workbook carries a "Voor" sheet with the round's parameters and a
 * "Koolitused" sheet in the calendar-import layout. The upload yields
 * **drafts**: the trainings are created or updated through the same code as
 * the calendar import, a round is created over them, and publication stays a
 * separate, audited act in the application — the instant, the deadline and the
 * frozen ranking are never in a file.
 *
 * A round is one lot's [J-04]; a file need not be. With `hankeosa` left empty
 * on the Voor sheet the trainings are grouped by lot and each group becomes
 * its own draft, all in one import — which is what commissioning the four lots
 * together looks like to the buyer. With a lot named, every row must be in it.
 *
 * All or nothing, per file: a round that "mostly" matches its scheme is worse
 * than none, so a single broken row, a training from a lot the sheet did not
 * name, or a training already committed elsewhere stops the import until the
 * sheet is fixed.
 */

import { eq, inArray } from 'drizzle-orm';
import { importBatches, lots, trainings, type ImportSummary } from '@/db/schema';
import { countRows, parseTrainingRows, type RowDiagnostic } from '@/domain/import-rows';
import { parseEstonianInstant, parseRoundDefinition, type RoundDefinition } from '@/domain/round-definition';
import { isTrainingImportable } from '@/domain/round-statuses';
import { tallinnIsoDay } from '@/domain/format';
import { logAudit } from '../audit';
import type { Ctx } from '../context';
import { createRound } from '../rounds/engine';
import { rounds } from '@/db/schema';
import { applyTrainingRows, type StoredRow } from './trainings-import';

/** One draft the file would create: a lot and how many of the rows are its. */
export interface RoundImportGroup {
  lotCode: string;
  lotName: string;
  count: number;
}

export interface RoundImportPayload {
  round: { value: RoundDefinition | null; errors: RowDiagnostic[]; lotName: string };
  rows: StoredRow[];
  fileErrors: RowDiagnostic[];
  /** the drafts the file would create; absent from batches previewed before v2.7 */
  groups?: RoundImportGroup[];
}

export interface RoundPreviewResult extends RoundImportPayload {
  batchId: string;
  summary: ImportSummary;
  /** every row clean and the round defined — the only state that can be confirmed */
  canApply: boolean;
}

function lotRows(ctx: Ctx) {
  return ctx.tx
    .select({
      id: lots.id,
      code: lots.code,
      name: lots.name,
      defaultCapOptions: lots.defaultCapOptions,
      deadlineLocalTime: lots.deadlineLocalTime,
    })
    .from(lots)
    .all();
}

/**
 * The checks that need the round and the database: every training in the
 * round's lot, none already committed elsewhere. Run at preview and again at
 * apply, because a training may have entered a round in between.
 */
function checkRows(ctx: Ctx, definition: RoundDefinition | null, rows: StoredRow[]): void {
  const codes = rows.map((r) => r.value?.code).filter((c): c is string => Boolean(c));
  const existing = new Map(
    codes.length === 0
      ? []
      : ctx.tx
          .select({ code: trainings.code, status: trainings.status })
          .from(trainings)
          .where(inArray(trainings.code, codes))
          .all()
          .map((t) => [t.code, t.status] as const),
  );
  for (const row of rows) {
    if (!row.value) continue;
    if (definition && definition.lotCode !== null && row.value.lotCode !== definition.lotCode) {
      row.errors.push({
        field: 'hankeosa',
        message: `koolitus kuulub hankeosasse ${row.value.lotCode}, voor on hankeosas ${definition.lotCode}`,
      });
    }
    const status = existing.get(row.value.code);
    if (status !== undefined && !isTrainingImportable(status)) {
      row.errors.push({
        field: 'kood',
        message: 'koolitus on juba voorus või määratud — vooru faili ei saa seda lisada',
      });
    }
    if (row.errors.length > 0) {
      row.value = null;
      row.action = 'error';
    }
  }
}

function summarize(ctx: Ctx, rows: StoredRow[]): ImportSummary {
  const counts = countRows(rows);
  const codes = rows.map((r) => r.value?.code).filter((c): c is string => Boolean(c));
  const known = new Set(
    codes.length === 0
      ? []
      : ctx.tx.select({ code: trainings.code }).from(trainings).where(inArray(trainings.code, codes)).all().map((t) => t.code),
  );
  return {
    total: counts.total,
    valid: counts.valid,
    created: codes.filter((c) => !known.has(c)).length,
    updated: codes.filter((c) => known.has(c)).length,
    locked: 0,
    withErrors: counts.withErrors,
    withWarnings: counts.withWarnings,
  };
}

function canApply(payload: RoundImportPayload): boolean {
  return (
    payload.round.value !== null &&
    payload.round.errors.length === 0 &&
    payload.rows.length > 0 &&
    payload.rows.every((r) => r.value !== null && r.errors.length === 0)
  );
}

/**
 * The drafts a file would create: one for the named lot, or one per lot the
 * valid rows span, in lot-code order.
 */
function groupsOf(
  definition: RoundDefinition | null,
  rows: readonly StoredRow[],
  lotList: ReadonlyArray<{ code: string; name: string }>,
): RoundImportGroup[] {
  if (!definition) return [];
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.value) continue;
    if (definition.lotCode !== null && row.value.lotCode !== definition.lotCode) continue;
    counts.set(row.value.lotCode, (counts.get(row.value.lotCode) ?? 0) + 1);
  }
  const codes = definition.lotCode !== null ? [definition.lotCode] : [...counts.keys()].sort();
  return codes.map((lotCode) => ({
    lotCode,
    lotName: lotList.find((l) => l.code === lotCode)?.name ?? '',
    count: counts.get(lotCode) ?? 0,
  }));
}

export function previewRoundImport(
  ctx: Ctx,
  input: {
    fileName: string;
    fileSize: number;
    roundRows: Array<Record<string, string>>;
    trainingRows: Array<Record<string, string>>;
  },
): RoundPreviewResult {
  const lotList = lotRows(ctx);
  const knownLotCodes = lotList.map((l) => l.code);

  const definition = parseRoundDefinition(input.roundRows, {
    knownLotCodes,
    // A bare date in „vastamistahtaeg“ lands at the lot's own hour, where the
    // working-day arithmetic would have put it.
    deadlineTimeByLot: Object.fromEntries(lotList.map((l) => [l.code, l.deadlineLocalTime])),
  });
  const parsed = parseTrainingRows(input.trainingRows, { knownLotCodes, todayIso: tallinnIsoDay(ctx.at) });
  const rows: StoredRow[] = parsed.rows.map((row) => ({
    rowNumber: row.rowNumber,
    value: row.value,
    errors: row.errors,
    warnings: row.warnings,
  }));
  const fileErrors = [...parsed.fileErrors];
  if (rows.length === 0 && parsed.fileErrors.length === 0) {
    fileErrors.push({ message: 'Lehel „Koolitused“ ei ole ühtegi andmerida.' });
  }
  checkRows(ctx, definition.value, rows);

  const groups = groupsOf(definition.value, rows, lotList);
  const payload: RoundImportPayload = {
    round: {
      value: definition.value,
      errors: definition.errors,
      lotName: lotList.find((l) => l.code === definition.value?.lotCode)?.name ?? '',
    },
    rows,
    fileErrors,
    groups,
  };
  const summary = summarize(ctx, rows);

  const batchId = crypto.randomUUID();
  ctx.tx
    .insert(importBatches)
    .values({
      id: batchId,
      kind: 'round',
      fileName: input.fileName,
      fileSize: input.fileSize,
      source: 'upload',
      status: 'previewed',
      rowsJson: payload,
      summary,
      options: {},
      actorId: ctx.actor.id,
      actorLabel: ctx.actor.label,
      createdAt: ctx.at,
    })
    .run();

  logAudit(ctx, {
    eventType: 'import.previewed',
    summary: `Vooru skeemi import eelvaadatud: ${input.fileName} — ${summary.valid}/${summary.total} koolitust korras${
      definition.value
        ? definition.value.lotCode !== null
          ? `, hankeosa ${definition.value.lotCode}`
          : `, ${groups.length} mustandit (${groups.map((g) => g.lotCode).join(', ') || '—'})`
        : ', vooru andmed vigased'
    }`,
    after: { batchId, fileName: input.fileName, summary, roundErrors: definition.errors },
  });

  return { batchId, ...payload, summary, canApply: canApply(payload) };
}

/**
 * Create the draft — or, with no lot named, one draft per lot — the previewed
 * workbook describes. Refuses if anything is wrong — the preview said what, and
 * a partial round is not a round.
 */
export function applyRoundImport(
  ctx: Ctx,
  batchId: string,
): { roundId: string; roundIds: string[]; summary: ImportSummary } {
  const batch = ctx.tx.select().from(importBatches).where(eq(importBatches.id, batchId)).get();
  if (!batch) throw new Error('Importi ei leitud.');
  if (batch.kind !== 'round') throw new Error('Vale impordi tüüp.');
  if (batch.status !== 'previewed') throw new Error('See import on juba tehtud või kõrvale jäetud.');

  const payload = batch.rowsJson as RoundImportPayload;
  // The state may have moved since the preview; check again, not trust it.
  for (const row of payload.rows) row.errors = row.errors.filter((e) => e.field !== 'hankeosa' || !e.message.startsWith('koolitus kuulub'));
  checkRows(ctx, payload.round.value, payload.rows);
  if (!canApply(payload)) {
    ctx.tx.update(importBatches).set({ rowsJson: payload }).where(eq(importBatches.id, batchId)).run();
    throw new Error('Vooru faili ei saa importida: paranda eelvaates näidatud vead ja laadi fail uuesti.');
  }
  const definition = payload.round.value!;
  const lotList = lotRows(ctx);
  const groups = groupsOf(definition, payload.rows, lotList);
  for (const group of groups) {
    if (!lotList.some((l) => l.code === group.lotCode)) throw new Error(`Hankeosa ${group.lotCode} ei ole enam olemas.`);
  }

  const summary = applyTrainingRows(ctx, payload.rows, batchId);
  const codes = payload.rows.map((r) => r.value!.code);
  const byCode = new Map(
    ctx.tx
      .select({ id: trainings.id, code: trainings.code })
      .from(trainings)
      .where(inArray(trainings.code, codes))
      .all()
      .map((t) => [t.code, t.id] as const),
  );

  const roundIds: string[] = [];
  for (const group of groups) {
    const lot = lotList.find((l) => l.code === group.lotCode)!;
    const trainingIds = payload.rows
      .filter((r) => r.value!.lotCode === group.lotCode)
      .map((r) => byCode.get(r.value!.code))
      .filter((id): id is string => Boolean(id));

    const roundId = createRound(ctx, {
      lotId: lot.id,
      trainingIds,
      note: definition.note,
      visibilityMode: definition.visibilityMode,
      capOptions: definition.capOptions ?? lot.defaultCapOptions,
    });
    roundIds.push(roundId);

    // The window the scheme asked for: a plan the publish form offers, not the
    // fact. Publication fixes the real instants and still enforces the lot's
    // floor from the moment somebody presses it [L-20]. A bare-date deadline in
    // a per-lot file takes each lot's own hour.
    const plannedDeadlineAt =
      definition.lotCode === null && definition.deadlineText
        ? (() => {
            const parsed = parseEstonianInstant(definition.deadlineText, lot.deadlineLocalTime);
            return parsed.ok ? parsed.value : definition.plannedDeadlineAt;
          })()
        : definition.plannedDeadlineAt;
    if (definition.extraWorkingDays > 0 || definition.plannedPublishAt !== null || plannedDeadlineAt !== null) {
      ctx.tx
        .update(rounds)
        .set({
          plannedExtraWorkingDays: definition.extraWorkingDays,
          plannedPublishAt: definition.plannedPublishAt,
          plannedDeadlineAt,
        })
        .where(eq(rounds.id, roundId))
        .run();
    }

    const code = ctx.tx.select({ code: rounds.code }).from(rounds).where(eq(rounds.id, roundId)).get()?.code ?? '';
    logAudit(ctx, {
      eventType: 'import.round_imported',
      summary: `Voor ${code} loodud mustandina failist ${batch.fileName}: ${trainingIds.length} koolitust, hankeosa ${lot.code}${
        groups.length > 1 ? ` (failist loodi ${groups.length} mustandit)` : ''
      }`,
      roundId,
      lotId: lot.id,
      after: { batchId, fileName: batch.fileName, summary, definition, lotCode: lot.code, drafts: groups.length },
    });
  }

  ctx.tx
    .update(importBatches)
    .set({ status: 'imported', importedAt: ctx.at, rowsJson: payload, summary })
    .where(eq(importBatches.id, batchId))
    .run();

  return { roundId: roundIds[0]!, roundIds, summary };
}
