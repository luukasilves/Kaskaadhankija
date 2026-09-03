import { describe, expect, it } from 'vitest';
import {
  countRows,
  fold,
  parseAmount,
  parseCounty,
  parseEstonianDate,
  parseInteger,
  parsePartnerRows,
  parseTrainingRows,
  type RawRow,
} from './import-rows';

const LOTS = ['OSA-1', 'OSA-2', 'OSA-3', 'OSA-4'];

const trainingRow = (over: Partial<RawRow> = {}): RawRow => ({
  kood: 'KK-2026-101',
  hankeosa: 'OSA-1',
  nimetus: 'Töötuba 1 Tartu linnavalitsuse teenistujatele',
  formaat: 'Töötuba 1',
  kuupaev: '07.10.2026',
  lopp_kuupaev: '',
  maakond: 'Tartu maakond',
  asukoht: 'Koolitaja ruumid',
  sihtruhm: 'KOV ametnikud',
  osalejate_arv: '25',
  keel: 'Eesti keel',
  hinnanguline_maksumus: '1450',
  markused: '',
  ...over,
});

const partnerRow = (over: Partial<RawRow> = {}): RawRow => ({
  partner: 'Tehisaru Koolitus OÜ',
  registrikood: '10000001',
  hankeosa: 'OSA-1',
  koht: '1',
  kontaktisik: 'Jaan Kask',
  e_post: 'jaan.kask@tehisaru-naidis.ee',
  uhikhind: '1450',
  ...over,
});

const parseTrainings = (raws: RawRow[], todayIso?: string) =>
  parseTrainingRows(raws, { knownLotCodes: LOTS, todayIso });

describe('fold', () => {
  it('strips Estonian diacritics and normalises separators', () => {
    expect(fold('Kuupäev')).toBe('kuupaev');
    expect(fold('Osalejate arv')).toBe('osalejate_arv');
    expect(fold('  E-post ')).toBe('e_post');
    expect(fold('SIHTRÜHM')).toBe('sihtruhm');
    expect(fold('Lõpp_kuupäev')).toBe('lopp_kuupaev');
  });
});

describe('parseEstonianDate', () => {
  it('accepts both spreadsheet conventions', () => {
    expect(parseEstonianDate('07.10.2026')).toEqual({ ok: true, value: '2026-10-07', warning: undefined });
    expect(parseEstonianDate('2026-10-07')).toEqual({ ok: true, value: '2026-10-07', warning: undefined });
    expect(parseEstonianDate('7.10.2026')).toMatchObject({ ok: true, value: '2026-10-07' });
    expect(parseEstonianDate('2026-1-5')).toMatchObject({ ok: true, value: '2026-01-05' });
  });

  it('rejects impossible and unreadable dates', () => {
    expect(parseEstonianDate('31.02.2026').ok).toBe(false);
    expect(parseEstonianDate('2026-13-01').ok).toBe(false);
    expect(parseEstonianDate('oktoober').ok).toBe(false);
    expect(parseEstonianDate('').ok).toBe(false);
  });
});

describe('parseCounty', () => {
  it('accepts the full name, the bare name and the -maa form', () => {
    for (const input of ['Harju maakond', 'Harju', 'Harjumaa', 'harjumaa', 'HARJU']) {
      expect(parseCounty(input)).toMatchObject({ ok: true, value: 'Harju maakond' });
    }
  });

  it('handles hyphenated and diacritic counties', () => {
    expect(parseCounty('Ida-Virumaa')).toMatchObject({ ok: true, value: 'Ida-Viru maakond' });
    expect(parseCounty('Lääne-Viru')).toMatchObject({ ok: true, value: 'Lääne-Viru maakond' });
    expect(parseCounty('Jogeva')).toMatchObject({ ok: true, value: 'Jõgeva maakond' });
    expect(parseCounty('Võru maakond')).toMatchObject({ ok: true, value: 'Võru maakond' });
  });

  it('maps online aliases to Veebipõhine', () => {
    for (const input of ['Veebipõhine', 'veeb', 'online', 'veebipohine']) {
      expect(parseCounty(input)).toMatchObject({ ok: true, value: 'Veebipõhine' });
    }
  });

  it('rejects an unknown county with the offending text', () => {
    const result = parseCounty('Stockholmi maakond');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('Stockholmi maakond');
  });
});

describe('parseAmount', () => {
  it('accepts Estonian and plain number formats', () => {
    expect(parseAmount('1450')).toMatchObject({ value: 1450 });
    expect(parseAmount('1 450,00')).toMatchObject({ value: 1450 });
    expect(parseAmount('1450.50')).toMatchObject({ value: 1450.5 });
    expect(parseAmount('1.450,75')).toMatchObject({ value: 1450.75 });
    expect(parseAmount('0')).toMatchObject({ value: 0 });
  });

  it('rejects non-numbers and negatives', () => {
    expect(parseAmount('tasuta').ok).toBe(false);
    expect(parseAmount('-5').ok).toBe(false);
    expect(parseAmount('').ok).toBe(false);
  });
});

