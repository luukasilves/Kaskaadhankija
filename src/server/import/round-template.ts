/**
 * The cascade-round workbook template [L-20], prefilled with what the system
 * knows: the lot's unassigned trainings in the calendar-import layout, so the
 * team removes rows and edits values rather than typing a schedule in from
 * nothing. Drop-down lists keep the enumerated cells to their allowed values.
 */

import { nominalGroupSize, totalParticipants, type DateKind } from '@/domain/clusters';
import { formatIsoDay } from '@/domain/format';
import { TRAINING_COLUMNS, TRAINING_OPTIONAL_COLUMNS } from '@/domain/import-rows';
import { CAP_OPTIONS_SHEET_WORDS, VISIBILITY_SHEET_WORDS } from '@/domain/round-definition';
import { TARGET_GROUPS, type CapOptions, type TargetGroup } from '@/domain/round-statuses';
import { COUNTIES, LANGUAGE_LABELS, WORKSHOP_TYPE_LABELS, type WorkshopType } from '@/domain/statuses';
import { buildWorkbook, type WorkbookSheet } from './xlsx';

/** What the template needs to know about a training it prefills. */
export interface TemplateTraining {
  code: string;
  title: string;
  workshopType: WorkshopType;
  eventDate: string;
  eventEnd: string | null;
  dateKind: DateKind;
  clusterCode: string | null;
  groupIndex: number | null;
  county: string;
  locationText: string;
  targetGroup: TargetGroup;
  participantCount: number;
  language: string;
  estimatedValueEur: number;
  notes: string;
}

/**
 * The prefilled rows for a lot's free trainings [L-20]. A cluster's free groups
 * collapse back into the **one row** the buyer wrote — the free groups' count
 * and participants, the period, the group size — so the file reads as an
 * order and re-imports as exactly those groups, never as dated rows [L-28].
 */
export function templateRowsFor(available: readonly TemplateTraining[], lotCode: string): Array<Record<string, string>> {
  const sorted = [...available].sort((a, b) => a.eventDate.localeCompare(b.eventDate) || a.code.localeCompare(b.code));
  const entries: Array<TemplateTraining | TemplateTraining[]> = [];
  const seenClusters = new Set<string>();
  for (const t of sorted) {
    if (t.dateKind === 'period' && t.clusterCode) {
      if (seenClusters.has(t.clusterCode)) continue;
      seenClusters.add(t.clusterCode);
      entries.push(sorted.filter((g) => g.clusterCode === t.clusterCode).sort((a, b) => (a.groupIndex ?? 0) - (b.groupIndex ?? 0)));
    } else {
      entries.push(t);
    }
  }
  const dotted = (iso: string | null) => (iso ? formatIsoDay(iso) : '');
  return entries.map((entry) => {
    const t = Array.isArray(entry) ? entry[0]! : entry;
    const groups = Array.isArray(entry) ? entry : null;
    const likes = groups?.map((g) => ({ groupIndex: g.groupIndex ?? 0, participantCount: g.participantCount })) ?? [];
    const estimate = groups ? groups.reduce((sum, g) => sum + g.estimatedValueEur, 0) : t.estimatedValueEur;
    return {
      kood: groups ? (t.clusterCode ?? t.code) : t.code,
      hankeosa: lotCode,
      nimetus: t.title,
      formaat: WORKSHOP_TYPE_LABELS[t.workshopType],
      kuupaev: groups ? '' : dotted(t.eventDate),
      lopp_kuupaev: groups ? '' : dotted(t.eventEnd),
      periood_algus: groups ? dotted(t.eventDate) : '',
      periood_lopp: groups ? dotted(t.eventEnd) : '',
      maakond: t.county,
      asukoht: t.locationText,
      sihtruhm: TARGET_GROUPS[t.targetGroup],
      osalejate_arv: String(groups ? totalParticipants(likes) : t.participantCount),
      ruhma_suurus: groups ? String(nominalGroupSize(likes)) : '',
      ruhmi: groups ? String(groups.length) : '',
      keel: t.language,
      hinnanguline_maksumus: estimate > 0 ? String(Math.round(estimate * 100) / 100) : '',
      markused: t.notes,
    };
  });
}

