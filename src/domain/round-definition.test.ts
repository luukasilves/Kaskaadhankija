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
    });
  });

  it('reads a one-row table too, and defaults what is left empty', () => {
    const result = parseRoundDefinition([{ hankeosa: 'OSA-1', nahtavus: '', piirmaara_valikud: '', lisatoopaevad: '' }], {
      knownLotCodes: LOTS,
    });
    expect(result.value).toEqual({ lotCode: 'OSA-1', visibilityMode: 'dynamic', capOptions: null, extraWorkingDays: 0, note: '' });
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
