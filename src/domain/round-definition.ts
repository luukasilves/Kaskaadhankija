/**
 * The "Voor" sheet of a cascade-round workbook [L-20]: the round's parameters
 * as a key/value list the team fills in, next to a "Koolitused" sheet in the
 * calendar-import layout. Pure, like the other row parsers; Estonian
 * diagnostics, because the buyer reads them in the preview.
 *
 * The file describes a **draft**. Publication — the instant, the deadline, the
 * frozen ranking — happens in the application, never in a spreadsheet.
 */

import type { CapOptions, VisibilityMode } from './round-statuses';
import { fold, foldRow, parseEstonianDate, type RawRow, type RowDiagnostic } from './import-rows';
import { tallinnWallToUtc } from './working-days';

export interface RoundDefinition {
  lotCode: string;
  visibilityMode: VisibilityMode;
  /** null means "the lot's default" */
  capOptions: CapOptions | null;
  /** working days on top of the lot's default response window, applied at publication */
  extraWorkingDays: number;
  /**
   * The window the team planned, as instants. A **plan**: publication fixes the
   * real ones, and the engine still enforces the lot's floor from the moment
   * somebody actually presses publish [L-20]. Null means "not stated".
   */
  plannedPublishAt: number | null;
  plannedDeadlineAt: number | null;
  note: string;
}

export const ROUND_FIELDS = [
  'hankeosa',
  'nahtavus',
  'piirmaara_valikud',
  'lisatoopaevad',
  'avaldamine',
  'vastamistahtaeg',
  'markus',
] as const;

/**
 * `07.10.2026` or `07.10.2026 14:30` as an instant in Tallinn wall-clock time.
 *
 * A bare date takes `defaultLocalTime`, which for a deadline is the lot's own
 * hour — the same hour the working-day arithmetic would have produced.
 */
export function parseEstonianInstant(
  input: string,
  defaultLocalTime: string,
): { ok: true; value: number } | { ok: false; message: string } {
  const text = input.trim();
  if (!text) return { ok: false, message: 'kuupäev on puudu' };
  const [datePart, timePart] = text.split(/[\sT]+/, 2);
  const day = parseEstonianDate(datePart ?? '');
  if (!day.ok) return { ok: false, message: day.message };

  const time = (timePart ?? defaultLocalTime).trim();
  const match = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!match) {
    return { ok: false, message: `kellaaeg peab olema kujul 14:30, saadi „${timePart ?? ''}“` };
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return { ok: false, message: `kellaaeg 00:00–23:59 vahemikus, saadi „${time}“` };
  }
  const [year, month, dayOfMonth] = day.value.split('-').map(Number);
  return {
    ok: true,
    value: tallinnWallToUtc(year!, month!, dayOfMonth!, hours, minutes).getTime(),
  };
}

/** The words the sheet uses for the cap offer, and what they mean. */
export const CAP_OPTIONS_SHEET_WORDS: Record<CapOptions, string> = {
  none: 'puudub',
  trainings: 'koolitused',
  participants: 'osalejad',
  both: 'mõlemad',
};

const CAP_ALIASES: Record<string, CapOptions> = {
  puudub: 'none',
  none: 'none',
  ei: 'none',
  koolitused: 'trainings',
  koolituste_arv: 'trainings',
  trainings: 'trainings',
  osalejad: 'participants',
  osalejate_arv: 'participants',
  participants: 'participants',
  molemad: 'both',
  both: 'both',
  partner_valib: 'both',
};

const VISIBILITY_ALIASES: Record<string, VisibilityMode> = {
  dunaamiline: 'dynamic',
  dynamic: 'dynamic',
  suletud: 'sealed',
  sealed: 'sealed',
};

export const VISIBILITY_SHEET_WORDS: Record<VisibilityMode, string> = {
  dynamic: 'dünaamiline',
  sealed: 'suletud',
};

/**
 * Read a sheet either as key/value rows (`väli` / `väärtus`, the template's
 * layout) or as a one-row table whose headers are the field names.
 *
 * `oneRowKeys` are the field names that identify the second shape — a person
 * who rearranged the template into a table still gets their file read.
 */
export function keyValueFields(
  raws: readonly RawRow[],
  oneRowKeys: readonly string[],
): Record<string, string> | null {
  if (raws.length === 0) return null;
  const first = foldRow(raws[0]!);
  if ('vali' in first && 'vaartus' in first) {
    const fields: Record<string, string> = {};
    for (const raw of raws) {
      const row = foldRow(raw);
      const key = fold(row.vali ?? '');
      if (key) fields[key] = (row.vaartus ?? '').trim();
    }
    return fields;
  }
  if (oneRowKeys.some((key) => key in first)) return first;
  return null;
}

