/**
 * Build one round workbook to hand to the buyer team, and prove it imports.
 *
 * A one-off generator rather than a fixture: it uses the application's own
 * template builder, so the file that leaves here has the same sheets, the same
 * drop-downs and the same Selgitus page as the one the Voorud screen offers —
 * and it is then run through the real parser and preview against a seeded
 * database, so what is handed over is a file that has been *seen* to import
 * rather than one that merely looks right.
 *
 * `npx tsx scripts/make-round-file.ts [output.xlsx]`
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getDb } from '@/db';
import { lots } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { NO_EVIDENCE, type Ctx } from '@/server/context';
import { buildRoundTemplate, ROUND_TRAINING_HEADERS } from '@/server/import/round-template';
import { previewRoundImport } from '@/server/import/round-import';
import { parseXlsxSheets } from '@/server/import/xlsx';

/**
 * Four sessions in the same register as the seeded draft VOOR-2026-004: OSA-1,
 * Töötuba 1 and 2 in the trainer's own rooms, spread across counties.
 *
 * The codes are in a 5xx block. The seed uses 1xx–4xx, one block per lot, so
 * nothing here can collide with a training the test environment already has —
 * which matters because the round import refuses a code that is already in a
 * round or allocated.
 */
const TRAININGS: Array<Record<string, string>> = [
  {
    kood: 'KK-2026-501',
    hankeosa: 'OSA-1',
    nimetus: 'Töötuba 1 Narva linnavalitsuse teenistujatele',
    formaat: 'Töötuba 1',
    kuupaev: '01.12.2026',
    lopp_kuupaev: '',
    maakond: 'Ida-Viru maakond',
    asukoht: 'Koolitaja ruumid Narvas',
    sihtruhm: 'KOV ametnikud',
    osalejate_arv: '26',
    keel: 'et',
    hinnanguline_maksumus: '1450',
    markused: '',
  },
  {
    kood: 'KK-2026-502',
    hankeosa: 'OSA-1',
    nimetus: 'Töötuba 1 Haapsalu haridusasutuste juhtidele',
    formaat: 'Töötuba 1',
    kuupaev: '08.12.2026',
    lopp_kuupaev: '',
    maakond: 'Lääne maakond',
    asukoht: 'Koolitaja ruumid',
    sihtruhm: 'Haridus',
    osalejate_arv: '22',
    keel: 'et',
    hinnanguline_maksumus: '1450',
    markused: '',
  },
  {
    kood: 'KK-2026-503',
    hankeosa: 'OSA-1',
    nimetus: 'Töötuba 2 Harju maakonna KOV juhtidele',
    formaat: 'Töötuba 2',
    kuupaev: '15.12.2026',
    lopp_kuupaev: '',
    maakond: 'Harju maakond',
    asukoht: 'Koolitaja ruumid kesklinnas',
    sihtruhm: 'KOV ametnikud',
    osalejate_arv: '24',
    keel: 'et',
    hinnanguline_maksumus: '1515',
    markused: 'Eeldab Töötuba 1 läbimist',
  },
  {
    kood: 'KK-2026-504',
    hankeosa: 'OSA-1',
    nimetus: 'Töötuba 1 Paide sotsiaaltöötajatele',
    formaat: 'Töötuba 1',
    kuupaev: '18.12.2026',
    lopp_kuupaev: '',
    maakond: 'Järva maakond',
    asukoht: 'Koolitaja ruumid',
    sihtruhm: 'Sotsiaalvaldkond',
    osalejate_arv: '20',
    keel: 'et',
    hinnanguline_maksumus: '1450',
    markused: '',
  },
];

const NOTE =
  'Ettevalmistamisel — ootab avaldamist. Detsembri töötoad OSA-1 koolitustele.';

