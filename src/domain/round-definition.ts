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
import { fold, foldRow, type RawRow, type RowDiagnostic } from './import-rows';

export interface RoundDefinition {
  lotCode: string;
  visibilityMode: VisibilityMode;
  /** null means "the lot's default" */
  capOptions: CapOptions | null;
  /** working days on top of the lot's default response window, applied at publication */
  extraWorkingDays: number;
  note: string;
}

export const ROUND_FIELDS = ['hankeosa', 'nahtavus', 'piirmaara_valikud', 'lisatoopaevad', 'markus'] as const;

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
 * Read the sheet either as key/value rows (`väli` / `väärtus`, the template's
 * layout) or as a one-row table whose headers are the field names.
 */
function fieldsOf(raws: readonly RawRow[]): Record<string, string> | null {
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
  if ('hankeosa' in first) return first;
  return null;
}

export function parseRoundDefinition(
  raws: readonly RawRow[],
  context: { knownLotCodes: readonly string[] },
): { value: RoundDefinition | null; errors: RowDiagnostic[] } {
  const errors: RowDiagnostic[] = [];
  const fields = fieldsOf(raws);
  if (!fields) {
    return {
      value: null,
      errors: [
        {
          message:
            'Lehel „Voor“ peavad olema veerud „väli“ ja „väärtus“ (üks rida iga välja kohta) või üks andmerida veerunimedega hankeosa, nahtavus, piirmaara_valikud, lisatoopaevad, markus.',
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

  const note = (fields.markus ?? '').trim();
  if (note.length > 400) errors.push({ field: 'markus', message: 'märkus võib olla kuni 400 tähemärki' });

  if (errors.length > 0 || lotCode === null) return { value: null, errors };
  return { value: { lotCode, visibilityMode, capOptions, extraWorkingDays, note }, errors };
}
