'use server';

/**
 * The framework data, from the screen or from a file [L-21].
 *
 * Two ways in, one set of writers: every action here calls the same functions
 * in `../framework.ts` that the workbook import calls, so a contact changed by
 * hand and a contact changed by upload land identically — and both leave the
 * same audit row, which is the point. `adminWrite` makes them admin-only [R-01]
 * and puts each one in its own transaction.
 */

import { redirect } from 'next/navigation';
import { fold } from '@/domain/import-rows';
import { parseCsv } from '../import/csv';
import {
  applyFrameworkImport,
  previewFrameworkImport,
  type FrameworkSheets,
} from '../import/framework-import';
import { discardImport } from '../import/trainings-import';
import { parseXlsxSheets } from '../import/xlsx';
import {
  addLotPartner,
  addRepresentative,
  deactivateLot,
  moveLotPartnerRank,
  updateFrameworkIdentity,
  updateLotPartnerContact,
  updateRepresentative,
} from '../framework';
import {
  adminWrite,
  describeError,
  fail,
  fieldNumber,
  fieldText,
  ok,
  type ActionOutcome,
} from './helpers';

const MAX_BYTES = 5 * 1024 * 1024;

const PATHS = [
  '/tellija/raamhange',
  '/tellija/hankeosad',
  '/tellija/partnerid',
  '/tellija/partnerid/esindajad',
  '/tellija',
];

/* ------------------------------------------------------------------ *
 * the workbook
 * ------------------------------------------------------------------ */

/**
 * Read the four sheets out of an uploaded workbook.
 *
 * Sheet names are matched folded, so „Hankeosad“, „hankeosad“ and „HANKEOSAD“
 * all arrive. Only `Partnerid` is required: the others say "leave this alone".
 */
async function readWorkbook(file: File): Promise<FrameworkSheets | { error: string }> {
  let sheets: Awaited<ReturnType<typeof parseXlsxSheets>>;
  try {
    sheets = await parseXlsxSheets(Buffer.from(await file.arrayBuffer()));
  } catch {
    return { error: 'Faili ei õnnestu lugeda .xlsx töövihikuna.' };
  }
  const byName = new Map([...sheets.entries()].map(([name, sheet]) => [fold(name), sheet] as const));
  const partnerid = byName.get('partnerid') ?? byName.get('raamlepingu_partnerid');
  if (!partnerid) {
    return {
      error: `Töövihikus peab olema leht „Partnerid“ (raamlepingu järjestus); leitud: ${[...sheets.keys()].join(', ') || 'ükski'}.`,
    };
  }
  return {
    raamleping: byName.get('raamleping')?.rows,
    hankeosad: byName.get('hankeosad')?.rows,
    partnerid: partnerid.rows,
    esindajad: byName.get('esindajad')?.rows,
  };
}

export async function previewFrameworkAction(form: FormData): Promise<ActionOutcome> {
  const file = form.get('file');
  const pasted = fieldText(form, 'pasted');
  const deactivateMissing = fieldText(form, 'deactivateMissing') === 'on';

  let sheets: FrameworkSheets;
  let fileName: string;
  let fileSize: number;

  if (pasted) {
    // Rows copied straight out of Excel: the CSV reader detects tabs, so a
    // paste is the same two-step import without a file at all.
    const parsed = parseCsv(pasted);
    if (parsed.rows.length === 0) return fail('Kleebitud tekstis ei ole ühtegi andmerida.');
    sheets = { partnerid: parsed.rows };
    fileName = 'kleebitud järjestus';
    fileSize = pasted.length;
  } else {
    if (!(file instanceof File) || file.size === 0) return fail('Vali fail või kleebi read.');
    if (file.size > MAX_BYTES) {
      return fail(`Fail on liiga suur (${(file.size / 1024 / 1024).toFixed(1)} MB, lubatud 5 MB).`);
    }
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.xls')) {
      return fail('Vana .xls vorming ei ole toetatud — salvesta fail Excelis .xlsx kujul.');
    }
    if (!lower.endsWith('.xlsx')) {
      return fail('Raamhanke andmed käivad .xlsx töövihikuna (lehed Raamleping, Hankeosad, Partnerid, Esindajad).');
    }
    const read = await readWorkbook(file);
    if ('error' in read) return fail(read.error);
    sheets = read;
    fileName = file.name;
    fileSize = file.size;
  }

  let batchId: string;
  try {
    batchId = await adminWrite((ctx) =>
      previewFrameworkImport(ctx, {
        fileName,
        fileSize,
        source: 'upload',
        sheets,
        options: { deactivateMissing },
      }),
    ).then((result) => result.batchId);
  } catch (error) {
    return fail(describeError(error));
  }
  redirect(`/tellija/raamhange/import?batch=${batchId}`);
}