/** The calendar import's columns, in the order the buyer's documentation lists them. */
export const ROUND_TRAINING_HEADERS = [
  'kood',
  'hankeosa',
  'nimetus',
  'formaat',
  'kuupaev',
  'lopp_kuupaev',
  'periood_algus',
  'periood_lopp',
  'maakond',
  'asukoht',
  'sihtruhm',
  'osalejate_arv',
  'ruhma_suurus',
  'ruhmi',
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
  /** empty for a file that creates one draft per lot [L-20] */
  lotCode: string;
  /** null leaves the cell empty — each draft then takes its lot's default */
  defaultCapOptions: CapOptions | null;
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
      { väli: 'piirmaara_valikud', väärtus: input.defaultCapOptions ? CAP_OPTIONS_SHEET_WORDS[input.defaultCapOptions] : '' },
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
      { 'Leht / veerg': 'Voor · hankeosa', Tähendus: `Üks hankeosa (${input.lotCodes.join(', ')}) — siis peavad kõik lehe „Koolitused“ read olema selles hankeosas — VÕI tühi: siis luuakse iga lehel esineva hankeosa kohta oma mustand ühe impordiga. Voor ise on alati ühe hankeosa oma.` },
      { 'Leht / veerg': 'Voor · nahtavus', Tähendus: 'dünaamiline (vaikimisi) või suletud — kas partner näeb eesõigusega märgete mõju.' },
      { 'Leht / veerg': 'Voor · piirmaara_valikud', Tähendus: 'puudub, koolitused, osalejad või mõlemad — millise liigi ülempiiri partnerid võivad seada. Tühi = hankeosa vaikeväärtus.' },
      { 'Leht / veerg': 'Voor · lisatoopaevad', Tähendus: 'Täisarv 0–20: mitu tööpäeva lisaks hankeosa vaikimisi vastamisajale antakse avaldamisel. Pakutakse avaldamisvormil ette.' },
      { 'Leht / veerg': 'Voor · avaldamine', Tähendus: 'Vabatahtlik. Kavandatud avaldamise aeg, nt 06.10.2026 või 06.10.2026 10:15. Pakutakse avaldamisvormil ette; päris hetke määrab avaldamine.' },
      { 'Leht / veerg': 'Voor · vastamistahtaeg', Tähendus: 'Vabatahtlik. Kavandatud vastamistähtaeg, nt 09.10.2026 17:00. Ainult kuupäeva puhul kasutatakse hankeosa kellaaega. Kas see VÕI lisatoopaevad, mitte mõlemad.' },
      { 'Leht / veerg': 'Voor · markus', Tähendus: 'Tellija sisemärkus vooru kohta, kuni 400 tähemärki. Partnerid seda ei näe.' },
      { 'Leht / veerg': 'Koolitused', Tähendus: 'Koolituskalendri impordi veerud. Olemasoleva koodiga rida uuendab koolitust (kui see ei ole juba voorus või määratud); uue koodiga rida loob koolituse. Kõik read lähevad loodavasse vooru.' },
      { 'Leht / veerg': 'Koolitused · kood', Tähendus: 'Kujul KK-2026-101 (kindla kuupäevaga koolitus) või KL-2026-001 (klaster — mahuline tellimus). Kood on püsiv tunnus ka uude vooru andmisel. Rühma koodi (KL-2026-001-07) failis ei kirjutata.' },
      { 'Leht / veerg': 'Koolitused · kuupaev', Tähendus: '07.10.2026 või 2026-10-07; lopp_kuupaev mitmepäevase sündmuse puhul. Klastri real jäta tühjaks.' },
      { 'Leht / veerg': 'Koolitused · periood_algus, periood_lopp', Tähendus: 'Ainult klastri real (KL-kood): periood, mille jooksul rühmad toimuvad, nt 01.10.2026 ja 31.12.2026. Toimumisajad rühmade kaupa lepitakse kokku pärast jaotust.' },
      { 'Leht / veerg': 'Koolitused · osalejate_arv', Tähendus: 'Maksimaalne osalejate arv. Partner näeb „Max osalejaid“ ja hinda rühma täitumisel = see × tema hind osaleja kohta. Klastri real on see kogu klastri osalejate arv (nt 500).' },
      { 'Leht / veerg': 'Koolitused · ruhma_suurus, ruhmi', Tähendus: 'Ainult klastri real: rühma suurus (kuni hankeosa rühma ülempiir) ja/või rühmade arv (1–99). Üks neist piisab — teine arvutatakse; viimane rühm kannab jäägi. Klaster loob rakenduses ruhmi rühma, mida partnerid kinnitavad arvuna („võtan kuni 6 rühma“) ja mis jaotatakse klastri kaupa.' },
      { 'Leht / veerg': 'Koolitused · (vooru liik)', Tähendus: 'Ühe mustandi read on ühte liiki: kas kindla kuupäevaga koolitused või klastrid, mitte mõlemad [V-09]. Olemasoleva klastri rida tähistab tema vabu rühmi; rühmade arvu faili kaudu ei muudeta.' },
      { 'Leht / veerg': 'Koolitused · hinnanguline_maksumus', Tähendus: 'Vabatahtlik tellija sisemine hinnang eurodes; partneri vaates ega protokollis seda ei ole.' },
      { 'Leht / veerg': 'Koolitused · formaat', Tähendus: Object.values(WORKSHOP_TYPE_LABELS).join(', ') },
      { 'Leht / veerg': 'Koolitused · sihtruhm', Tähendus: Object.values(TARGET_GROUPS).join(', ') },
      { 'Leht / veerg': 'Koolitused · keel', Tähendus: Object.keys(LANGUAGE_LABELS).join(', ') },
      { 'Leht / veerg': 'Reegel', Tähendus: 'Import on kõik-või-midagi terve faili kohta: ühegi veaga rea, nimetatud hankeosast erineva koolituse või juba voorus oleva koolituse puhul ei looda ühtki mustandit, kuni fail on parandatud.' },
    ],
  };

  return buildWorkbook([voor, koolitused, selgitus]);
}
