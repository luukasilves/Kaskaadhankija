/**
 * Build the cascade-round workbook to hand to the buyer team, and prove it
 * imports.
 *
 * A one-off generator rather than a fixture: it uses the application's own
 * template builder, so the file that leaves here has the same sheets, the same
 * drop-downs and the same Selgitus page as the one the Voorud screen offers —
 * and it is then run through the real parser and preview against a seeded
 * database, so what is handed over has been *seen* to import rather than
 * merely looking right.
 *
 * **One file, one draft per lot.** A round is one lot's — its ranking, its
 * response deadline and its cascade order all come from the lot [J-04] — but
 * since v2.7 the file need not be: with `hankeosa` left empty on the Voor
 * sheet, `previewRoundImport` groups the trainings by lot and the import
 * creates one draft per lot in one go [L-20]. Four rounds commissioned
 * together is what running the cascade in parallel means, and the buyer asked
 * twice to do it from one workbook — so this writes one, ready to upload on
 * the „uus voor“ screen.
 *
 * `npx tsx scripts/make-round-file.ts [output-directory]`
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getDb } from '@/db';
import { lots } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { NO_EVIDENCE, type Ctx } from '@/server/context';
import { buildRoundTemplate, ROUND_TRAINING_HEADERS } from '@/server/import/round-template';
import { previewRoundImport } from '@/server/import/round-import';
import { parseXlsxSheets } from '@/server/import/xlsx';

type TrainingRow = Record<(typeof ROUND_TRAINING_HEADERS)[number], string>;

interface RoundDraft {
  lotCode: string;
  trainings: TrainingRow[];
}

/** File name stem under the output directory. */
const SLUG = 'voor-detsember-2026';

/** The buyer's internal note, written into `Voor · markus` of every draft. */
const NOTE = 'Detsembri voorud: üks fail, iga hankeosa kohta oma mustand.';

/**
 * December 2026, one draft per lot.
 *
 * The codes are in the 5xx block, sub-blocked per lot (505–, 521–, 541–, 561–).
 * The seed uses 1xx–4xx, one block per lot, and 501–504 went out in the first
 * OSA-1 draft — so nothing here can collide with a training the test
 * environment already has, which matters because the round import refuses a
 * code that is already in a round or allocated.
 *
 * Each lot's rows stay inside that lot's own register: OSA-1 in the trainer's
 * rooms, OSA-2 in the buyer's, OSA-3 online, OSA-4 the large formats — and the
 * the buyer's estimate (`hinnanguline_maksumus`) is max participants × the
 * lot's rank-1 price per participant, rounded up to 50 € — a budget figure,
 * never a tariff; partners see their own price, not this [T-08][L-26].
 */
