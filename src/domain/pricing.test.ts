/**
 * [T-08] The framework price is per participant. Three partners in one lot
 * see three different figures for the same training, and the sum keeps cents
 * — 21 × 60,50 is 1 270,50, not 1 271.
 */

import { describe, expect, it } from 'vitest';
import { HIND, allocationMaxPriceEur, priceLine, trainingMaxPriceEur } from './pricing';

describe('[T-08] hind osaleja kohta', () => {
  it('prices a training at max participants × the partner’s price per participant', () => {
    expect(trainingMaxPriceEur(28, 58)).toBe(1624);
    expect(trainingMaxPriceEur(28, 60.5)).toBe(1694);
    expect(trainingMaxPriceEur(21, 60.5)).toBe(1270.5);
  });

  it('sums an allocation over its trainings and keeps cents', () => {
    expect(
      allocationMaxPriceEur([
        { participantCount: 21, unitPriceEur: 60.5 },
        { participantCount: 3, unitPriceEur: 60.5 },
      ]),
    ).toBe(1452);
    expect(allocationMaxPriceEur([{ participantCount: 7, unitPriceEur: 17.5 }])).toBe(122.5);
    expect(allocationMaxPriceEur([])).toBe(0);
  });

  it('writes the one money sentence exactly, with the labels it is built from', () => {
    const line = priceLine(1270.5, 60.5);
    expect(line).toContain(HIND.tellimuseMax);
    expect(line).toMatch(/1\s?270,50/);
    expect(line).toContain('60,50');
    expect(line).toContain('osalejate arv on ülempiir');
    expect(line).not.toContain('aksumus');
  });
});
