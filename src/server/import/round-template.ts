/**
 * The cascade-round workbook template [L-20], prefilled with what the system
 * knows: the lot's unassigned trainings in the calendar-import layout, so the
 * team removes rows and edits values rather than typing a schedule in from
 * nothing. Drop-down lists keep the enumerated cells to their allowed values.
 */

import { TRAINING_COLUMNS, TRAINING_OPTIONAL_COLUMNS } from '@/domain/import-rows';
import { CAP_OPTIONS_SHEET_WORDS, VISIBILITY_SHEET_WORDS } from '@/domain/round-definition';
import { TARGET_GROUPS, type CapOptions } from '@/domain/round-statuses';
import { COUNTIES, LANGUAGE_LABELS, WORKSHOP_TYPE_LABELS } from '@/domain/statuses';
import { buildWorkbook, type WorkbookSheet } from './xlsx';

/** The calendar import's columns, in the order the buyer's documentation lists them. */
export const ROUND_TRAINING_HEADERS = [
  'kood',
  'hankeosa',
  'nimetus',
  'formaat',
  'kuupaev',
  'lopp_kuupaev',
  'maakond',
  'asukoht',
  'sihtruhm',
  'osalejate_arv',
  'keel',
  'hinnanguline_maksumus',
  'markused',
] as const;

// Every required and optional column is in the list above, in the documented order.
const known = new Set<string>([...TRAINING_COLUMNS, ...TRAINING_OPTIONAL_COLUMNS]);
for (const header of ROUND_TRAINING_HEADERS) {
  if (!known.has(header)) throw new Error(`round template: unknown column ${header}`);
}

const TEMPLATE_ROWS = 500;

function columnLetter(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export interface RoundTemplateInput {
  lotCodes: readonly string[];
  lotCode: string;
  defaultCapOptions: CapOptions;
  /** prefilled trainings, keyed by the headers above */
  trainingRows: ReadonlyArray<Record<string, string>>;
}

export async function buildRoundTemplate(input: RoundTemplateInput): Promise<Buffer> {
  const voor: WorkbookSheet = {
    name: 'Voor',
    headers: ['väli', 'väärtus'],
    rows: [
      { väli: 'hankeosa', väärtus: input.lotCode },
      { väli: 'nahtavus', väärtus: VISIBILITY_SHEET_WORDS.dynamic },
      { väli: 'piirmaara_valikud', väärtus: CAP_OPTIONS_SHEET_WORDS[input.defaultCapOptions] },
      { väli: 'lisatoopaevad', väärtus: '0' },
      { väli: 'avaldamine', väärtus: '' },
      { väli: 'vastamistahtaeg', väärtus: '' },
      { väli: 'markus', väärtus: '' },
    ],
    validations: [
      { range: 'B2:B2', values: input.lotCodes },
      { range: 'B3:B3', values: Object.values(VISIBILITY_SHEET_WORDS) },
      { range: 'B4:B4', values: Object.values(CAP_OPTIONS_SHEET_WORDS) },
    ],
  };

  const col = (header: string) => columnLetter(ROUND_TRAINING_HEADERS.indexOf(header as (typeof ROUND_TRAINING_HEADERS)[number]));
  const range = (header: string) => `${col(header)}2:${col(header)}${TEMPLATE_ROWS}`;
  const koolitused: WorkbookSheet = {
    name: 'Koolitused',
    headers: ROUND_TRAINING_HEADERS,
    rows: input.trainingRows,
    validations: [
      { range: range('hankeosa'), values: input.lotCodes },
      { range: range('formaat'), values: Object.values(WORKSHOP_TYPE_LABELS) },
      { range: range('maakond'), values: [...COUNTIES] },
      { range: range('sihtruhm'), values: Object.values(TARGET_GROUPS) },
      { range: range('keel'), values: Object.keys(LANGUAGE_LABELS) },
    ],
  };

  const selgitus: WorkbookSheet = {
    name: 'Selgitus',
    headers: ['Leht / veerg', 'Tähendus'],
    rows: [
      { 'Leht / veerg': 'Voor', Tähendus: 'Ühe kaskaadivooru parameetrid. Fail loob rakenduses MUSTANDI; avaldamine, tähtaeg ja partnerite järjestuse külmutamine toimuvad rakenduses.' },
      { 'Leht / veerg': 'Voor · hankeosa', Tähendus: `Kohustuslik. Üks hankeosa: ${input.lotCodes.join(', ')}. Kõik lehe „Koolitused“ read peavad olema samas hankeosas.` },
      { 'Leht / veerg': 'Voor · nahtavus', Tähendus: 'dünaamiline (vaikimisi) või suletud — kas partner näeb eesõigusega märgete mõju.' },
      { 'Leht / veerg': 'Voor · piirmaara_valikud', Tähendus: 'puudub, koolitused, osalejad või mõlemad — millise liigi ülempiiri partnerid võivad seada. Tühi = hankeosa vaikeväärtus.' },
      { 'Leht / veerg': 'Voor · lisatoopaevad', Tähendus: 'Täisarv 0–20: mitu tööpäeva lisaks hankeosa vaikimisi vastamisajale antakse avaldamisel. Pakutakse avaldamisvormil ette.' },
      { 'Leht / veerg': 'Voor · avaldamine', Tähendus: 'Vabatahtlik. Kavandatud avaldamise aeg, nt 06.10.2026 või 06.10.2026 10:15. Pakutakse avaldamisvormil ette; päris hetke määrab avaldamine.' },
      { 'Leht / veerg': 'Voor · vastamistahtaeg', Tähendus: 'Vabatahtlik. Kavandatud vastamistähtaeg, nt 09.10.2026 17:00. Ainult kuupäeva puhul kasutatakse hankeosa kellaaega. Kas see VÕI lisatoopaevad, mitte mõlemad.' },
      { 'Leht / veerg': 'Voor · markus', Tähendus: 'Tellija sisemärkus vooru kohta, kuni 400 tähemärki. Partnerid seda ei näe.' },
      { 'Leht / veerg': 'Koolitused', Tähendus: 'Koolituskalendri impordi veerud. Olemasoleva koodiga rida uuendab koolitust (kui see ei ole juba voorus või määratud); uue koodiga rida loob koolituse. Kõik read lähevad loodavasse vooru.' },
      { 'Leht / veerg': 'Koolitused · kood', Tähendus: 'Kujul KK-2026-101. Kood on koolituse püsiv tunnus ka uude vooru andmisel.' },
      { 'Leht / veerg': 'Koolitused · kuupaev', Tähendus: '07.10.2026 või 2026-10-07; lopp_kuupaev mitmepäevase sündmuse puhul.' },
      { 'Leht / veerg': 'Koolitused · formaat', Tähendus: Object.values(WORKSHOP_TYPE_LABELS).join(', ') },
      { 'Leht / veerg': 'Koolitused · sihtruhm', Tähendus: Object.values(TARGET_GROUPS).join(', ') },
      { 'Leht / veerg': 'Koolitused · keel', Tähendus: Object.keys(LANGUAGE_LABELS).join(', ') },
      { 'Leht / veerg': 'Reegel', Tähendus: 'Import on kõik-või-midagi: ühegi veaga rea, teise hankeosa koolituse või juba voorus oleva koolituse puhul vooru ei looda, kuni fail on parandatud.' },
    ],
  };

  return buildWorkbook([voor, koolitused, selgitus]);
}
