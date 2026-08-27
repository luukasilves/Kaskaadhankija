/**
 * Cascade vocabulary: statuses, their legal transitions, and Estonian labels.
 *
 * Pure and shared, so the demo and the server agree on what a status means and
 * which moves are allowed. The server additionally enforces these in the
 * database; here they gate the UI and the reducer.
 */

export type OrderStatus =
  | 'draft'
  | 'cascading'
  | 'assigned'
  | 'failed'
  | 'cancelled'
  | 'completed';

export type OfferStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'expired'
  | 'skipped'
  | 'cancelled';

export type DeclineReason =
  | 'no_capacity'
  | 'date_conflict'
  | 'location_unsuitable'
  | 'other';

export type WorkshopType = 'tootuba_1' | 'tootuba_2' | 'suursundmus' | 'muu';

export type OrderLanguage = 'et' | 'ru' | 'en';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  draft: 'Ettevalmistus',
  cascading: 'Kaskaad käib',
  assigned: 'Määratud',
  failed: 'Partnerit ei leitud',
  cancelled: 'Tühistatud',
  completed: 'Lõpetatud',
};

export const OFFER_STATUS_LABELS: Record<OfferStatus, string> = {
  pending: 'Ootab vastust',
  accepted: 'Vastu võetud',
  declined: 'Loobus',
  expired: 'Tähtaeg möödus',
  skipped: 'Vahele jäetud',
  cancelled: 'Tühistatud',
};

export const DECLINE_REASON_LABELS: Record<DeclineReason, string> = {
  no_capacity: 'Koolitajad on hõivatud',
  date_conflict: 'Kuupäev ei sobi',
  location_unsuitable: 'Asukoht ei sobi',
  other: 'Muu põhjus',
};

export const WORKSHOP_TYPE_LABELS: Record<WorkshopType, string> = {
  tootuba_1: 'Töötuba 1',
  tootuba_2: 'Töötuba 2',
  suursundmus: 'Suursündmus',
  muu: 'Muu formaat',
};

export const LANGUAGE_LABELS: Record<OrderLanguage, string> = {
  et: 'Eesti keel',
  ru: 'Vene keel',
  en: 'Inglise keel',
};

/** Estonian counties plus the pseudo-location used for online delivery. */
export const COUNTIES = [
  'Harju maakond',
  'Hiiu maakond',
  'Ida-Viru maakond',
  'Jõgeva maakond',
  'Järva maakond',
  'Lääne maakond',
  'Lääne-Viru maakond',
  'Põlva maakond',
  'Pärnu maakond',
  'Rapla maakond',
  'Saare maakond',
  'Tartu maakond',
  'Valga maakond',
  'Viljandi maakond',
  'Võru maakond',
  'Veebipõhine',
] as const;

export type County = (typeof COUNTIES)[number];

/** An offer in a terminal state can never change again. */
export const TERMINAL_OFFER_STATUSES: readonly OfferStatus[] = [
  'accepted',
  'declined',
  'expired',
  'skipped',
  'cancelled',
];

export function isOfferTerminal(status: OfferStatus): boolean {
  return TERMINAL_OFFER_STATUSES.includes(status);
}

const ALLOWED_ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  draft: ['cascading', 'assigned', 'cancelled'],
  // back to draft is an abort, so the buyer can edit and restart
  cascading: ['assigned', 'failed', 'draft', 'cancelled'],
  assigned: ['completed', 'cancelled'],
  // a failed cascade can be revived by editing (draft) or assigning by hand
  failed: ['draft', 'assigned', 'cancelled'],
  cancelled: [],
  completed: [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_ORDER_TRANSITIONS[from].includes(to);
}

/** Editing an order while partners hold a live offer would desync the email. */
export function isOrderEditable(status: OrderStatus): boolean {
  return status === 'draft';
}

export function orderDisplayNumber(year: number, seq: number): string {
  return `KH-${year}-${String(seq).padStart(4, '0')}`;
}

/** Colour token per status, resolved to CSS classes by the UI layer. */
export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export const ORDER_STATUS_TONES: Record<OrderStatus, StatusTone> = {
  draft: 'neutral',
  cascading: 'info',
  assigned: 'success',
  failed: 'danger',
  cancelled: 'neutral',
  completed: 'success',
};

export const OFFER_STATUS_TONES: Record<OfferStatus, StatusTone> = {
  pending: 'info',
  accepted: 'success',
  declined: 'warning',
  expired: 'warning',
  skipped: 'neutral',
  cancelled: 'neutral',
};
