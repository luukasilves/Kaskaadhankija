/**
 * The sign-in e-mail. Deliberately not a notification [D]: it goes through the
 * mail transport directly, so the code never lands in a log anyone reads.
 */

import { composeNotice, type RenderedNotice } from './round-templates';

export function renderLoginCode(input: { name: string; code: string; minutes: number }): RenderedNotice {
  return composeNotice(`Sisenemiskood ${input.code} — Kaskaadhankija`, [
    `Lugupeetud ${input.name}`,
    `Teie sisenemiskood Kaskaadhankija keskkonda on: ${input.code}`,
    `Kood kehtib ${input.minutes} minutit ja ainult ühe korra. Sisestage see lehel, kust selle küsisite.`,
    'Kui te koodi ei küsinud, jätke see kiri tähelepanuta — ilma koodita ei saa keegi teie nimel sisse logida.',
  ]);
}
