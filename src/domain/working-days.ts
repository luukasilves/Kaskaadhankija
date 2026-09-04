/**
 * Estonian working-day arithmetic for cascade response deadlines.
 *
 * Pure and dependency-free: uses only `Intl`, so the exact same module runs in
 * the browser (single-file demo) and on the server. Deadlines must agree in
 * both places, so this file has no environment-specific code.
 *
 * Convention: the day an offer is sent does not count. A 3-working-day deadline
 * on an offer sent Monday falls on Thursday at `deadlineLocalTime` Tallinn time.
 */

export const TALLINN = 'Europe/Tallinn';

/**
 * Estonian public holidays (riigipühad) 2026–2028, as Tallinn calendar dates.
 * 2028 is included because a deadline set in late 2027 can spill into it.
 * Moving feasts are derived from Easter: Good Friday = Easter − 2,
 * Pentecost = Easter + 49.
 */
export const EE_HOLIDAYS: readonly string[] = [
  // 2026 (Easter 5 Apr)
  '2026-01-01', // uusaasta
  '2026-02-24', // iseseisvuspäev
  '2026-04-03', // suur reede
  '2026-04-05', // ülestõusmispühade 1. püha
  '2026-05-01', // kevadpüha
  '2026-05-24', // nelipühade 1. püha
  '2026-06-23', // võidupüha
  '2026-06-24', // jaanipäev
  '2026-08-20', // taasiseseisvumispäev
  '2026-12-24', // jõululaupäev
  '2026-12-25', // esimene jõulupüha
  '2026-12-26', // teine jõulupüha
  // 2027 (Easter 28 Mar)
  '2027-01-01',
  '2027-02-24',
  '2027-03-26',
  '2027-03-28',
  '2027-05-01',
  '2027-05-16',
  '2027-06-23',
  '2027-06-24',
  '2027-08-20',
  '2027-12-24',
  '2027-12-25',
  '2027-12-26',
  // 2028 (Easter 16 Apr)
  '2028-01-01',
  '2028-02-24',
  '2028-04-14',
  '2028-04-16',
  '2028-05-01',
  '2028-06-04',
  '2028-06-23',
  '2028-06-24',
  '2028-08-20',
  '2028-12-24',
  '2028-12-25',
  '2028-12-26',
];

const HOLIDAY_SET = new Set(EE_HOLIDAYS);

export interface TallinnParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
}

const PARTS_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: TALLINN,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** Wall-clock date and time in Tallinn for a given instant. */
export function tallinnParts(instant: Date): TallinnParts {
  const raw: Record<string, string> = {};
  for (const part of PARTS_FMT.formatToParts(instant)) raw[part.type] = part.value;
  // Some engines render midnight as hour "24" under hour12:false.
  const hour = Number(raw.hour) % 24;
  return {
    year: Number(raw.year),
    month: Number(raw.month),
    day: Number(raw.day),
    hour,
    minute: Number(raw.minute),
  };
}

/** Tallinn's UTC offset in milliseconds at a given instant (+2h EET / +3h EEST). */
function tallinnOffsetMs(instant: Date): number {
  const p = tallinnParts(instant);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  // Zero the seconds on both sides so the difference is a clean offset.
  const instantMinutes = Math.floor(instant.getTime() / 60000) * 60000;
  return asIfUtc - instantMinutes;
}

/**
 * Convert a Tallinn wall-clock time to the corresponding UTC instant.
 * Two passes, because the offset itself depends on the instant we are solving
 * for (DST). Ambiguous times in the autumn fold resolve to the first pass,
 * which is immaterial for 17:00 business deadlines.
 */
export function tallinnWallToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const firstOffset = tallinnOffsetMs(new Date(guess));
  const refined = tallinnOffsetMs(new Date(guess - firstOffset));
  return new Date(guess - refined);
}

