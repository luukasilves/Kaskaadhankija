/**
 * Validation and normalisation of imported table rows — the koolituskalender
 * and the framework partner ranking.
 *
 * Pure, so the same code validates an uploaded file, the committed sample
 * dataset, and the test fixtures. Every diagnostic is written in Estonian
 * because the procurement team reads them in the import preview.
 *
 * Coercion is hand-rolled rather than delegated to a schema library: the point
 * here is to accept what a person plausibly types in a spreadsheet ("Harjumaa",
 * "07.10.2026", "1 450,00") and to explain precisely what was wrong when it
 * cannot be read. zod guards the server-action boundary instead.
 */

import { COUNTIES, LANGUAGE_LABELS, WORKSHOP_TYPE_LABELS, type County, type OrderLanguage, type WorkshopType } from './statuses';
import { TARGET_GROUPS, type TargetGroup } from './round-statuses';

/* ------------------------------------------------------------------ *
 * diagnostics
 * ------------------------------------------------------------------ */

export interface RowDiagnostic {
  field?: string;
  message: string;
}

export interface ParsedRow<T> {
  /** 1-based row number as the person sees it in the spreadsheet (header = 1) */
  rowNumber: number;
  value: T | null;
  errors: RowDiagnostic[];
  warnings: RowDiagnostic[];
}

export interface ParseTableResult<T> {
  rows: ParsedRow<T>[];
  /** problems with the file as a whole, e.g. a missing column */
  fileErrors: RowDiagnostic[];
}

/** A row as delivered by the CSV/XLSX reader: original header → cell text. */
export type RawRow = Record<string, string>;

/* ------------------------------------------------------------------ *
 * text folding and header matching
 * ------------------------------------------------------------------ */

const DIACRITICS: Record<string, string> = {
  ä: 'a', ö: 'o', ü: 'u', õ: 'o', š: 's', ž: 'z',
  Ä: 'a', Ö: 'o', Ü: 'u', Õ: 'o', Š: 's', Ž: 'z',
};