export async function confirmFrameworkImportAction(form: FormData): Promise<ActionOutcome> {
  const batchId = fieldText(form, 'batchId');
  try {
    await adminWrite((ctx) => applyFrameworkImport(ctx, batchId), PATHS);
  } catch (error) {
    return fail(describeError(error));
  }
  redirect('/tellija/raamhange');
}

export async function discardFrameworkImportAction(form: FormData): Promise<ActionOutcome> {
  const batchId = fieldText(form, 'batchId');
  try {
    await adminWrite((ctx) => discardImport(ctx, batchId, ['framework']), ['/tellija/raamhange']);
  } catch (error) {
    return fail(describeError(error));
  }
  redirect('/tellija/raamhange');
}

/* ------------------------------------------------------------------ *
 * one field at a time
 * ------------------------------------------------------------------ */

export async function updateFrameworkIdentityAction(form: FormData): Promise<ActionOutcome> {
  try {
    const changed = await adminWrite(
      (ctx) =>
        updateFrameworkIdentity(ctx, {
          title: fieldText(form, 'title'),
          procurementReference: fieldText(form, 'procurementReference'),
          agreementReference: fieldText(form, 'agreementReference'),
          buyerName: fieldText(form, 'buyerName'),
          validUntil: fieldText(form, 'validUntil') || null,
        }),
      PATHS,
    );
    return ok(changed ? 'Raamhanke andmed salvestatud.' : 'Midagi ei muutunud.');
  } catch (error) {
    return fail(describeError(error));
  }
}

export async function addLotPartnerAction(form: FormData): Promise<ActionOutcome> {
  try {
    await adminWrite(
      (ctx) =>
        addLotPartner(ctx, {
          lotId: fieldText(form, 'lotId'),
          regCode: fieldText(form, 'regCode'),
          partnerName: fieldText(form, 'partnerName'),
          contactName: fieldText(form, 'contactName'),
          contactEmail: fieldText(form, 'contactEmail'),
          unitPriceEur: fieldNumber(form, 'unitPriceEur') ?? 0,
        }),
      PATHS,
    );
    return ok('Partner lisatud järjestuse lõppu. Kontaktisik saab nüüd sisse logida.');
  } catch (error) {
    return fail(describeError(error));
  }
}

export async function updateLotPartnerContactAction(form: FormData): Promise<ActionOutcome> {
  try {
    await adminWrite(
      (ctx) =>
        updateLotPartnerContact(ctx, fieldText(form, 'lotPartnerId'), {
          contactName: fieldText(form, 'contactName'),
          contactEmail: fieldText(form, 'contactEmail'),
          unitPriceEur: fieldNumber(form, 'unitPriceEur') ?? 0,
        }),
      PATHS,
    );
    return ok('Kontaktandmed salvestatud.');
  } catch (error) {
    return fail(describeError(error));
  }
}

export async function moveLotPartnerRankAction(form: FormData): Promise<ActionOutcome> {
  const direction = fieldText(form, 'direction') === 'up' ? 'up' : 'down';
  try {
    await adminWrite(
      (ctx) => moveLotPartnerRank(ctx, fieldText(form, 'lotPartnerId'), direction),
      PATHS,
    );
    return ok('Järjestus muudetud. Avatud voore see ei mõjuta.');
  } catch (error) {
    return fail(describeError(error));
  }
}

export async function deactivateLotAction(form: FormData): Promise<ActionOutcome> {
  try {
    await adminWrite(
      (ctx) => deactivateLot(ctx, fieldText(form, 'lotId'), fieldText(form, 'reason')),
      PATHS,
    );
    return ok('Hankeosa arvatud raamhankest välja.');
  } catch (error) {
    return fail(describeError(error));
  }
}

export async function addRepresentativeAction(form: FormData): Promise<ActionOutcome> {
  try {
    await adminWrite(
      (ctx) =>
        addRepresentative(ctx, {
          partnerId: fieldText(form, 'partnerId'),
          name: fieldText(form, 'name'),
          email: fieldText(form, 'email'),
          role: fieldText(form, 'role') === 'asendaja' ? 'asendaja' : 'esindaja',
          phone: fieldText(form, 'phone'),
        }),
      PATHS,
    );
    return ok('Esindaja lisatud. Ta saab sisse logida oma e-posti aadressiga.');
  } catch (error) {
    return fail(describeError(error));
  }
}

export async function updateRepresentativeAction(form: FormData): Promise<ActionOutcome> {
  try {
    await adminWrite(
      (ctx) =>
        updateRepresentative(ctx, fieldText(form, 'representativeId'), {
          name: fieldText(form, 'name'),
          role: fieldText(form, 'role') === 'asendaja' ? 'asendaja' : 'esindaja',
          phone: fieldText(form, 'phone'),
        }),
      PATHS,
    );
    return ok('Esindaja andmed salvestatud.');
  } catch (error) {
    return fail(describeError(error));
  }
}
