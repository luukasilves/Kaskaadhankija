/**
 * The framework-data workbook, written out [L-21].
 *
 * Downloaded **filled in with the current state**, not as an empty form: the
 * admin edits one contact address and drops the file back, and blank cells on
 * the Hankeosad sheet keep whatever the lot already had. That round trip is
 * what makes an upload safe to do casually.
 *
 * Also what `scripts/build-datasets.ts` writes to `seed/naidis-raamhange.xlsx`,
 * so the sample procurement exists as a file a tester can open, edit — their
 * own address on a partner, say — and upload back.
 */

import { CAP_OPTIONS_SHEET_WORDS, VISIBILITY_SHEET_WORDS } from '@/domain/round-definition';
import { FRAMEWORK_FIELDS, LOT_HEADERS, lotSheetRow, type LotRow } from '@/domain/framework-definition';
import type { FrameworkIdentity } from '@/domain/framework';
import { PARTNER_COLUMNS, REPRESENTATIVE_COLUMNS, REPRESENTATIVE_OPTIONAL_COLUMNS } from '@/domain/import-rows';
import { formatIsoDay } from '@/domain/format';
import { buildWorkbook, type WorkbookSheet } from './xlsx';

export interface FrameworkWorkbookInput {
  framework: FrameworkIdentity;
  lots: readonly LotRow[];
  /** ranking rows, already in the sheet's own column names */
  partnerRows: ReadonlyArray<Record<string, string>>;
  /** extra representatives beyond the official contacts */
  representativeRows?: ReadonlyArray<Record<string, string>>;
}

const KEY_VALUE_HEADERS = ['väli', 'väärtus'] as const;

function frameworkSheet(framework: FrameworkIdentity): WorkbookSheet {
  const values: Record<(typeof FRAMEWORK_FIELDS)[number], string> = {
    nimetus: framework.title,
    viitenumber: framework.procurementReference,
    raamlepingu_number: framework.agreementReference,
    kehtib_kuni: framework.validUntil ? formatIsoDay(framework.validUntil) : '',
    tellija: framework.buyerName,
  };
  return {
    name: 'Raamleping',
    headers: KEY_VALUE_HEADERS,
    rows: FRAMEWORK_FIELDS.map((field) => ({ väli: field, väärtus: values[field] })),
  };
}

function lotSheet(lotRows: readonly LotRow[]): WorkbookSheet {
  return {
    name: 'Hankeosad',
    headers: LOT_HEADERS,
    rows: lotRows.map(lotSheetRow),
    validations: [
      { range: 'H2:H200', values: Object.values(VISIBILITY_SHEET_WORDS) },
      { range: 'I2:I200', values: Object.values(CAP_OPTIONS_SHEET_WORDS) },
    ],
  };
}

const EXPLANATION_HEADERS = ['leht', 'väli', 'selgitus'] as const;

const EXPLANATION_ROWS: ReadonlyArray<Record<string, string>> = [
  { leht: 'Raamleping', väli: 'nimetus', selgitus: 'Raamlepingu nimi, nagu see hankes on.' },
  { leht: 'Raamleping', väli: 'viitenumber', selgitus: 'Riigihanke viitenumber, ainult numbrid (nt 10567384).' },
  { leht: 'Raamleping', väli: 'kehtib_kuni', selgitus: 'Kuupäev kujul pp.kk.aaaa. Tühi tähendab tähtajatut.' },
  { leht: 'Hankeosad', väli: 'kood', selgitus: 'Hankeosa kood, nt OSA-1. Selle järgi hankeosa leitakse või luuakse.' },
  {
    leht: 'Hankeosad',
    väli: '(tühi lahter)',
    selgitus:
      'Tühi lahter tähendab „jäta muutmata“. Nii ei pea ühe kontakti parandamiseks kõiki seadeid uuesti kirjutama.',
  },
  {
    leht: 'Hankeosad',
    väli: 'tahtaja_kellaaeg',
    selgitus: 'Kellaaeg kujul 17:00. Hoia lahter Excelis tekstina, muidu tekib sellest kuupäev.',
  },
  {
    leht: 'Hankeosad',
    väli: '(puuduv hankeosa)',
    selgitus:
      'Failist puuduvat hankeosa ei kustutata kunagi. Kui valid „lõpeta puuduvad“, arvatakse see raamhankest välja ainult siis, kui tal ei ole ühtki mustandit, avatud ega ootel vooru.',
  },
  { leht: 'Partnerid', väli: 'hankeosa', selgitus: 'Hankeosa kood. Uue hankeosa puhul lisa see kõigepealt lehele „Hankeosad“.' },
  { leht: 'Partnerid', väli: 'koht', selgitus: 'Koht järjestuses; 1 tähendab eesõigust. Kohad on hankeosa piires unikaalsed.' },
  {
    leht: 'Partnerid',
    väli: 'e_post',
    selgitus:
      'Raamlepingu kontaktisiku aadress. Sellele lähevad vooru teated JA sellega saab partner sisse logida — üks aadress esindab ühte ettevõtet.',
  },
  {
    leht: 'Partnerid',
    väli: '(puuduv partner)',
    selgitus:
      'Valik „lõpeta puuduvad“ lõpetab failist puuduvate partnerite osaluse nendes hankeosades, mida fail puudutab. Avatud voore see ei muuda — iga voor kasutab avaldamisel külmutatud järjestust.',
  },
  {
    leht: 'Esindajad',
    väli: '(kogu leht)',
    selgitus:
      'Vabatahtlik. Siia käivad lisainimesed peale raamlepingu kontaktisiku — asendajad ja teised, kes tohivad ettevõtte eest vastata. Kontaktisikut ennast siia lisama ei pea.',
  },
];

/** The whole workbook, ready to send as a download. */
export async function buildFrameworkWorkbook(input: FrameworkWorkbookInput): Promise<Buffer> {
  const lotCodes = input.lots.map((lot) => lot.code);
  const sheets: WorkbookSheet[] = [
    frameworkSheet(input.framework),
    lotSheet(input.lots),
    {
      name: 'Partnerid',
      headers: PARTNER_COLUMNS,
      rows: input.partnerRows,
      validations: lotCodes.length > 0 ? [{ range: 'C2:C500', values: lotCodes }] : undefined,
    },
    {
      name: 'Esindajad',
      headers: [...REPRESENTATIVE_COLUMNS, ...REPRESENTATIVE_OPTIONAL_COLUMNS],
      rows: input.representativeRows ?? [],
      validations: [{ range: 'D2:D500', values: ['esindaja', 'asendaja'] }],
    },
    { name: 'Selgitus', headers: EXPLANATION_HEADERS, rows: EXPLANATION_ROWS },
  ];
  return buildWorkbook(sheets);
}