/** Lower-case, strip Estonian diacritics, collapse separators. */
export function fold(value: string): string {
  return value
    .trim()
    .replace(/[äöüõšžÄÖÜÕŠŽ]/g, (c) => DIACRITICS[c] ?? c)
    .toLowerCase()
    .replace(/[\s._-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Index a raw row by folded header, so `Kuupäev`, `kuupaev` and `KUUPAEV`
 * all reach the same field.
 */
export function foldRow(raw: RawRow): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    out[fold(key)] = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * field parsers
 * ------------------------------------------------------------------ */

export type FieldResult<T> = { ok: true; value: T; warning?: string } | { ok: false; message: string };

const ok = <T>(value: T, warning?: string): FieldResult<T> => ({ ok: true, value, warning });
const bad = (message: string): FieldResult<never> => ({ ok: false, message });

/** 'YYYY-MM-DD' or 'DD.MM.YYYY' → ISO day. Rejects impossible dates. */
export function parseEstonianDate(input: string): FieldResult<string> {
  const text = input.trim();
  if (!text) return bad('kuupäev on puudu');

  let year: number, month: number, day: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  const dotted = /^(\d{1,2})\.(\d{1,2})\.(\d{4})\.?$/.exec(text);
  if (iso) {
    [, year, month, day] = [0, Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (dotted) {
    [, day, month, year] = [0, Number(dotted[1]), Number(dotted[2]), Number(dotted[3])];
  } else {
    return bad(`kuupäeva ei õnnestu lugeda: „${text}“ (oodatud kujul 07.10.2026 või 2026-10-07)`);
  }

  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return bad(`sellist kuupäeva ei ole: „${text}“`);
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return ok(`${year}-${pad(month)}-${pad(day)}`);
}

/** Accepts an enum key or its Estonian label, diacritic- and case-insensitively. */
function parseEnum<K extends string>(
  input: string,
  labels: Record<K, string>,
  fieldName: string,
): FieldResult<K> {
  const needle = fold(input);
  if (!needle) return bad(`${fieldName} on puudu`);
  for (const key of Object.keys(labels) as K[]) {
    if (fold(key) === needle || fold(labels[key]) === needle) return ok(key);
  }
  const allowed = (Object.keys(labels) as K[]).map((k) => labels[k]).join(', ');
  return bad(`tundmatu ${fieldName}: „${input}“ (lubatud: ${allowed})`);
}

/** County aliases: "Harju", "Harjumaa", "Harju maakond"; "veeb"/"online" → Veebipõhine. */
const COUNTY_ALIASES: Map<string, County> = (() => {
  const map = new Map<string, County>();
  for (const county of COUNTIES) {
    map.set(fold(county), county);
    const base = county.replace(/ maakond$/, '');
    if (base !== county) {
      map.set(fold(base), county);
      map.set(fold(`${base}maa`), county);
    }
  }
  for (const alias of ['veeb', 'online', 'veebis', 'veebipohine', 'internet']) {
    map.set(fold(alias), 'Veebipõhine');
  }
  return map;
})();

export function parseCounty(input: string): FieldResult<County> {
  const needle = fold(input);
  if (!needle) return bad('maakond on puudu');
  const found = COUNTY_ALIASES.get(needle);
  if (found) return ok(found);
  return bad(`tundmatu maakond: „${input}“`);
}

/** Accepts '1450', '1 450,00', '1450.00', '1.450,00'. */
export function parseAmount(input: string, fieldName = 'summa'): FieldResult<number> {
  const text = input.trim();
  if (!text) return bad(`${fieldName} on puudu`);
  // Strip spaces and thousands separators, then normalise the decimal comma.
  let cleaned = text.replace(/[\s ]/g, '');
  if (cleaned.includes(',')) cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return bad(`${fieldName} ei ole arv: „${text}“`);
  if (value < 0) return bad(`${fieldName} ei saa olla negatiivne`);
  return ok(value);
}

export function parseInteger(
  input: string,
  fieldName: string,
  min: number,
  max: number,
): FieldResult<number> {
  const text = input.trim();
  if (!text) return bad(`${fieldName} on puudu`);
  if (!/^\d+$/.test(text)) return bad(`${fieldName} peab olema täisarv: „${text}“`);
  const value = Number(text);
  if (value < min || value > max) return bad(`${fieldName} peab olema vahemikus ${min}–${max}`);
  return ok(value);
}

export function parseText(
  input: string,
  fieldName: string,
  { min = 0, max = 200, required = true }: { min?: number; max?: number; required?: boolean } = {},
): FieldResult<string> {
  const text = input.trim();
  if (!text) {
    if (required) return bad(`${fieldName} on puudu`);
    return ok('');
  }
  if (text.length < min) return bad(`${fieldName} on liiga lühike (vähemalt ${min} tähemärki)`);
  if (text.length > max) return bad(`${fieldName} on liiga pikk (kuni ${max} tähemärki)`);
  return ok(text);
}

/* ------------------------------------------------------------------ *
 * koolituskalender
 * ------------------------------------------------------------------ */

export interface TrainingRow {
  code: string;
  lotCode: string;
  title: string;
  workshopType: WorkshopType;
  eventDate: string;
  eventEnd: string | null;
  county: County;
  locationText: string;
  targetGroup: TargetGroup;
  participantCount: number;
  language: OrderLanguage;
  estimatedValueEur: number;
  notes: string;
}

export const TRAINING_COLUMNS = [
  'kood',
  'hankeosa',
  'nimetus',
  'formaat',
  'kuupaev',
  'maakond',
  'sihtruhm',
  'osalejate_arv',
  'keel',
  'hinnanguline_maksumus',
] as const;

export const TRAINING_OPTIONAL_COLUMNS = ['lopp_kuupaev', 'asukoht', 'markused'] as const;

export interface TrainingImportContext {
  /** lot codes that exist, e.g. ['OSA-1', …] */
  knownLotCodes: readonly string[];
  /** used to warn about dates already in the past */
  todayIso?: string;
}

export function parseTrainingRows(
  raws: readonly RawRow[],
  context: TrainingImportContext,
): ParseTableResult<TrainingRow> {
  const fileErrors: RowDiagnostic[] = [];
  if (raws.length === 0) {
    fileErrors.push({ message: 'Failis ei ole ühtegi andmerida.' });
    return { rows: [], fileErrors };
  }

  const present = new Set(Object.keys(foldRow(raws[0])));
  for (const column of TRAINING_COLUMNS) {
    if (!present.has(column)) {
      fileErrors.push({ field: column, message: `Failis puudub veerg „${column}“.` });
    }
  }
  if (fileErrors.length > 0) return { rows: [], fileErrors };

  const knownLots = new Set(context.knownLotCodes.map((c) => fold(c)));
  const seenCodes = new Map<string, number>();
  const rows: ParsedRow<TrainingRow>[] = [];

  raws.forEach((raw, index) => {
    const rowNumber = index + 2; // header occupies row 1
    const cells = foldRow(raw);
    const errors: RowDiagnostic[] = [];
    const warnings: RowDiagnostic[] = [];

    const take = <T>(field: string, result: FieldResult<T>): T | null => {
      if (!result.ok) {
        errors.push({ field, message: result.message });
        return null;
      }
      if (result.warning) warnings.push({ field, message: result.warning });
      return result.value;
    };

    const rawCode = (cells.kood ?? '').trim().toUpperCase();
    let code: string | null = null;
    if (!rawCode) {
      errors.push({ field: 'kood', message: 'kood on puudu' });
    } else if (!/^KK-\d{4}-\d{3,4}$/.test(rawCode)) {
      errors.push({ field: 'kood', message: `kood peab olema kujul KK-2026-101, saadi „${rawCode}“` });
    } else if (seenCodes.has(rawCode)) {
      errors.push({
        field: 'kood',
        message: `kood ${rawCode} kordub failis (esimest korda real ${seenCodes.get(rawCode)})`,
      });
    } else {
      seenCodes.set(rawCode, rowNumber);
      code = rawCode;
    }

    const rawLot = (cells.hankeosa ?? '').trim().toUpperCase();
    let lotCode: string | null = null;
    if (!rawLot) {
      errors.push({ field: 'hankeosa', message: 'hankeosa on puudu' });
    } else if (!knownLots.has(fold(rawLot))) {
      errors.push({
        field: 'hankeosa',
        message: `tundmatu hankeosa „${rawLot}“ (lubatud: ${context.knownLotCodes.join(', ')})`,
      });
    } else {
      lotCode = rawLot;
    }

    const title = take('nimetus', parseText(cells.nimetus ?? '', 'nimetus', { min: 3, max: 160 }));
    const workshopType = take('formaat', parseEnum(cells.formaat ?? '', WORKSHOP_TYPE_LABELS, 'formaat'));
    const eventDate = take('kuupaev', parseEstonianDate(cells.kuupaev ?? ''));
    const county = take('maakond', parseCounty(cells.maakond ?? ''));
    const targetGroup = take('sihtruhm', parseEnum(cells.sihtruhm ?? '', TARGET_GROUPS, 'sihtrühm'));
    const participantCount = take(
      'osalejate_arv',
      parseInteger(cells.osalejate_arv ?? '', 'osalejate arv', 1, 2000),
    );
    const language = take('keel', parseEnum(cells.keel ?? '', LANGUAGE_LABELS, 'keel'));
    const estimatedValueEur = take(
      'hinnanguline_maksumus',
      parseAmount(cells.hinnanguline_maksumus ?? '', 'hinnanguline maksumus'),
    );
    const locationText = take('asukoht', parseText(cells.asukoht ?? '', 'asukoht', { max: 160, required: false }));
    const notes = take('markused', parseText(cells.markused ?? '', 'märkused', { max: 600, required: false }));

    let eventEnd: string | null = null;
    const rawEnd = (cells.lopp_kuupaev ?? '').trim();
    if (rawEnd) {
      const parsed = parseEstonianDate(rawEnd);
      if (!parsed.ok) {
        errors.push({ field: 'lopp_kuupaev', message: parsed.message });
      } else if (eventDate && parsed.value < eventDate) {
        errors.push({ field: 'lopp_kuupaev', message: 'lõppkuupäev on enne alguskuupäeva' });
      } else {
        eventEnd = parsed.value;
      }
    }

    if (eventDate && context.todayIso && eventDate < context.todayIso) {
      warnings.push({ field: 'kuupaev', message: 'kuupäev on minevikus' });
    }
    if (lotCode === 'OSA-3' && county && county !== 'Veebipõhine') {
      warnings.push({
        field: 'maakond',
        message: 'veebikoolituste hankeosas on tavaliselt maakond „Veebipõhine“',
      });
    }
    if (county === 'Veebipõhine' && lotCode && lotCode !== 'OSA-3') {
      warnings.push({ field: 'maakond', message: 'veebipõhine koolitus väljaspool hankeosa OSA-3' });
    }

    // Inline null checks rather than a `complete` flag, so the compiler narrows
    // each field for the object literal below.
    let value: TrainingRow | null = null;
    if (
      errors.length === 0 &&
      code !== null &&
      lotCode !== null &&
      title !== null &&
      workshopType !== null &&
      eventDate !== null &&
      county !== null &&
      targetGroup !== null &&
      participantCount !== null &&
      language !== null &&
      estimatedValueEur !== null &&
      locationText !== null &&
      notes !== null
    ) {
      value = {
        code,
        lotCode,
        title,
        workshopType,
        eventDate,
        eventEnd,
        county,
        locationText,
        targetGroup,
        participantCount,
        language,
        estimatedValueEur,
        notes,
      };
    }

    rows.push({ rowNumber, errors, warnings, value });
  });

  return { rows, fileErrors };
}

/* ------------------------------------------------------------------ *
 * raamlepingu partnerite järjestus
 * ------------------------------------------------------------------ */

export interface PartnerRow {
  partnerName: string;
  regCode: string;
  lotCode: string;
  rank: number;
  contactName: string;
  contactEmail: string;
  unitPriceEur: number;
}

export const PARTNER_COLUMNS = [
  'partner',
  'registrikood',
  'hankeosa',
  'koht',
  'kontaktisik',
  'e_post',
  'uhikhind',
] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function parsePartnerRows(
  raws: readonly RawRow[],
  context: { knownLotCodes: readonly string[] },
): ParseTableResult<PartnerRow> {
  const fileErrors: RowDiagnostic[] = [];
  if (raws.length === 0) {
    fileErrors.push({ message: 'Failis ei ole ühtegi andmerida.' });
    return { rows: [], fileErrors };
  }

  const present = new Set(Object.keys(foldRow(raws[0])));
  for (const column of PARTNER_COLUMNS) {
    if (!present.has(column)) {
      fileErrors.push({ field: column, message: `Failis puudub veerg „${column}“.` });
    }
  }
  if (fileErrors.length > 0) return { rows: [], fileErrors };

  const knownLots = new Set(context.knownLotCodes.map((c) => fold(c)));
  /** (lotCode, rank) must be unique within the file, as must (lotCode, regCode) */
  const seenRank = new Map<string, number>();
  const seenMembership = new Map<string, number>();
  const rows: ParsedRow<PartnerRow>[] = [];

  raws.forEach((raw, index) => {
    const rowNumber = index + 2;
    const cells = foldRow(raw);
    const errors: RowDiagnostic[] = [];
    const warnings: RowDiagnostic[] = [];

    const take = <T>(field: string, result: FieldResult<T>): T | null => {
      if (!result.ok) {
        errors.push({ field, message: result.message });
        return null;
      }
      return result.value;
    };

    const partnerName = take('partner', parseText(cells.partner ?? '', 'partneri nimi', { min: 2, max: 120 }));
    const contactName = take('kontaktisik', parseText(cells.kontaktisik ?? '', 'kontaktisik', { min: 2, max: 80 }));
    const unitPriceEur = take('uhikhind', parseAmount(cells.uhikhind ?? '', 'ühikhind'));

    const rawReg = (cells.registrikood ?? '').replace(/[\s ]/g, '');
    let regCode: string | null = null;
    if (!rawReg) {
      errors.push({ field: 'registrikood', message: 'registrikood on puudu' });
    } else if (!/^\d{8}$/.test(rawReg)) {
      errors.push({ field: 'registrikood', message: `registrikood peab olema 8 numbrit, saadi „${rawReg}“` });
    } else {
      regCode = rawReg;
    }

    const rawEmail = (cells.e_post ?? '').trim();
    let contactEmail: string | null = null;
    if (!rawEmail) {
      errors.push({ field: 'e_post', message: 'e-posti aadress on puudu' });
    } else if (!EMAIL_RE.test(rawEmail)) {
      errors.push({ field: 'e_post', message: `e-posti aadress ei ole korrektne: „${rawEmail}“` });
    } else {
      contactEmail = rawEmail.toLowerCase();
    }

    const rawLot = (cells.hankeosa ?? '').trim().toUpperCase();
    let lotCode: string | null = null;
    if (!rawLot) {
      errors.push({ field: 'hankeosa', message: 'hankeosa on puudu' });
    } else if (!knownLots.has(fold(rawLot))) {
      errors.push({
        field: 'hankeosa',
        message: `tundmatu hankeosa „${rawLot}“ (lubatud: ${context.knownLotCodes.join(', ')})`,
      });
    } else {
      lotCode = rawLot;
    }

    const rank = take('koht', parseInteger(cells.koht ?? '', 'koht', 1, 200));

    if (lotCode && rank !== null) {
      const key = `${lotCode}#${rank}`;
      if (seenRank.has(key)) {
        errors.push({
          field: 'koht',
          message: `hankeosas ${lotCode} on koht ${rank} juba real ${seenRank.get(key)}`,
        });
      } else {
        seenRank.set(key, rowNumber);
      }
    }
    if (lotCode && regCode) {
      const key = `${lotCode}#${regCode}`;
      if (seenMembership.has(key)) {
        errors.push({
          field: 'registrikood',
          message: `sama partner on hankeosas ${lotCode} juba real ${seenMembership.get(key)}`,
        });
      } else {
        seenMembership.set(key, rowNumber);
      }
    }

    let value: PartnerRow | null = null;
    if (
      errors.length === 0 &&
      partnerName !== null &&
      regCode !== null &&
      lotCode !== null &&
      rank !== null &&
      contactName !== null &&
      contactEmail !== null &&
      unitPriceEur !== null
    ) {
      value = { partnerName, regCode, lotCode, rank, contactName, contactEmail, unitPriceEur };
    }

    rows.push({ rowNumber, errors, warnings, value });
  });

  // Ranks should be contiguous from 1 per lot; a gap is legal but worth flagging.
  const byLot = new Map<string, number[]>();
  for (const row of rows) {
    if (!row.value) continue;
    const list = byLot.get(row.value.lotCode) ?? [];
    list.push(row.value.rank);
    byLot.set(row.value.lotCode, list);
  }
  for (const [lotCode, ranks] of byLot) {
    const sorted = [...ranks].sort((a, b) => a - b);
    const expected = sorted.map((_, i) => i + 1);
    if (JSON.stringify(sorted) !== JSON.stringify(expected)) {
      fileErrors.push({
        field: 'koht',
        message: `Hankeosa ${lotCode} kohad ei ole järjestikused alates 1-st (${sorted.join(', ')}). Import õnnestub, kuid kontrolli järjestust.`,
      });
    }
  }

  return { rows, fileErrors };
}

/* ------------------------------------------------------------------ *
 * partner representatives (esindajad) [R-02][D-10]
 * ------------------------------------------------------------------ */

export type RepresentativeRoleValue = 'esindaja' | 'asendaja';

export interface RepresentativeRow {
  regCode: string;
  name: string;
  email: string;
  role: RepresentativeRoleValue;
  phone: string;
}

export const REPRESENTATIVE_COLUMNS = ['registrikood', 'esindaja', 'e_post'] as const;
export const REPRESENTATIVE_OPTIONAL_COLUMNS = ['roll', 'telefon'] as const;

const ROLE_ALIASES: Record<string, RepresentativeRoleValue> = {
  esindaja: 'esindaja',
  lepinguline_esindaja: 'esindaja',
  allkirjaoiguslik: 'esindaja',
  allkirjaoiguslik_esindaja: 'esindaja',
  asendaja: 'asendaja',
  asendusliige: 'asendaja',
  kontaktisik: 'asendaja',
};

/** 'esindaja' (default when empty) or 'asendaja', with the usual spellings. */
export function parseRepresentativeRole(input: string): FieldResult<RepresentativeRoleValue> {
  const needle = fold(input);
  if (!needle) return ok('esindaja');
  const role = ROLE_ALIASES[needle];
  if (!role) return bad(`tundmatu roll „${input.trim()}“ (lubatud: esindaja, asendaja)`);
  return ok(role);
}

export function parseRepresentativeRows(
  raws: readonly RawRow[],
  context: { knownRegCodes: readonly string[] },
): ParseTableResult<RepresentativeRow> {
  const fileErrors: RowDiagnostic[] = [];
  if (raws.length === 0) {
    fileErrors.push({ message: 'Failis ei ole ühtegi andmerida.' });
    return { rows: [], fileErrors };
  }

  const present = new Set(Object.keys(foldRow(raws[0])));
  for (const column of REPRESENTATIVE_COLUMNS) {
    if (!present.has(column)) {
      fileErrors.push({ field: column, message: `Failis puudub veerg „${column}“.` });
    }
  }
  if (fileErrors.length > 0) return { rows: [], fileErrors };

  const known = new Set(context.knownRegCodes);
  /** an address may appear once in the file */
  const seenEmail = new Map<string, number>();
  const rows: ParsedRow<RepresentativeRow>[] = [];

  raws.forEach((raw, index) => {
    const rowNumber = index + 2;
    const cells = foldRow(raw);
    const errors: RowDiagnostic[] = [];
    const warnings: RowDiagnostic[] = [];

    const take = <T>(field: string, result: FieldResult<T>): T | null => {
      if (!result.ok) {
        errors.push({ field, message: result.message });
        return null;
      }
      if (result.warning) warnings.push({ field, message: result.warning });
      return result.value;
    };

    const rawReg = (cells.registrikood ?? '').replace(/[\s ]/g, '');
    let regCode: string | null = null;
    if (!rawReg) {
      errors.push({ field: 'registrikood', message: 'registrikood on puudu' });
    } else if (!/^\d{8}$/.test(rawReg)) {
      errors.push({ field: 'registrikood', message: `registrikood peab olema 8 numbrit, saadi „${rawReg}“` });
    } else if (!known.has(rawReg)) {
      errors.push({
        field: 'registrikood',
        message: `tundmatu partner registrikoodiga „${rawReg}“ — impordi kõigepealt partnerite järjestus`,
      });
    } else {
      regCode = rawReg;
    }

    const name = take('esindaja', parseText(cells.esindaja ?? '', 'esindaja nimi', { min: 2, max: 80 }));

    const rawEmail = (cells.e_post ?? '').trim();
    let email: string | null = null;
    if (!rawEmail) {
      errors.push({ field: 'e_post', message: 'e-posti aadress on puudu' });
    } else if (!EMAIL_RE.test(rawEmail)) {
      errors.push({ field: 'e_post', message: `e-posti aadress ei ole korrektne: „${rawEmail}“` });
    } else {
      email = rawEmail.toLowerCase();
      const earlier = seenEmail.get(email);
      if (earlier !== undefined) {
        errors.push({ field: 'e_post', message: `sama e-posti aadress on juba real ${earlier}` });
      } else {
        seenEmail.set(email, rowNumber);
      }
    }

    const role = take('roll', parseRepresentativeRole(cells.roll ?? ''));
    const phone = (cells.telefon ?? '').trim().slice(0, 40);

    let value: RepresentativeRow | null = null;
    if (errors.length === 0 && regCode !== null && name !== null && email !== null && role !== null) {
      value = { regCode, name, email, role, phone };
    }
    rows.push({ rowNumber, errors, warnings, value });
  });

  return { rows, fileErrors };
}

/* ------------------------------------------------------------------ *
 * summary
 * ------------------------------------------------------------------ */

export interface RowCounts {
  total: number;
  valid: number;
  withErrors: number;
  withWarnings: number;
}

export function countRows<T>(rows: readonly ParsedRow<T>[]): RowCounts {
  return {
    total: rows.length,
    valid: rows.filter((r) => r.value !== null).length,
    withErrors: rows.filter((r) => r.errors.length > 0).length,
    withWarnings: rows.filter((r) => r.warnings.length > 0).length,
  };
}
