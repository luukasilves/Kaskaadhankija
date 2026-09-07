'use server';

/**
 * Upload and import the procurement tables.
 *
 * Two steps by design: a preview stores the normalised rows with their
 * diagnostics, and a second confirmation writes them. So the buyer sees exactly
 * what will happen — including which rows are refused and why — before
 * anything changes, and the file is only uploaded once.
 */

import { redirect } from 'next/navigation';
import { loadSampleTrainings } from '@/db/seed';
import { assertDemoMode } from '@/lib/env';
import {
  applyTrainingsImport,
  discardImport,
  previewTrainingsImport,
  readTable,
} from '../import/trainings-import';
import { applyPartnersImport, previewPartnersImport } from '../import/partners-import';
import {
  applyRepresentativesImport,
  previewRepresentativesImport,
} from '../import/representatives-import';
import { applyRoundImport, previewRoundImport } from '../import/round-import';
import { parseXlsxSheets } from '../import/xlsx';
import { fold } from '@/domain/import-rows';
import { buyerWrite, describeError, fail, fieldText, ok, type ActionOutcome } from './helpers';

const MAX_BYTES = 5 * 1024 * 1024;

async function readUpload(
  form: FormData,
): Promise<{ fileName: string; size: number; rows: Array<Record<string, string>> } | { error: string }> {
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'Vali fail.' };
  if (file.size > MAX_BYTES) {
    return { error: `Fail on liiga suur (${(file.size / 1024 / 1024).toFixed(1)} MB, lubatud 5 MB).` };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = await readTable(file.name, buffer);
  if (parsed.error) return { error: parsed.error };
  if (parsed.rows.length === 0) return { error: 'Failis ei ole ühtegi andmerida.' };

  return { fileName: file.name, size: file.size, rows: parsed.rows };
}

/* ---------------- koolituskalender ---------------- */

export async function previewTrainingsAction(form: FormData): Promise<ActionOutcome> {
  const upload = await readUpload(form);
  if ('error' in upload) return fail(upload.error);

  let batchId: string;
  try {
    batchId = await buyerWrite((ctx) =>
      previewTrainingsImport(ctx, {
        fileName: upload.fileName,
        fileSize: upload.size,
        source: 'upload',
        rawRows: upload.rows,
      }),
    ).then((r) => r.batchId);
  } catch (error) {
    return fail(describeError(error));
  }
  redirect(`/tellija/koolitused/import?batch=${batchId}`);
}

export async function confirmTrainingsImportAction(form: FormData): Promise<ActionOutcome> {
  const batchId = fieldText(form, 'batchId');
  try {
    const result = await buyerWrite((ctx) => applyTrainingsImport(ctx, batchId), [
      '/tellija/koolitused',
      '/tellija',
    ]);
    const { created, updated, locked, withErrors } = result.summary;
    return ok(
      `Imporditud: ${created} uut, ${updated} uuendatud, ${locked} lukus, ${withErrors} veaga rida.`,
    );
  } catch (error) {
    return fail(describeError(error));
  }
}

export async function discardImportAction(form: FormData): Promise<ActionOutcome> {
  const batchId = fieldText(form, 'batchId');
  try {
    await buyerWrite((ctx) => discardImport(ctx, batchId), ['/tellija/koolitused']);
  } catch (error) {
    return fail(describeError(error));
  }
  redirect('/tellija/koolitused');
}

/** Demo-only: re-import the committed sample koolituskalender. */
export async function loadSampleTrainingsAction(): Promise<ActionOutcome> {
  try {
    assertDemoMode();
    const result = await buyerWrite((ctx) => loadSampleTrainings(ctx), [
      '/tellija/koolitused',
      '/tellija',
    ]);
    const { created, updated, locked } = result.summary;
    return ok(`Näidisandmed laaditud: ${created} uut, ${updated} uuendatud, ${locked} lukus.`);
  } catch (error) {
    return fail(describeError(error));
  }
}

/* ---------------- partner ranking ---------------- */

export async function previewPartnersAction(form: FormData): Promise<ActionOutcome> {
  const upload = await readUpload(form);
  if ('error' in upload) return fail(upload.error);
  const deactivateMissing = fieldText(form, 'deactivateMissing') === 'on';

  let batchId: string;
  try {
    batchId = await buyerWrite((ctx) =>
      previewPartnersImport(ctx, {
        fileName: upload.fileName,
        fileSize: upload.size,
        source: 'upload',
        rawRows: upload.rows,
        options: { deactivateMissing },
      }),
    ).then((r) => r.batchId);
  } catch (error) {
    return fail(describeError(error));
  }
  redirect(`/tellija/partnerid/import?batch=${batchId}`);
}

