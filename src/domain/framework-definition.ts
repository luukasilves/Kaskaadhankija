/**
 * The framework-data workbook [L-21]: the sheets an admin downloads filled in
 * with the current state, edits, and drops back.
 *
 *  - **Raamleping** — key/value: which framework this is.
 *  - **Hankeosad** — one row per lot: its name and its cascade settings.
 *  - **Partnerid** — the ranking, parsed by `parsePartnerRows` as before.
 *  - **Esindajad** — extra people beyond each lot's official contact.
 *
 * A blank cell in **Hankeosad** means *unchanged* — that is what makes the
 * round trip safe: an admin who edits one contact does not have to re-state
 * every setting of every lot, and a lot the file does not mention keeps
 * everything it had. Pure, with Estonian diagnostics, because the buyer reads
 * them in the preview.
 */

import { fold, foldRow, parseEstonianDate, parseInteger, parseText, type ParseTableResult, type ParsedRow, type RawRow, type RowDiagnostic } from './import-rows';
import { capOptionsFromWord, keyValueFields, visibilityFromWord, CAP_OPTIONS_SHEET_WORDS, VISIBILITY_SHEET_WORDS } from './round-definition';
import type { CapOptions, VisibilityMode } from './round-statuses';
import type { FrameworkIdentity } from './framework';

/* ------------------------------------------------------------------ *
 * Raamleping
 * ------------------------------------------------------------------ */

export const FRAMEWORK_FIELDS = [
  'nimetus',
  'viitenumber',
  'raamlepingu_number',
  'kehtib_kuni',
  'tellija',
] as const;

const REFERENCE_RE = /^\d{4,12}$/;

export function parseFrameworkSheet(raws: readonly RawRow[]): {
  value: FrameworkIdentity | null;
  errors: RowDiagnostic[];
} {
  const errors: RowDiagnostic[] = [];
  const fields = keyValueFields(raws, ['nimetus', 'viitenumber']);
  if (!fields) {
    return {
      value: null,
      errors: [
        {
          message:
            'Lehel „Raamleping“ peavad olema veerud „väli“ ja „väärtus“ (üks rida iga välja kohta) või üks andmerida veerunimedega nimetus, viitenumber, raamlepingu_number, kehtib_kuni, tellija.',
        },
      ],
    };
  }

  const title = parseText(fields.nimetus ?? '', 'nimetus', { min: 3, max: 160 });
  if (!title.ok) errors.push({ field: 'nimetus', message: title.message });

  const rawReference = (fields.viitenumber ?? '').trim();
  if (!rawReference) {
    errors.push({ field: 'viitenumber', message: 'riigihanke viitenumber on puudu' });
  } else if (!REFERENCE_RE.test(rawReference)) {
    errors.push({
      field: 'viitenumber',
      message: `riigihanke viitenumber on number, nt 10567384 — saadi „${rawReference}“`,
    });
  }

  const agreement = parseText(fields.raamlepingu_number ?? '', 'raamlepingu number', {
    max: 80,
    required: false,
  });
  if (!agreement.ok) errors.push({ field: 'raamlepingu_number', message: agreement.message });

  const buyer = parseText(fields.tellija ?? '', 'tellija', { min: 2, max: 120 });
  if (!buyer.ok) errors.push({ field: 'tellija', message: buyer.message });

  let validUntil: string | null = null;
  const rawValidUntil = (fields.kehtib_kuni ?? '').trim();
  if (rawValidUntil) {
    const parsed = parseEstonianDate(rawValidUntil);
    if (!parsed.ok) errors.push({ field: 'kehtib_kuni', message: parsed.message });
    else validUntil = parsed.value;
  }

  if (errors.length > 0 || !title.ok || !buyer.ok || !agreement.ok) return { value: null, errors };
  return {
    value: {
      title: title.value,
      procurementReference: rawReference,
      agreementReference: agreement.value,
      buyerName: buyer.value,
      validUntil,
    },
    errors,
  };
}

/* ------------------------------------------------------------------ *
 * Hankeosad
 * ------------------------------------------------------------------ */

/** `null` in any field means "leave this as it is" — see the file comment. */
export interface LotRow {
  code: string;
  name: string;
  description: string | null;
  responseDeadlineWorkingDays: number | null;
  deadlineLocalTime: string | null;
  reviewWorkingDays: number | null;
  workloadThreshold: number | null;
  defaultVisibilityMode: VisibilityMode | null;
  defaultCapOptions: CapOptions | null;
  thresholdNote: string | null;
}

export const LOT_COLUMNS = ['kood', 'nimetus'] as const;

export const LOT_OPTIONAL_COLUMNS = [
  'kirjeldus',
  'vastamistahtaeg_toopaevad',
  'tahtaja_kellaaeg',
  'ulevaatuse_toopaevad',
  'koormuse_kunnis',
  'nahtavus_vaikimisi',
  'piirmaara_valikud_vaikimisi',
  'kunnise_markus',
] as const;

export const LOT_HEADERS = [...LOT_COLUMNS, ...LOT_OPTIONAL_COLUMNS] as const;

const LOT_CODE_RE = /^[A-Z0-9ÕÄÖÜ][A-Z0-9ÕÄÖÜ-]{1,19}$/;
const LOCAL_TIME_RE = /^(\d{1,2}):(\d{2})$/;

