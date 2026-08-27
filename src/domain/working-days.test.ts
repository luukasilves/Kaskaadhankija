import { describe, expect, it } from 'vitest';
import {
  addWorkingDays,
  isWorkingDay,
  tallinnParts,
  tallinnWallToUtc,
  workingDaysBetween,
} from './working-days';

/** Helper: describe a deadline as Tallinn wall clock, which is what users see. */
function wall(d: Date) {
  const p = tallinnParts(d);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

describe('tallinnWallToUtc', () => {
  it('uses EET (+2) in winter', () => {
    // 15 Jan 2026 17:00 Tallinn = 15:00 UTC
    expect(tallinnWallToUtc(2026, 1, 15, 17, 0).toISOString()).toBe('2026-01-15T15:00:00.000Z');
  });

  it('uses EEST (+3) in summer', () => {
    // 15 Jul 2026 17:00 Tallinn = 14:00 UTC
    expect(tallinnWallToUtc(2026, 7, 15, 17, 0).toISOString()).toBe('2026-07-15T14:00:00.000Z');
  });

  it('handles the spring DST boundary', () => {
    // DST starts 29 Mar 2026. The day before is still +2, the day after is +3.
    expect(tallinnWallToUtc(2026, 3, 28, 17, 0).toISOString()).toBe('2026-03-28T15:00:00.000Z');
    expect(tallinnWallToUtc(2026, 3, 30, 17, 0).toISOString()).toBe('2026-03-30T14:00:00.000Z');
  });

  it('handles the autumn DST boundary', () => {
    // DST ends 25 Oct 2026.
    expect(tallinnWallToUtc(2026, 10, 24, 17, 0).toISOString()).toBe('2026-10-24T14:00:00.000Z');
    expect(tallinnWallToUtc(2026, 10, 26, 17, 0).toISOString()).toBe('2026-10-26T15:00:00.000Z');
  });

  it('round-trips through tallinnParts', () => {
    const instant = tallinnWallToUtc(2027, 5, 3, 9, 30);
    expect(wall(instant)).toBe('2027-05-03 09:30');
  });
});

describe('isWorkingDay', () => {
  it('rejects weekends', () => {
    expect(isWorkingDay(2026, 9, 5)).toBe(false); // Saturday
    expect(isWorkingDay(2026, 9, 6)).toBe(false); // Sunday
    expect(isWorkingDay(2026, 9, 7)).toBe(true); // Monday
  });

  it('rejects fixed riigipühad', () => {
    expect(isWorkingDay(2026, 2, 24)).toBe(false); // iseseisvuspäev, a Tuesday
    expect(isWorkingDay(2026, 6, 23)).toBe(false); // võidupüha
    expect(isWorkingDay(2026, 6, 24)).toBe(false); // jaanipäev
    expect(isWorkingDay(2026, 8, 20)).toBe(false); // taasiseseisvumispäev, a Thursday
  });

  it('rejects moving feasts derived from Easter', () => {
    expect(isWorkingDay(2026, 4, 3)).toBe(false); // suur reede
    expect(isWorkingDay(2027, 3, 26)).toBe(false);
    expect(isWorkingDay(2028, 4, 14)).toBe(false);
    expect(isWorkingDay(2026, 5, 24)).toBe(false); // nelipühad (a Sunday anyway)
  });

  it('accepts an ordinary midweek day', () => {
    expect(isWorkingDay(2026, 9, 2)).toBe(true);
  });
});

describe('addWorkingDays', () => {
  it('excludes the send day', () => {
    // Monday 31 Aug 2026 → 3 working days → Thursday 3 Sep at 17:00
    const sent = tallinnWallToUtc(2026, 8, 31, 10, 0);
    expect(wall(addWorkingDays(sent, 3, '17:00'))).toBe('2026-09-03 17:00');
  });

  it('carries a Friday send over the weekend', () => {
    // Friday 4 Sep 2026 → 3 working days → Wednesday 9 Sep
    const sent = tallinnWallToUtc(2026, 9, 4, 14, 30);
    expect(wall(addWorkingDays(sent, 3, '17:00'))).toBe('2026-09-09 17:00');
  });

  it('skips a public holiday inside the window', () => {
    // Tuesday 18 Aug 2026 → 3 working days, with Thu 20 Aug a holiday
    // Wed 19 (1), Thu 20 holiday, Fri 21 (2), Mon 24 (3)
    const sent = tallinnWallToUtc(2026, 8, 18, 9, 0);
    expect(wall(addWorkingDays(sent, 3, '17:00'))).toBe('2026-08-24 17:00');
  });

  it('crosses the Christmas cluster correctly', () => {
    // Tuesday 22 Dec 2026 → 3 working days.
    // Wed 23 (1); Thu 24, Fri 25 holidays; Sat/Sun weekend;
    // Mon 28 (2), Tue 29 (3)
    const sent = tallinnWallToUtc(2026, 12, 22, 11, 0);
    expect(wall(addWorkingDays(sent, 3, '17:00'))).toBe('2026-12-29 17:00');
  });

  it('spills from 2027 into 2028', () => {
    // Wednesday 29 Dec 2027 → 3 working days.
    // Thu 30 (1), Fri 31 (2), Sat/Sun, Mon 3 Jan 2028 (3) — 1 Jan is a Saturday
    const sent = tallinnWallToUtc(2027, 12, 29, 12, 0);
    expect(wall(addWorkingDays(sent, 3, '17:00'))).toBe('2028-01-03 17:00');
  });

  it('crosses the spring DST change and still lands at local 17:00', () => {
    // Thursday 26 Mar 2026 → 3 working days → Tuesday 31 Mar, after DST starts
    const sent = tallinnWallToUtc(2026, 3, 26, 8, 0);
    const deadline = addWorkingDays(sent, 3, '17:00');
    expect(wall(deadline)).toBe('2026-03-31 17:00');
    // and the UTC instant reflects +3, not +2
    expect(deadline.toISOString()).toBe('2026-03-31T14:00:00.000Z');
  });

  it('honours a configured deadline time other than 17:00', () => {
    const sent = tallinnWallToUtc(2026, 9, 1, 9, 0);
    expect(wall(addWorkingDays(sent, 1, '12:00'))).toBe('2026-09-02 12:00');
  });

  it('supports a one-day deadline', () => {
    const sent = tallinnWallToUtc(2026, 9, 1, 9, 0);
    expect(wall(addWorkingDays(sent, 1, '17:00'))).toBe('2026-09-02 17:00');
  });

  it('rejects a non-positive count', () => {
    const sent = new Date('2026-09-01T09:00:00Z');
    expect(() => addWorkingDays(sent, 0)).toThrow();
    expect(() => addWorkingDays(sent, -1)).toThrow();
  });

  it('is unaffected by the send time of day', () => {
    const early = addWorkingDays(tallinnWallToUtc(2026, 9, 1, 0, 5), 3, '17:00');
    const late = addWorkingDays(tallinnWallToUtc(2026, 9, 1, 23, 55), 3, '17:00');
    expect(early.toISOString()).toBe(late.toISOString());
  });
});

describe('workingDaysBetween', () => {
  it('counts working days across a weekend', () => {
    const from = tallinnWallToUtc(2026, 9, 4, 10, 0); // Friday
    const to = tallinnWallToUtc(2026, 9, 9, 17, 0); // Wednesday
    expect(workingDaysBetween(from, to)).toBe(3);
  });

  it('returns 0 when the target is in the past', () => {
    const from = tallinnWallToUtc(2026, 9, 9, 10, 0);
    const to = tallinnWallToUtc(2026, 9, 4, 17, 0);
    expect(workingDaysBetween(from, to)).toBe(0);
  });

  it('agrees with addWorkingDays', () => {
    const sent = tallinnWallToUtc(2026, 8, 18, 9, 0);
    const deadline = addWorkingDays(sent, 3, '17:00');
    expect(workingDaysBetween(sent, deadline)).toBe(3);
  });
});
