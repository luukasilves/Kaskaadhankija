/**
 * The "Voor" sheet parser [L-20]: both layouts, the Estonian words, and the
 * refusals that keep a scheme from describing something the round cannot be.
 */

import { describe, expect, it } from 'vitest';
import { parseRoundDefinition } from './round-definition';

const LOTS = ['OSA-1', 'OSA-2', 'OSA-3', 'OSA-4'];
const kv = (pairs: Array<[string, string]>) => pairs.map(([väli, väärtus]) => ({ väli, väärtus }));

describe('parseRoundDefinition', () => {
  it('reads the template’s key/value layout with Estonian words', () => {
    const result = parseRoundDefinition(
      kv([
        ['hankeosa', 'osa-2'],
        ['nahtavus', 'Suletud'],
        ['piirmaara_valikud', 'mõlemad'],
        ['lisatoopaevad', '2'],
        ['markus', ' Sügisvoor '],
      ]),
      { knownLotCodes: LOTS },
    );
    expect(result.errors).toEqual([]);
    expect(result.value).toEqual({
      lotCode: 'OSA-2',
      visibilityMode: 'sealed',
      capOptions: 'both',
      extraWorkingDays: 2,
      note: 'Sügisvoor',
      plannedPublishAt: null,
      plannedDeadlineAt: null,
    });
  });

  it('reads a one-row table too, and defaults what is left empty', () => {
    const result = parseRoundDefinition([{ hankeosa: 'OSA-1', nahtavus: '', piirmaara_valikud: '', lisatoopaevad: '' }], {
      knownLotCodes: LOTS,
    });
    expect(result.value).toEqual({
      lotCode: 'OSA-1',
      visibilityMode: 'dynamic',
      capOptions: null,
      extraWorkingDays: 0,
      note: '',
      plannedPublishAt: null,
      plannedDeadlineAt: null,
    });
  });

  it('knows every cap word', () => {
    for (const [word, expected] of [
      ['puudub', 'none'],
      ['koolitused', 'trainings'],
      ['osalejad', 'participants'],
      ['Osalejate arv', 'participants'],
      ['molemad', 'both'],
    ] as const) {
      expect(parseRoundDefinition(kv([['hankeosa', 'OSA-1'], ['piirmaara_valikud', word]]), { knownLotCodes: LOTS }).value?.capOptions).toBe(expected);
    }
  });

  it('refuses an unknown lot, an unknown word, and out-of-range extra days', () => {
    const bad = parseRoundDefinition(
      kv([
        ['hankeosa', 'OSA-9'],
        ['nahtavus', 'poolavatud'],
        ['piirmaara_valikud', 'kõik'],
        ['lisatoopaevad', '25'],
      ]),
      { knownLotCodes: LOTS },
    );
    expect(bad.value).toBeNull();
    expect(bad.errors.map((e) => e.field)).toEqual(['hankeosa', 'nahtavus', 'piirmaara_valikud', 'lisatoopaevad']);
  });

  it('explains what the sheet should look like when neither layout is found', () => {
    const result = parseRoundDefinition([{ foo: 'bar' }], { knownLotCodes: LOTS });
    expect(result.value).toBeNull();
    expect(result.errors[0]?.message).toMatch(/„väli“ ja „väärtus“/);
    expect(parseRoundDefinition([], { knownLotCodes: LOTS }).value).toBeNull();
  });
});

describe('[L-20] the planned response window', () => {
  const kv = (pairs: Array<[string, string]>) => pairs.map(([vali, vaartus]) => ({ vali, vaartus }));

  it('reads a publication and a deadline, taking the lot’s hour for a bare date', () => {
    const result = parseRoundDefinition(
      kv([
        ['hankeosa', 'OSA-1'],
        ['avaldamine', '06.10.2026 10:15'],
        ['vastamistahtaeg', '09.10.2026'],
      ]),
      { knownLotCodes: LOTS, deadlineTimeByLot: { 'OSA-1': '16:30' } },
    );
    expect(result.errors).toEqual([]);
    // Tallinn is UTC+3 in October, so 10:15 local is 07:15Z.
    expect(new Date(result.value!.plannedPublishAt!).toISOString()).toBe('2026-10-06T07:15:00.000Z');
    expect(new Date(result.value!.plannedDeadlineAt!).toISOString()).toBe('2026-10-09T13:30:00.000Z');
  });

  it('refuses a deadline and extra working days together — two ways to say one thing', () => {
    const result = parseRoundDefinition(
      kv([
        ['hankeosa', 'OSA-1'],
        ['lisatoopaevad', '2'],
        ['vastamistahtaeg', '09.10.2026 17:00'],
      ]),
      { knownLotCodes: LOTS },
    );
    expect(result.value).toBeNull();
    expect(result.errors.map((e) => e.field)).toContain('vastamistahtaeg');
  });

  it('refuses a deadline that is not after the publication', () => {
    const result = parseRoundDefinition(
      kv([
        ['hankeosa', 'OSA-1'],
        ['avaldamine', '09.10.2026 12:00'],
        ['vastamistahtaeg', '09.10.2026 11:00'],
      ]),
      { knownLotCodes: LOTS },
    );
    expect(result.value).toBeNull();
    expect(result.errors.some((e) => e.message.includes('hiljem'))).toBe(true);
  });

  it('says what is wrong with an unreadable date', () => {
    const result = parseRoundDefinition(
      kv([
        ['hankeosa', 'OSA-1'],
        ['vastamistahtaeg', 'järgmine nädal'],
      ]),
      { knownLotCodes: LOTS },
    );
    expect(result.value).toBeNull();
    expect(result.errors[0]?.field).toBe('vastamistahtaeg');
  });
});