/** `9:00` → `09:00`; anything that is not a wall-clock time is an error. */
function parseLocalTime(input: string): { ok: true; value: string } | { ok: false; message: string } {
  const match = LOCAL_TIME_RE.exec(input.trim());
  if (!match) {
    return {
      ok: false,
      message: `kellaaeg peab olema kujul 17:00, saadi „${input}“ (Excelis hoia lahter tekstina)`,
    };
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return { ok: false, message: `kellaaeg 00:00–23:59 vahemikus, saadi „${input}“` };
  }
  return { ok: true, value: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}` };
}

export function parseLotRows(raws: readonly RawRow[]): ParseTableResult<LotRow> {
  const rows: ParsedRow<LotRow>[] = [];
  const fileErrors: RowDiagnostic[] = [];
  const seen = new Map<string, number>();

  raws.forEach((raw, index) => {
    const rowNumber = index + 2;
    const row = foldRow(raw);
    const errors: RowDiagnostic[] = [];
    const warnings: RowDiagnostic[] = [];

    const code = (row.kood ?? '').trim().toUpperCase();
    if (!code) {
      errors.push({ field: 'kood', message: 'hankeosa kood on puudu' });
    } else if (!LOT_CODE_RE.test(code)) {
      errors.push({
        field: 'kood',
        message: `hankeosa kood tohib sisaldada suurtähti, numbreid ja sidekriipsu (nt OSA-1), saadi „${code}“`,
      });
    } else if (seen.has(code)) {
      errors.push({ field: 'kood', message: `kood ${code} on failis mitu korda (rida ${seen.get(code)})` });
    } else {
      seen.set(code, rowNumber);
    }

    const name = parseText(row.nimetus ?? '', 'nimetus', { min: 2, max: 120 });
    if (!name.ok) errors.push({ field: 'nimetus', message: name.message });

    /** An optional cell: absent means "unchanged", present is validated. */
    const optional = <T>(
      field: string,
      parse: (value: string) => { ok: true; value: T } | { ok: false; message: string },
    ): T | null => {
      const raw = (row[field] ?? '').trim();
      if (!raw) return null;
      const parsed = parse(raw);
      if (!parsed.ok) {
        errors.push({ field, message: parsed.message });
        return null;
      }
      return parsed.value;
    };

    const description = optional('kirjeldus', (value) => parseText(value, 'kirjeldus', { max: 600 }));
    const responseDeadlineWorkingDays = optional('vastamistahtaeg_toopaevad', (value) =>
      parseInteger(value, 'vastamistähtaeg tööpäevades', 1, 20),
    );
    const deadlineLocalTime = optional('tahtaja_kellaaeg', parseLocalTime);
    const reviewWorkingDays = optional('ulevaatuse_toopaevad', (value) =>
      parseInteger(value, 'ülevaatuse tööpäevad', 1, 20),
    );
    const workloadThreshold = optional('koormuse_kunnis', (value) =>
      parseInteger(value, 'koormuse künnis', 1, 999),
    );
    const defaultVisibilityMode = optional('nahtavus_vaikimisi', (value) => {
      const mode = visibilityFromWord(value);
      return mode
        ? { ok: true as const, value: mode }
        : {
            ok: false as const,
            message: `tundmatu nähtavusrežiim „${value}“ (lubatud: ${Object.values(VISIBILITY_SHEET_WORDS).join(', ')})`,
          };
    });
    const defaultCapOptions = optional('piirmaara_valikud_vaikimisi', (value) => {
      const options = capOptionsFromWord(value);
      return options
        ? { ok: true as const, value: options }
        : {
            ok: false as const,
            message: `tundmatu piirmäära valik „${value}“ (lubatud: ${Object.values(CAP_OPTIONS_SHEET_WORDS).join(', ')})`,
          };
    });
    const thresholdNote = optional('kunnise_markus', (value) =>
      parseText(value, 'künnise märkus', { max: 300 }),
    );

    const value: LotRow | null =
      errors.length > 0 || !name.ok || !code
        ? null
        : {
            code,
            name: name.value,
            description,
            responseDeadlineWorkingDays,
            deadlineLocalTime,
            reviewWorkingDays,
            workloadThreshold,
            defaultVisibilityMode,
            defaultCapOptions,
            thresholdNote,
          };

    rows.push({ rowNumber, value, errors, warnings });
  });

  if (raws.length > 0) {
    const headers = new Set(Object.keys(foldRow(raws[0]!)).map((key) => fold(key)));
    for (const column of LOT_COLUMNS) {
      if (!headers.has(column)) {
        fileErrors.push({ message: `lehel „Hankeosad“ on veerg „${column}“ puudu` });
      }
    }
  }

  return { rows, fileErrors };
}

/**
 * A lot as sheet cells — the inverse of `parseLotRows`.
 *
 * Both the download an admin edits and the seed's own rows go through this, so
 * the workbook a tester opens and the data an empty database gets are written
 * by the same function.
 */
export function lotSheetRow(lot: LotRow): RawRow {
  return {
    kood: lot.code,
    nimetus: lot.name,
    kirjeldus: lot.description ?? '',
    vastamistahtaeg_toopaevad:
      lot.responseDeadlineWorkingDays === null ? '' : String(lot.responseDeadlineWorkingDays),
    tahtaja_kellaaeg: lot.deadlineLocalTime ?? '',
    ulevaatuse_toopaevad: lot.reviewWorkingDays === null ? '' : String(lot.reviewWorkingDays),
    koormuse_kunnis: lot.workloadThreshold === null ? '' : String(lot.workloadThreshold),
    nahtavus_vaikimisi: lot.defaultVisibilityMode ? VISIBILITY_SHEET_WORDS[lot.defaultVisibilityMode] : '',
    piirmaara_valikud_vaikimisi: lot.defaultCapOptions ? CAP_OPTIONS_SHEET_WORDS[lot.defaultCapOptions] : '',
    kunnise_markus: lot.thresholdNote ?? '',
  };
}
