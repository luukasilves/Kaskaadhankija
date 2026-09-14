/**
 * Money, as the framework agreement defines it [T-08].
 *
 * The partner's framework price (`uhikuhind`, `lot_partners.unit_price_eur`) is
 * a price **per participant**, constant per (lot, partner) and different
 * between partners and lots. A training's participant count is a **maximum**.
 * So the only figures the application ever derives are:
 *
 *  - a training's *hind rühma täitumisel* — max participants × the partner's
 *    price per participant;
 *  - an allocation's *hind max osalejate korral* — the sum of those.
 *
 * The application never computes or shows „maksumus“: what a partner is
 * finally paid follows the framework's terms and actual attendance, outside
 * this system. The buyer's own `hinnanguline_maksumus` on a calendar row is a
 * planning figure („Tellija hinnang“) that never reaches a partner [L-26].
 *
 * Labels live here so that screens, PDF, mail and the guide import them rather
 * than retype them — the guide quotes UI strings verbatim and its tests catch
 * drift, which only works if there is one place to drift from.
 */

import { formatEurCents } from './format';

export const HIND = {
  osalejaKohta: 'Hind osaleja kohta',
  maxOsalejaid: 'Max osalejaid',
  ruhmaTaitumisel: 'Hind rühma täitumisel',
  tellimuseMax: 'Hind max osalejate korral',
  tellijaHinnang: 'Tellija hinnang',
} as const;

/** Round to cents, so 3 × 60,50 does not accumulate float noise into frozen JSON. */
function cents(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/** Max participants × the partner's price per participant. */
export function trainingMaxPriceEur(participantCount: number, unitPriceEur: number): number {
  return cents(participantCount * unitPriceEur);
}

/** Σ over trainings of (max participants × price per participant). */
export function allocationMaxPriceEur(
  lines: ReadonlyArray<{ participantCount: number; unitPriceEur: number }>,
): number {
  return cents(lines.reduce((sum, line) => sum + line.participantCount * line.unitPriceEur, 0));
}

/** The one sentence a notice or a document says about money. */
export function priceLine(totalEur: number, unitPriceEur: number): string {
  return `${HIND.tellimuseMax}: ${formatEurCents(totalEur)} (${HIND.osalejaKohta.toLowerCase()} ${formatEurCents(unitPriceEur)}; osalejate arv on ülempiir).`;
}