export async function confirmPartnersImportAction(form: FormData): Promise<ActionOutcome> {
  const batchId = fieldText(form, 'batchId');
  try {
    const result = await buyerWrite((ctx) => applyPartnersImport(ctx, batchId), [
      '/tellija/partnerid',
      '/tellija/hankeosad',
    ]);
    const { created, updated } = result.summary;
    return ok(`Järjestus imporditud: ${created} uut osalust, ${updated} uuendatud.`);
  } catch (error) {
    return fail(describeError(error));
  }
}

/* ---------------- partner representatives ---------------- */

export async function previewRepresentativesAction(form: FormData): Promise<ActionOutcome> {
  const upload = await readUpload(form);
  if ('error' in upload) return fail(upload.error);
  const deactivateMissing = fieldText(form, 'deactivateMissing') === 'on';

  let batchId: string;
  try {
    batchId = await buyerWrite((ctx) =>
      previewRepresentativesImport(ctx, {
        fileName: upload.fileName,
        fileSize: upload.size,
        source: 'upload',
        rawRows: upload.rows,
        options: { deactivateMissing },
      }),
    ).then((r) => r.batchId);
  } catch (error) {
    return fail(describeError(error));
  }
  redirect(`/tellija/partnerid/esindajad/import?batch=${batchId}`);
}

export async function confirmRepresentativesImportAction(form: FormData): Promise<ActionOutcome> {
  const batchId = fieldText(form, 'batchId');
  try {
    const result = await buyerWrite((ctx) => applyRepresentativesImport(ctx, batchId), [
      '/tellija/partnerid/esindajad',
      '/tellija/partnerid',
    ]);
    const { created, updated, withErrors } = result.summary;
    return ok(`Esindajad imporditud: ${created} uut, ${updated} uuendatud, ${withErrors} veaga rida.`);
  } catch (error) {
    return fail(describeError(error));
  }
}

/* ---------------- one cascade round from a workbook [L-20] ---------------- */

export async function previewRoundAction(form: FormData): Promise<ActionOutcome> {
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return fail('Vali fail.');
  if (file.size > MAX_BYTES) return fail(`Fail on liiga suur (${(file.size / 1024 / 1024).toFixed(1)} MB, lubatud 5 MB).`);
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    return fail('Vooru skeem peab olema .xlsx töövihik kahe lehega: „Voor“ ja „Koolitused“.');
  }

  let sheets: Awaited<ReturnType<typeof parseXlsxSheets>>;
  try {
    sheets = await parseXlsxSheets(Buffer.from(await file.arrayBuffer()));
  } catch {
    return fail('Faili ei õnnestu lugeda .xlsx töövihikuna.');
  }
  const byName = new Map([...sheets.entries()].map(([name, sheet]) => [fold(name), sheet] as const));
  const voor = byName.get('voor');
  const koolitused = byName.get('koolitused');
  if (!voor || !koolitused) {
    return fail(
      `Töövihikus peavad olema lehed „Voor“ ja „Koolitused“; leitud: ${[...sheets.keys()].join(', ') || 'ükski'}.`,
    );
  }

  let batchId: string;
  try {
    batchId = await buyerWrite((ctx) =>
      previewRoundImport(ctx, {
        fileName: file.name,
        fileSize: file.size,
        roundRows: voor.rows,
        trainingRows: koolitused.rows,
      }),
    ).then((r) => r.batchId);
  } catch (error) {
    return fail(describeError(error));
  }
  redirect(`/tellija/voorud/import?batch=${batchId}`);
}

export async function confirmRoundImportAction(form: FormData): Promise<ActionOutcome> {
  const batchId = fieldText(form, 'batchId');
  let roundId: string;
  try {
    roundId = await buyerWrite((ctx) => applyRoundImport(ctx, batchId), [
      '/tellija/voorud',
      '/tellija',
      '/tellija/koolitused',
    ]).then((r) => r.roundId);
  } catch (error) {
    return fail(describeError(error));
  }
  redirect(`/tellija/voorud/${roundId}`);
}

export async function discardRoundImportAction(form: FormData): Promise<ActionOutcome> {
  const batchId = fieldText(form, 'batchId');
  try {
    await buyerWrite((ctx) => discardImport(ctx, batchId), ['/tellija/voorud']);
  } catch (error) {
    return fail(describeError(error));
  }
  redirect('/tellija/voorud/uus');
}