describe('parseInteger', () => {
  it('enforces the range', () => {
    expect(parseInteger('25', 'osalejate arv', 1, 2000)).toMatchObject({ value: 25 });
    expect(parseInteger('0', 'osalejate arv', 1, 2000).ok).toBe(false);
    expect(parseInteger('5000', 'osalejate arv', 1, 2000).ok).toBe(false);
    expect(parseInteger('25.5', 'osalejate arv', 1, 2000).ok).toBe(false);
  });
});

describe('parseTrainingRows', () => {
  it('accepts a well-formed row and normalises every field', () => {
    const { rows, fileErrors } = parseTrainings([trainingRow()]);
    expect(fileErrors).toEqual([]);
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].value).toEqual({
      code: 'KK-2026-101',
      lotCode: 'OSA-1',
      title: 'Töötuba 1 Tartu linnavalitsuse teenistujatele',
      workshopType: 'tootuba_1',
      eventDate: '2026-10-07',
      eventEnd: null,
      county: 'Tartu maakond',
      locationText: 'Koolitaja ruumid',
      targetGroup: 'kov',
      participantCount: 25,
      language: 'et',
      estimatedValueEur: 1450,
      notes: '',
    });
  });

  it('accepts enum keys as well as labels', () => {
    const { rows } = parseTrainings([
      trainingRow({ formaat: 'tootuba_2', sihtruhm: 'tervishoid', keel: 'ru' }),
    ]);
    expect(rows[0].value).toMatchObject({
      workshopType: 'tootuba_2',
      targetGroup: 'tervishoid',
      language: 'ru',
    });
  });

  it('numbers rows as the person sees them in the spreadsheet', () => {
    const { rows } = parseTrainings([
      trainingRow({ kood: 'KK-2026-101' }),
      trainingRow({ kood: 'KK-2026-102' }),
    ]);
    expect(rows.map((r) => r.rowNumber)).toEqual([2, 3]);
  });

  it('reports a missing required column as a file error and parses nothing', () => {
    const row = trainingRow();
    delete (row as Record<string, unknown>).maakond;
    const { rows, fileErrors } = parseTrainings([row]);
    expect(fileErrors.some((e) => e.field === 'maakond')).toBe(true);
    expect(rows).toEqual([]);
  });

  it('rejects a malformed code and a duplicate code', () => {
    const { rows } = parseTrainings([
      trainingRow({ kood: 'KOOLITUS-1' }),
      trainingRow({ kood: 'KK-2026-102' }),
      trainingRow({ kood: 'KK-2026-102' }),
    ]);
    expect(rows[0].errors[0].field).toBe('kood');
    expect(rows[1].errors).toEqual([]);
    expect(rows[2].errors[0].message).toContain('kordub failis');
    expect(rows[2].errors[0].message).toContain('real 3');
  });

  it('rejects an unknown lot code and names the allowed ones', () => {
    const { rows } = parseTrainings([trainingRow({ hankeosa: 'OSA-9' })]);
    expect(rows[0].value).toBeNull();
    expect(rows[0].errors[0].message).toContain('OSA-1, OSA-2, OSA-3, OSA-4');
  });

  it('collects several errors from one row', () => {
    const { rows } = parseTrainings([
      trainingRow({ kuupaev: 'eile', maakond: 'Kuu', osalejate_arv: 'palju' }),
    ]);
    expect(rows[0].errors.map((e) => e.field).sort()).toEqual(['kuupaev', 'maakond', 'osalejate_arv']);
    expect(rows[0].value).toBeNull();
  });

  it('validates the end date against the start date', () => {
    const bad = parseTrainings([trainingRow({ kuupaev: '10.10.2026', lopp_kuupaev: '09.10.2026' })]);
    expect(bad.rows[0].errors[0].field).toBe('lopp_kuupaev');

    const good = parseTrainings([trainingRow({ kuupaev: '10.10.2026', lopp_kuupaev: '11.10.2026' })]);
    expect(good.rows[0].value).toMatchObject({ eventEnd: '2026-10-11' });
  });

  it('warns without failing on a past date', () => {
    const { rows } = parseTrainings([trainingRow({ kuupaev: '01.01.2026' })], '2026-08-27');
    expect(rows[0].value).not.toBeNull();
    expect(rows[0].warnings[0].message).toContain('minevikus');
  });

  it('warns when a web lot has a physical county and vice versa', () => {
    const web = parseTrainings([trainingRow({ hankeosa: 'OSA-3', maakond: 'Harju maakond' })]);
    expect(web.rows[0].value).not.toBeNull();
    expect(web.rows[0].warnings.some((w) => w.field === 'maakond')).toBe(true);

    const physical = parseTrainings([trainingRow({ hankeosa: 'OSA-1', maakond: 'Veebipõhine' })]);
    expect(physical.rows[0].warnings.some((w) => w.field === 'maakond')).toBe(true);
  });

  it('treats optional columns as optional', () => {
    const { rows } = parseTrainings([trainingRow({ asukoht: '', markused: '', lopp_kuupaev: '' })]);
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].value).toMatchObject({ locationText: '', notes: '', eventEnd: null });
  });

  it('accepts diacritic-free and differently cased headers', () => {
    const raw: RawRow = {
      Kood: 'KK-2026-105',
      HANKEOSA: 'OSA-2',
      Nimetus: 'Töötuba 2 haridusasutuste töötajatele',
      Formaat: 'Töötuba 2',
      Kuupäev: '2026-11-03',
      Maakond: 'Pärnu',
      Sihtrühm: 'Haridus',
      'Osalejate arv': '30',
      Keel: 'et',
      'Hinnanguline maksumus': '980,00',
    };
    const { rows, fileErrors } = parseTrainings([raw]);
    expect(fileErrors).toEqual([]);
    expect(rows[0].value).toMatchObject({
      code: 'KK-2026-105',
      county: 'Pärnu maakond',
      targetGroup: 'haridus',
      estimatedValueEur: 980,
    });
  });

  it('reports an empty file', () => {
    const { fileErrors } = parseTrainings([]);
    expect(fileErrors[0].message).toContain('ei ole ühtegi andmerida');
  });
});