const ROUNDS: RoundDraft[] = [
  {
    lotCode: 'OSA-1',
    note:
      'Ettevalmistamisel — ootab avaldamist. Detsembri töötubade teine voor: jätkab faili ' +
      'voor-osa1-detsember koolitusi (KK-2026-501…504).',
    trainings: rows([
      ['KK-2026-505', 'Töötuba 1 Võru maakonna KOV ametnikele', 'Töötuba 1', '02.12.2026', '', 'Võru maakond', 'Koolitaja ruumid', 'KOV ametnikud', '18', 'et', '1050', ''],
      ['KK-2026-506', 'Töötuba 1 Kuressaare haridusasutuste töötajatele', 'Töötuba 1', '04.12.2026', '', 'Saare maakond', 'Koolitaja ruumid', 'Haridus', '19', 'et', '1150', 'Saartele lisandub logistikakulu'],
      ['KK-2026-507', 'Töötuba 2 Tartu maakonna riigiasutuste spetsialistidele', 'Töötuba 2', '09.12.2026', '', 'Tartu maakond', 'Koolitaja ruumid', 'Riigiasutused', '23', 'et', '1350', 'Eeldab Töötuba 1 läbimist'],
      ['KK-2026-508', 'Töötuba 1 Jõhvi tervishoiutöötajatele', 'Töötuba 1', '10.12.2026', '', 'Ida-Viru maakond', 'Koolitaja ruumid Jõhvis', 'Tervishoid', '22', 'ru', '1300', 'Läbiviimine vene keeles'],
      ['KK-2026-509', 'Töötuba 1 Rapla maakonna väikeettevõtjatele', 'Töötuba 1', '11.12.2026', '', 'Rapla maakond', 'Koolitaja ruumid', 'Väikeettevõtjad', '16', 'et', '950', ''],
      ['KK-2026-510', 'Töötuba 2 Pärnu maakonna sotsiaaltöötajatele', 'Töötuba 2', '16.12.2026', '', 'Pärnu maakond', 'Koolitaja ruumid', 'Sotsiaalvaldkond', '21', 'et', '1250', ''],
      ['KK-2026-511', 'Töötuba 1 Põlva maakonna haridustöötajatele', 'Töötuba 1', '17.12.2026', '', 'Põlva maakond', 'Koolitaja ruumid', 'Haridus', '20', 'et', '1200', ''],
      ['KK-2026-512', 'Töötuba 2 Kärdla ametnikele ja allasutuste juhtidele', 'Töötuba 2', '22.12.2026', '', 'Hiiu maakond', 'Koolitaja ruumid', 'KOV ametnikud', '14', 'et', '850', 'Väike grupp'],
    ]),
  },
  {
    lotCode: 'OSA-2',
    note:
      'Ettevalmistamisel — ootab avaldamist. Detsembri töötoad OSA-2 koolitustele: ruumi pakub ' +
      'tellija, koolitaja vastutab sisu ja läbiviimise eest.',
    trainings: rows([
      ['KK-2026-521', 'Töötuba 1 Kliimaministeeriumi teenistujatele', 'Töötuba 1', '01.12.2026', '', 'Harju maakond', 'Tellija ruumid, Suur-Ameerika 1', 'Riigiasutused', '26', 'et', '1050', ''],
      ['KK-2026-522', 'Töötuba 1 Kultuuriministeeriumi teenistujatele', 'Töötuba 1', '03.12.2026', '', 'Harju maakond', 'Tellija ruumid', 'Riigiasutused', '22', 'et', '900', ''],
      ['KK-2026-523', 'Töötuba 2 Siseministeeriumi osakonnajuhatajatele', 'Töötuba 2', '08.12.2026', '', 'Harju maakond', 'Tellija ruumid', 'Riigiasutused', '19', 'et', '750', 'Eeldab Töötuba 1 läbimist'],
      ['KK-2026-524', 'Töötuba 1 Statistikaameti analüütikutele', 'Töötuba 1', '10.12.2026', '', 'Harju maakond', 'Tellija ruumid, Tatari 51', 'Riigiasutused', '24', 'et', '950', ''],
      ['KK-2026-525', 'Töötuba 1 Viljandi maakonna KOV ametnikele', 'Töötuba 1', '15.12.2026', '', 'Viljandi maakond', 'Viljandi, tellija ruumid', 'KOV ametnikud', '21', 'et', '850', ''],
      ['KK-2026-526', 'Töötuba 1 Valga maakonna sotsiaaltöötajatele', 'Töötuba 1', '17.12.2026', '', 'Valga maakond', 'Valga, tellija ruumid', 'Sotsiaalvaldkond', '18', 'et', '750', ''],
      ['KK-2026-527', 'Töötuba 2 Jõgeva maakonna haridusasutuste juhtidele', 'Töötuba 2', '22.12.2026', '', 'Jõgeva maakond', 'Jõgeva, tellija ruumid', 'Haridus', '20', 'et', '800', ''],
    ]),
  },
  {
    lotCode: 'OSA-3',
    note:
      'Ettevalmistamisel — ootab avaldamist. Detsembri veebikoolitused OSA-3 koolitustele. ' +
      'Platvorm on veerus asukoht.',
    trainings: rows([
      ['KK-2026-541', 'Töötuba 1 veebis Päästeameti spetsialistidele', 'Töötuba 1', '02.12.2026', '', 'Veebipõhine', 'MS Teams', 'Riigiasutused', '48', 'et', '800', ''],
      ['KK-2026-542', 'Töötuba 1 veebis Transpordiameti teenistujatele', 'Töötuba 1', '04.12.2026', '', 'Veebipõhine', 'MS Teams', 'Riigiasutused', '42', 'et', '700', ''],
      ['KK-2026-543', 'Töötuba 2 veebis Sotsiaalkindlustusameti juhtidele', 'Töötuba 2', '09.12.2026', '', 'Veebipõhine', 'MS Teams', 'Riigiasutused', '34', 'et', '550', 'Eeldab Töötuba 1 läbimist'],
      ['KK-2026-544', 'Töötuba 1 veebis lasteaiaõpetajatele', 'Töötuba 1', '11.12.2026', '', 'Veebipõhine', 'MS Teams', 'Haridus', '65', 'et', '1050', 'Suurem grupp'],
      ['KK-2026-545', 'Töötuba 1 veebis vene keeles sotsiaaltöötajatele', 'Töötuba 1', '16.12.2026', '', 'Veebipõhine', 'MS Teams', 'Sotsiaalvaldkond', '38', 'ru', '650', 'Läbiviimine vene keeles'],
      ['KK-2026-546', 'Töötuba 2 veebis apteekritele ja proviisoritele', 'Töötuba 2', '18.12.2026', '', 'Veebipõhine', 'Zoom', 'Tervishoid', '40', 'et', '650', ''],
      ['KK-2026-547', 'Töötuba 1 veebis inglise keeles rahvusvahelistele meeskondadele', 'Töötuba 1', '22.12.2026', '', 'Veebipõhine', 'MS Teams', 'Riigiasutused', '30', 'en', '500', 'Läbiviimine inglise keeles'],
    ]),
  },
  {
    lotCode: 'OSA-4',
    note:
      'Ettevalmistamisel — ootab avaldamist. Detsembri suursündmused OSA-4 koolitustele: ' +
      'asukohad täpsustatakse võitjaga kokkuleppel.',
    trainings: rows([
      ['KK-2026-561', 'Eesti.ai kaasloomepäev riigiasutuste juhtidele', 'Suursündmus', '09.12.2026', '', 'Harju maakond', 'Tallinn, täpsustatakse kokkuleppel', 'Riigiasutused', '220', 'et', '5950', 'Vajalik modereerimine ja registreerimine'],
      ['KK-2026-562', 'Eesti.ai häkaton KOV arendusmeeskondadele', 'Suursündmus', '15.12.2026', '16.12.2026', 'Tartu maakond', 'Tartu, täpsustatakse kokkuleppel', 'KOV ametnikud', '110', 'et', '3000', 'Kahepäevane, vajalik tehniline tugi'],
      ['KK-2026-563', 'Eesti.ai loeng haridusasutuste juhtidele', 'Muu formaat', '17.12.2026', '', 'Viljandi maakond', 'Viljandi, täpsustatakse kokkuleppel', 'Haridus', '240', 'et', '6500', ''],
      ['KK-2026-564', 'Eesti.ai konverentsipäev sotsiaalvaldkonna spetsialistidele', 'Suursündmus', '22.12.2026', '', 'Pärnu maakond', 'Pärnu kontserdimaja', 'Sotsiaalvaldkond', '180', 'et', '4900', ''],
    ]),
  },
];