function isoDate(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

function nextCalendarDay(year: number, month: number, day: number) {
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
}

function previousCalendarDay(year: number, month: number, day: number) {
  const previous = new Date(Date.UTC(year, month - 1, day - 1));
  return {
    year: previous.getUTCFullYear(),
    month: previous.getUTCMonth() + 1,
    day: previous.getUTCDate(),
  };
}

function wallTime(localTime: string): { hour: number; minute: number } {
  const [hourStr, minuteStr] = localTime.split(':');
  const hour = Number(hourStr);
  const minute = Number(minuteStr ?? '0');
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    throw new Error(`invalid localTime ${localTime}`);
  }
  return { hour, minute };
}

/** True when the given Tallinn calendar date is a working day (Mon–Fri, not a riigipüha). */
export function isWorkingDay(year: number, month: number, day: number): boolean {
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  if (dow === 0 || dow === 6) return false;
  return !HOLIDAY_SET.has(isoDate(year, month, day));
}

/** True when the instant falls on an Estonian working day, in Tallinn terms. */
export function isWorkingDayAt(instant: Date): boolean {
  const p = tallinnParts(instant);
  return isWorkingDay(p.year, p.month, p.day);
}

/**
 * The response deadline for an offer sent at `from`: the `n`-th working day
 * after the send day, at `localTime` Tallinn time. The send day never counts,
 * so `n` must be at least 1.
 */
export function addWorkingDays(from: Date, n: number, localTime = '17:00'): Date {
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`addWorkingDays: n must be a positive integer, got ${n}`);
  }
  const start = tallinnParts(from);
  let cursor = { year: start.year, month: start.month, day: start.day };
  let counted = 0;
  // Bounded to keep a bad holiday table from spinning forever.
  for (let guard = 0; counted < n && guard < 400; guard++) {
    cursor = nextCalendarDay(cursor.year, cursor.month, cursor.day);
    if (isWorkingDay(cursor.year, cursor.month, cursor.day)) counted++;
  }
  if (counted < n) throw new Error('addWorkingDays: could not find enough working days');

  const { hour, minute } = wallTime(localTime);
  return tallinnWallToUtc(cursor.year, cursor.month, cursor.day, hour, minute);
}

/**
 * The mirror of `addWorkingDays`: the `n`-th working day *before* `from`, at
 * `localTime` Tallinn time. The starting day never counts.
 *
 * Used by the mock seed to place a round's publication in the past — "avaldatud
 * 2 tööpäeva tagasi kell 10:00" — so that replaying the real engine calls
 * against a rewound clock lands the deadline where the scenario wants it.
 */
export function subWorkingDays(from: Date, n: number, localTime = '17:00'): Date {
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`subWorkingDays: n must be a positive integer, got ${n}`);
  }
  const start = tallinnParts(from);
  let cursor = { year: start.year, month: start.month, day: start.day };
  let counted = 0;
  for (let guard = 0; counted < n && guard < 400; guard++) {
    cursor = previousCalendarDay(cursor.year, cursor.month, cursor.day);
    if (isWorkingDay(cursor.year, cursor.month, cursor.day)) counted++;
  }
  if (counted < n) throw new Error('subWorkingDays: could not find enough working days');

  const { hour, minute } = wallTime(localTime);
  return tallinnWallToUtc(cursor.year, cursor.month, cursor.day, hour, minute);
}

/** Whole working days between two instants, for "deadline in N days" copy. */
export function workingDaysBetween(from: Date, to: Date): number {
  if (to.getTime() <= from.getTime()) return 0;
  const target = tallinnParts(to);
  const targetIso = isoDate(target.year, target.month, target.day);
  let cursor = tallinnParts(from);
  let count = 0;
  for (let guard = 0; guard < 800; guard++) {
    const nowIso = isoDate(cursor.year, cursor.month, cursor.day);
    if (nowIso === targetIso) return count;
    const next = nextCalendarDay(cursor.year, cursor.month, cursor.day);
    cursor = { ...cursor, ...next };
    if (isWorkingDay(cursor.year, cursor.month, cursor.day)) count++;
  }
  return count;
}