describe('parsePartnerRows', () => {
  const parse = (raws: RawRow[]) => parsePartnerRows(raws, { knownLotCodes: LOTS });

  it('accepts a well-formed ranking row', () => {
    const { rows, fileErrors } = parse([partnerRow()]);
    expect(fileErrors).toEqual([]);
    expect(rows[0].value).toEqual({
      partnerName: 'Tehisaru Koolitus OÜ',
      regCode: '10000001',
      lotCode: 'OSA-1',
      rank: 1,
      contactName: 'Jaan Kask',
      contactEmail: 'jaan.kask@tehisaru-naidis.ee',
      unitPriceEur: 1450,
    });
  });

  it('rejects a bad registry code and a bad email', () => {
    const { rows } = parse([partnerRow({ registrikood: '123', e_post: 'jaan(at)naidis.ee' })]);
    expect(rows[0].errors.map((e) => e.field).sort()).toEqual(['e_post', 'registrikood']);
  });

  it('lower-cases the email and strips spaces from the registry code', () => {
    const { rows } = parse([partnerRow({ registrikood: '1000 0001', e_post: 'Jaan.Kask@Naidis.EE' })]);
    expect(rows[0].value).toMatchObject({ regCode: '10000001', contactEmail: 'jaan.kask@naidis.ee' });
  });

  it('rejects a duplicated rank within one lot', () => {
    const { rows } = parse([
      partnerRow({ koht: '1' }),
      partnerRow({ registrikood: '10000002', partner: 'AI Akadeemia OÜ', koht: '1' }),
    ]);
    expect(rows[1].errors[0].field).toBe('koht');
    expect(rows[1].errors[0].message).toContain('koht 1 juba real 2');
  });

  it('allows the same rank in different lots', () => {
    const { rows } = parse([partnerRow({ hankeosa: 'OSA-1' }), partnerRow({ hankeosa: 'OSA-2' })]);
    expect(rows.every((r) => r.errors.length === 0)).toBe(true);
  });

  it('rejects the same partner twice in one lot', () => {
    const { rows } = parse([partnerRow({ koht: '1' }), partnerRow({ koht: '2' })]);
    expect(rows[1].errors[0].field).toBe('registrikood');
  });

  it('flags non-contiguous ranks as a file-level warning but still parses the rows', () => {
    const { rows, fileErrors } = parse([
      partnerRow({ koht: '1' }),
      partnerRow({ registrikood: '10000002', partner: 'AI Akadeemia OÜ', koht: '3' }),
    ]);
    expect(rows.every((r) => r.value !== null)).toBe(true);
    expect(fileErrors[0].message).toContain('järjestikused');
  });
});

describe('countRows', () => {
  it('summarises a mixed parse', () => {
    const { rows } = parseTrainings(
      [
        trainingRow({ kood: 'KK-2026-101' }),
        trainingRow({ kood: 'KK-2026-102', maakond: 'Kuu' }),
        trainingRow({ kood: 'KK-2026-103', kuupaev: '01.01.2026' }),
      ],
      '2026-08-27',
    );
    expect(countRows(rows)).toEqual({ total: 3, valid: 2, withErrors: 1, withWarnings: 1 });
  });
});