/**
 * Positional rows, because thirteen repeated keys per training hid the data.
 * `hankeosa` is filled from the round, so no row can name the wrong lot.
 */
function rows(
  tuples: ReadonlyArray<readonly [string, string, string, string, string, string, string, string, string, string, string, string]>,
): TrainingRow[] {
  return tuples.map(
    ([kood, nimetus, formaat, kuupaev, lopp_kuupaev, maakond, asukoht, sihtruhm, osalejate_arv, keel, hinnanguline_maksumus, markused]) => ({
      kood,
      hankeosa: '',
      nimetus,
      formaat,
      kuupaev,
      lopp_kuupaev,
      periood_algus: '',
      periood_lopp: '',
      maakond,
      asukoht,
      sihtruhm,
      osalejate_arv,
      ruhma_suurus: '',
      ruhmi: '',
      keel,
      hinnanguline_maksumus,
      markused,
    }),
  );
}

/**
 * The volume order [L-28]: one cluster row, its own file — a round is of one
 * kind [V-09], so a cluster cannot share a draft with the dated rows above.
 * 500 small-business owners in Harju county over the first quarter of 2027,
 * groups of fifty: the file the buyer team asked for when they asked whether
 * they could „tellida ettevõtjatele näiteks viiesajale … perioodil“.
 */
const CLUSTER_SLUG = 'klaster-osa2-talv-2027';
const CLUSTER_NOTE = 'Mahuline tellimus: rühmad on vahetatavad, toimumisajad lepitakse kokku pärast jaotust.';
const CLUSTER_ROWS: TrainingRow[] = [
  {
    kood: 'KL-2027-001',
    hankeosa: 'OSA-2',
    nimetus: 'Töötuba 1 Harjumaa väikeettevõtjatele (mahuline tellimus, I kvartal 2027)',
    formaat: 'Töötuba 1',
    kuupaev: '',
    lopp_kuupaev: '',
    periood_algus: '11.01.2027',
    periood_lopp: '31.03.2027',
    maakond: 'Harju maakond',
    asukoht: 'Tellija määratud asukohad Harjumaal',
    sihtruhm: 'Väikeettevõtjad',
    osalejate_arv: '500',
    ruhma_suurus: '50',
    ruhmi: '10',
    keel: 'et',
    hinnanguline_maksumus: '20000',
    markused: 'Klaster: 10 rühma × kuni 50 osalejat; iga rühm on eraldi koolitus, mille aeg lepitakse kokku täitjaga',
  },
];

