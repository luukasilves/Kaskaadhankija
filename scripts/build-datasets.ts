/**
 * Validate the committed sample datasets and derive their .xlsx twins.
 *
 * The CSV files in `seed/` are the source of truth — they are what the
 * procurement team edits and what the seed loads. The spreadsheets are a
 * convenience for reading and editing in Excel, so they are generated, never
 * hand-maintained.
 *
 * The script fails if a CSV no longer validates, which makes a broken sample
 * dataset a build error rather than a runtime surprise.
 *
 *   pnpm datasets:build
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv } from '../src/server/import/csv';
import { buildXlsx } from '../src/server/import/xlsx';
import {
  countRows,
  parsePartnerRows,
  parseRepresentativeRows,
  parseTrainingRows,
  type ParsedRow,
  type RowDiagnostic,
} from '../src/domain/import-rows';

const SEED_DIR = join(process.cwd(), 'seed');
const LOT_CODES = ['OSA-1', 'OSA-2', 'OSA-3', 'OSA-4'];

function report<T>(
  label: string,
  rows: ParsedRow<T>[],
  fileErrors: RowDiagnostic[],
): boolean {
  const counts = countRows(rows);
  console.log(
    `${label}: ${counts.total} rida, ${counts.valid} korras, ${counts.withErrors} veaga, ${counts.withWarnings} hoiatusega`,
  );
  for (const error of fileErrors) {
    console.log(`  faili märkus: ${error.message}`);
  }
  for (const row of rows) {
    for (const error of row.errors) {
      console.log(`  rida ${row.rowNumber} VIGA ${error.field ?? ''}: ${error.message}`);
    }
    for (const warning of row.warnings) {
      console.log(`  rida ${row.rowNumber} hoiatus ${warning.field ?? ''}: ${warning.message}`);
    }
  }
  return counts.withErrors === 0;
}

async function buildTwin(csvName: string, sheetName: string): Promise<void> {
  const path = join(SEED_DIR, csvName);
  const { headers, rows } = parseCsv(readFileSync(path).toString('utf8'));
  const buffer = await buildXlsx(sheetName, headers, rows);
  const out = path.replace(/\.csv$/, '.xlsx');
  writeFileSync(out, buffer);
  console.log(`  → ${out} (${(buffer.byteLength / 1024).toFixed(1)} kB)`);
}

async function main(): Promise<void> {
  let ok = true;

  const trainingCsv = parseCsv(
    readFileSync(join(SEED_DIR, 'naidis-koolituskalender.csv')).toString('utf8'),
  );
  const trainings = parseTrainingRows(trainingCsv.rows, { knownLotCodes: LOT_CODES });
  ok = report('naidis-koolituskalender.csv', trainings.rows, trainings.fileErrors) && ok;
  await buildTwin('naidis-koolituskalender.csv', 'Koolituskalender');

  const partnerCsv = parseCsv(
    readFileSync(join(SEED_DIR, 'naidis-partnerid.csv')).toString('utf8'),
  );
  const partners = parsePartnerRows(partnerCsv.rows, { knownLotCodes: LOT_CODES });
  ok = report('naidis-partnerid.csv', partners.rows, partners.fileErrors) && ok;
  await buildTwin('naidis-partnerid.csv', 'Raamlepingu partnerid');

  const representativeCsv = parseCsv(
    readFileSync(join(SEED_DIR, 'naidis-esindajad.csv')).toString('utf8'),
  );
  const representatives = parseRepresentativeRows(representativeCsv.rows, {
    knownRegCodes: partners.rows.map((r) => r.value?.regCode ?? '').filter(Boolean),
  });
  ok = report('naidis-esindajad.csv', representatives.rows, representatives.fileErrors) && ok;
  await buildTwin('naidis-esindajad.csv', 'Esindajad');

  // Per-lot summary, so a change to the dataset is easy to eyeball.
  const byLot = new Map<string, number>();
  for (const row of trainings.rows) {
    if (!row.value) continue;
    byLot.set(row.value.lotCode, (byLot.get(row.value.lotCode) ?? 0) + 1);
  }
  console.log(
    'Koolitusi hankeosa kaupa: ' +
      [...byLot.entries()].sort().map(([code, n]) => `${code}=${n}`).join(', '),
  );

  if (!ok) {
    console.error('\nNäidisandmete failides on vigu — paranda enne kasutamist.');
    process.exit(1);
  }
  console.log('\nNäidisandmed on korras.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