/** The cap offer a sheet word means, or undefined when it means nothing. */
export function capOptionsFromWord(word: string): CapOptions | undefined {
  return CAP_ALIASES[fold(word)];
}

/** The visibility mode a sheet word means, or undefined. */
export function visibilityFromWord(word: string): VisibilityMode | undefined {
  return VISIBILITY_ALIASES[fold(word)];
}

export function parseRoundDefinition(
  raws: readonly RawRow[],
  context: {
    knownLotCodes: readonly string[];
    /** each lot's deadline hour, so a bare date lands where the lot says */
    deadlineTimeByLot?: Record<string, string>;
  },
): { value: RoundDefinition | null; errors: RowDiagnostic[] } {
  const errors: RowDiagnostic[] = [];
  const fields = keyValueFields(raws, ['hankeosa']);
  if (!fields) {
    return {
      value: null,
      errors: [
        {
          message:
            'Lehel „Voor“ peavad olema veerud „väli“ ja „väärtus“ (üks rida iga välja kohta) või üks andmerida veerunimedega hankeosa, nahtavus, piirmaara_valikud, lisatoopaevad, avaldamine, vastamistahtaeg, markus.',
        },
      ],
    };
  }

  const rawLot = (fields.hankeosa ?? '').trim().toUpperCase();
  const knownLots = new Set(context.knownLotCodes.map((c) => fold(c)));
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

  let visibilityMode: VisibilityMode = 'dynamic';
  const rawVisibility = fold(fields.nahtavus ?? '');
  if (rawVisibility) {
    const mode = VISIBILITY_ALIASES[rawVisibility];
    if (!mode) {
      errors.push({ field: 'nahtavus', message: `tundmatu nähtavusrežiim „${fields.nahtavus}“ (lubatud: dünaamiline, suletud)` });
    } else {
      visibilityMode = mode;
    }
  }

  let capOptions: CapOptions | null = null;
  const rawCap = fold(fields.piirmaara_valikud ?? '');
  if (rawCap) {
    const options = CAP_ALIASES[rawCap];
    if (!options) {
      errors.push({
        field: 'piirmaara_valikud',
        message: `tundmatu piirmäära valik „${fields.piirmaara_valikud}“ (lubatud: puudub, koolitused, osalejad, mõlemad)`,
      });
    } else {
      capOptions = options;
    }
  }

  let extraWorkingDays = 0;
  const rawExtra = (fields.lisatoopaevad ?? '').trim();
  if (rawExtra) {
    const value = Number(rawExtra.replace(',', '.'));
    if (!Number.isInteger(value) || value < 0 || value > 20) {
      errors.push({ field: 'lisatoopaevad', message: `lisatööpäevad peab olema täisarv 0–20, saadi „${rawExtra}“` });
    } else {
      extraWorkingDays = value;
    }
  }

  const deadlineTime = (lotCode && context.deadlineTimeByLot?.[lotCode]) || '17:00';

  let plannedPublishAt: number | null = null;
  const rawPublish = (fields.avaldamine ?? '').trim();
  if (rawPublish) {
    // A planned publication has no hour of its own to inherit; 09:00 is when a
    // working day starts, and it only ever prefills a form.
    const parsed = parseEstonianInstant(rawPublish, '09:00');
    if (!parsed.ok) errors.push({ field: 'avaldamine', message: parsed.message });
    else plannedPublishAt = parsed.value;
  }

  let plannedDeadlineAt: number | null = null;
  const rawDeadline = (fields.vastamistahtaeg ?? '').trim();
  if (rawDeadline) {
    const parsed = parseEstonianInstant(rawDeadline, deadlineTime);
    if (!parsed.ok) errors.push({ field: 'vastamistahtaeg', message: parsed.message });
    else plannedDeadlineAt = parsed.value;
  }

  // Two ways of saying the same thing, and no way to tell which was meant.
  if (rawDeadline && rawExtra) {
    errors.push({
      field: 'vastamistahtaeg',
      message:
        'täida kas „vastamistahtaeg“ (kuupäev ja kellaaeg) või „lisatoopaevad“ (mitu tööpäeva hankeosa vaikimisi aknale lisada), mitte mõlemad',
    });
  }
  if (plannedPublishAt !== null && plannedDeadlineAt !== null && plannedDeadlineAt <= plannedPublishAt) {
    errors.push({ field: 'vastamistahtaeg', message: 'vastamistähtaeg peab olema avaldamisest hiljem' });
  }

  const note = (fields.markus ?? '').trim();
  if (note.length > 400) errors.push({ field: 'markus', message: 'märkus võib olla kuni 400 tähemärki' });

  if (errors.length > 0 || lotCode === null) return { value: null, errors };
  return {
    value: { lotCode, visibilityMode, capOptions, extraWorkingDays, plannedPublishAt, plannedDeadlineAt, note },
    errors,
  };
}