async function main(): Promise<void> {
  const outDir = process.argv[2] ?? join(process.cwd(), 'data', 'valjund');
  mkdirSync(outDir, { recursive: true });
  const db = getDb();

  const lotRows = db
    .select({ code: lots.code, defaultCapOptions: lots.defaultCapOptions })
    .from(lots)
    .where(eq(lots.isActive, true))
    .all()
    .sort((a, b) => a.code.localeCompare(b.code));
  const lotCodes = lotRows.map((row) => row.code);
  for (const draft of ROUNDS) {
    if (!lotCodes.includes(draft.lotCode)) throw new Error(`Hankeosa ${draft.lotCode} puudub andmebaasis.`);
  }

  const out = join(outDir, `${SLUG}.xlsx`);
  // One file, no lot on the Voor sheet: the import groups the rows by lot and
  // makes one draft per lot [L-20]. The cap options are left to each lot.
  const trainingRows = ROUNDS.flatMap((draft) => draft.trainings.map((row) => ({ ...row, hankeosa: draft.lotCode })));
  const buffer = await buildRoundTemplate({
    lotCode: '',
    lotCodes,
    defaultCapOptions: null,
    trainingRows,
  });
  const withNote = await withVoorField(buffer, 'markus', NOTE);
  writeFileSync(out, withNote);
  console.log(`→ ${out} (${(withNote.byteLength / 1024).toFixed(1)} kB, ${trainingRows.length} koolitust, ${ROUNDS.length} mustandit)`);

  const expected = ROUNDS.map((draft) => ({ lotCode: draft.lotCode, count: draft.trainings.length }));
  await report(db, out, withNote, expected);

  // The cluster file: one row, ten groups once imported [L-28].
  const clusterOut = join(outDir, `${CLUSTER_SLUG}.xlsx`);
  const clusterBuffer = await withVoorField(
    await buildRoundTemplate({ lotCode: 'OSA-2', lotCodes, defaultCapOptions: null, trainingRows: CLUSTER_ROWS }),
    'markus',
    CLUSTER_NOTE,
  );
  writeFileSync(clusterOut, clusterBuffer);
  console.log(`→ ${clusterOut} (${(clusterBuffer.byteLength / 1024).toFixed(1)} kB, 1 klaster)`);
  await report(db, clusterOut, clusterBuffer, [{ lotCode: 'OSA-2', count: 10 }]);
}

async function report(
  db: ReturnType<typeof getDb>,
  out: string,
  buffer: Buffer,
  expected: ReadonlyArray<{ lotCode: string; count: number }>,
): Promise<boolean> {
  const fileName = out.split('/').pop() ?? 'voor.xlsx';
  const sheets = await parseXlsxSheets(buffer);
  const voor = sheets.get('Voor');
  const koolitused = sheets.get('Koolitused');
  if (!voor || !koolitused) throw new Error(`${fileName}: töövihikul ei ole vajalikke lehti`);

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
        fileName,
        fileSize: buffer.length,
        roundRows: voor.rows,
        trainingRows: koolitused.rows,
      });
    },
    { behavior: 'immediate' },
  );

  console.log(`\n${fileName} — ${buffer.length} baiti, lehed: ${[...sheets.keys()].join(', ')}`);
  const groups = preview.groups ?? [];
  console.log(
    `  Eelvaade: ${groups.length} mustandit (${groups.map((g) => `${g.lotCode}: ${g.count}`).join(', ') || '—'}), ` +
      `${preview.summary.total} koolitust (${preview.summary.created} uut, ${preview.summary.updated} uuendatakse), ` +
      `vigu ${preview.summary.withErrors}, saab importida: ${preview.canApply ? 'jah' : 'ei'}`,
  );
  console.log(
    `  Vooru seaded: nähtavus ${preview.round.value?.visibilityMode ?? '—'}, ` +
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
  // The multi-lot file leaves the lot empty on purpose; a single-lot file names it.
  if (expected.length > 1 && preview.round.value?.lotCode !== null) {
    console.log('  KONTROLL: lehel „Voor“ pidi hankeosa olema tühi — üks mustand iga hankeosa kohta');
    return false;
  }
  const actual = groups.map((g) => `${g.lotCode}:${g.count}`).join(',');
  const wanted = expected.map((g) => `${g.lotCode}:${g.count}`).join(',');
  if (actual !== wanted) {
    console.log(`  KONTROLL: oodati mustandeid ${wanted}, eelvaade andis ${actual || '—'}`);
    return false;
  }
  // Every row must be new: a code the environment already knows would make the
  // all-or-nothing import fail on the buyer's machine, not on this one.
  if (preview.summary.updated > 0) {
    console.log(`  KONTROLL: ${preview.summary.updated} koodi on juba olemas — vali uus koodiblokk`);
    return false;
  }
  return preview.canApply;
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