async function main(): Promise<void> {
  const out = process.argv[2] ?? join(process.cwd(), 'seed', 'naidis-voor-osa1-detsember.xlsx');
  const db = getDb();

  const lotRows = db
    .select()
    .from(lots)
    .where(eq(lots.isActive, true))
    .all()
    .sort((a, b) => a.code.localeCompare(b.code));
  const lot = lotRows.find((row) => row.code === 'OSA-1');
  if (!lot) throw new Error('OSA-1 puudub — käivita esmalt `pnpm db:seed`.');

  // The template writes the lot's own defaults into the Voor sheet, so the file
  // says what the round would do rather than what this script prefers.
  const buffer = await buildRoundTemplate({
    lotCodes: lotRows.map((row) => row.code),
    lotCode: lot.code,
    defaultCapOptions: lot.defaultCapOptions,
    trainingRows: TRAININGS.map((row) =>
      Object.fromEntries(ROUND_TRAINING_HEADERS.map((header) => [header, row[header] ?? ''])),
    ),
  });

  // The template leaves `markus` empty; fill it in the built workbook so the
  // draft arrives with the note a hand-made round would have carried.
  const withNote = await withVoorField(buffer, 'markus', NOTE);
  writeFileSync(out, withNote);

  /* --- and now read it back the way the upload does --- */
  const sheets = await parseXlsxSheets(withNote);
  const voor = sheets.get('Voor');
  const koolitused = sheets.get('Koolitused');
  if (!voor || !koolitused) throw new Error('töövihikul ei ole vajalikke lehti');

  const preview = db.transaction(
    (tx) => {
      const ctx: Ctx = {
        tx,
        at: Date.now(),
        actor: { kind: 'buyer', id: null, label: 'Faili kontroll' },
        evidence: NO_EVIDENCE,
        outbox: [],
      };
      return previewRoundImport(ctx, {
        fileName: out.split('/').pop() ?? 'voor.xlsx',
        fileSize: withNote.length,
        roundRows: voor.rows,
        trainingRows: koolitused.rows,
      });
    },
    { behavior: 'immediate' },
  );

  console.log(`Kirjutatud: ${out} (${withNote.length} baiti)`);
  console.log(`Lehed: ${[...sheets.keys()].join(', ')}`);
  console.log(
    `Eelvaade: hankeosa ${preview.round.value?.lotCode ?? '—'} (${preview.round.lotName}), ` +
      `${preview.summary.total} koolitust (${preview.summary.created} uut, ${preview.summary.updated} uuendatakse), ` +
      `vigu ${preview.summary.withErrors}, saab importida: ${preview.canApply ? 'jah' : 'ei'}`,
  );
  console.log(
    `Vooru seaded: nähtavus ${preview.round.value?.visibilityMode ?? '—'}, ` +
      `piirmäär ${preview.round.value?.capOptions ?? '—'}, ` +
      `lisatööpäevi ${preview.round.value?.extraWorkingDays ?? '—'}, ` +
      `märkus „${preview.round.value?.note ?? ''}“`,
  );
  for (const error of preview.round.errors) console.log(`  Voor: ${error.field ?? ''} ${error.message}`);
  for (const error of preview.fileErrors) console.log(`  viga: ${error.message}`);
  for (const row of preview.rows) {
    for (const error of row.errors) console.log(`  rida ${row.rowNumber}: ${error.field ?? ''} ${error.message}`);
    for (const warning of row.warnings) console.log(`  rida ${row.rowNumber} hoiatus: ${warning.message}`);
  }
  if (!preview.canApply) process.exitCode = 1;
}

/** Set one `Voor` field in an already-built workbook, leaving the rest alone. */
async function withVoorField(buffer: Buffer, field: string, value: string): Promise<Buffer> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.getWorksheet('Voor');
  if (!sheet) throw new Error('lehte „Voor“ ei ole');
  let found = false;
  sheet.eachRow((row, index) => {
    if (index === 1 || found) return;
    if (String(row.getCell(1).value ?? '').trim() === field) {
      row.getCell(2).value = value;
      found = true;
    }
  });
  if (!found) throw new Error(`välja „${field}“ ei ole lehel „Voor“`);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

void main();
