/**
 * Estonian display formatting. Pure and dependency-free, shared by the demo and
 * the server so dates and amounts read identically in the UI and in email.
 */

import { TALLINN, tallinnParts } from './working-days';

const DATE_FMT = new Intl.DateTimeFormat('et-EE', {
  timeZone: TALLINN,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const DATE_TIME_FMT = new Intl.DateTimeFormat('et-EE', {
  timeZone: TALLINN,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const EUR_FMT = new Intl.NumberFormat('et-EE', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

const EUR_FMT_CENTS = new Intl.NumberFormat('et-EE', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** '03.09.2026' */
export function formatDate(instant: Date | number): string {
  return DATE_FMT.format(instant);
}

/** '03.09.2026 kell 17:00' — the phrasing used in deadlines and email copy. */
export function formatDateTime(instant: Date | number): string {
  const parts = DATE_TIME_FMT.formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('day')}.${get('month')}.${get('year')} kell ${get('hour')}:${get('minute')}`;
}

/** '03.09.2026 17:00' — compact form for tables. */
export function formatDateTimeShort(instant: Date | number): string {
  const parts = DATE_TIME_FMT.formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('day')}.${get('month')}.${get('year')} ${get('hour')}:${get('minute')}`;
}

/** An ISO 'YYYY-MM-DD' event date as '03.09.2026', without timezone drift. */
export function formatIsoDay(iso: string): string {
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) return iso;
  return `${day}.${month}.${year}`;
}

export function formatEur(amount: number): string {
  return EUR_FMT.format(amount);
}

export function formatEurCents(amount: number): string {
  return EUR_FMT_CENTS.format(amount);
}

/**
 * Time remaining until a deadline, as Estonian copy: 'jäänud 2 päeva 4 tundi',
 * or 'tähtaeg möödunud'. Used for the dashboard countdown.
 */
export function formatRemaining(from: number, deadline: number): string {
  const ms = deadline - from;
  if (ms <= 0) return 'tähtaeg möödunud';
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `jäänud ${days} ${plural(days, 'päev', 'päeva')} ${hours} h`;
  if (hours > 0) return `jäänud ${hours} h ${minutes} min`;
  return `jäänud ${minutes} min`;
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** True when a deadline is inside the final 24 hours, for highlighting. */
export function isDeadlineUrgent(from: number, deadline: number): boolean {
  const ms = deadline - from;
  return ms > 0 && ms <= 86_400_000;
}

/** Tallinn wall-clock day for an instant, as 'YYYY-MM-DD'. */
export function tallinnIsoDay(instant: Date | number): string {
  const p = tallinnParts(new Date(instant));
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/**
 * An instant as a value for `<input type="datetime-local">`, in Tallinn time.
 *
 * The input has no timezone of its own, so both directions must agree that the
 * person is typing Tallinn wall-clock time: this writes it, and
 * `parseEstonianInstant` reads it back.
 */
export function tallinnLocalInput(instant: Date | number): string {
  const { year, month, day, hour, minute } = tallinnParts(
    typeof instant === 'number' ? new Date(instant) : instant,
  );
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
}
