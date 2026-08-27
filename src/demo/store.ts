/**
 * Demo cascade engine and store.
 *
 * Applies the same state machine the server will run (see PLAN.md), against an
 * in-memory store mirrored to localStorage instead of SQLite. Ordering
 * decisions and deadline arithmetic are delegated to `src/domain/*`, so the
 * demo cannot drift from production behaviour on the parts that matter.
 */

import { addWorkingDays } from '../domain/working-days';
import {
  formatDateTime,
  formatEur,
  formatIsoDay,
  formatDateTimeShort,
} from '../domain/format';
import { type CandidatePartner, selectNextPartner } from '../domain/select-next';
import {
  DECLINE_REASON_LABELS,
  LANGUAGE_LABELS,
  WORKSHOP_TYPE_LABELS,
  type DeclineReason,
  type OrderStatus,
} from '../domain/statuses';
import {
  renderAcceptedPartnerEmail,
  renderAcceptedTeamEmail,
  renderCancelledPartnerEmail,
  renderDeclinedTeamEmail,
  renderExhaustedTeamEmail,
  renderOfferEmail,
  type OrderSummaryLines,
  type RenderedEmail,
} from '../domain/email-templates';
import {
  buildSeedState,
  DEMO_USER,
  newId,
  newToken,
  seedEventDates,
  STATE_VERSION,
  type ActorType,
  type AuditEvent,
  type DemoState,
  type EmailMessage,
  type EmailTemplate,
  type Lot,
  type LotPartner,
  type Offer,
  type Order,
  type Partner,
} from './model';

const STORAGE_KEY = 'kaskaadhankija.demo.v1';
const TEAM_EMAIL = 'eesti.ai-tellimused@naidis.riigikantselei.ee';
const TEAM_NAME = 'Eesti.ai tellimismeeskond';
const BASE_URL = 'https://kaskaadhankija.naidis';

let state: DemoState = buildSeedState(Date.now());

/* ------------------------------------------------------------------ *
 * clock
 * ------------------------------------------------------------------ */

/** Virtual now: real time plus whatever the user has fast-forwarded. */
export function now(): number {
  return Date.now() + state.clockOffsetMs;
}

export function clockOffsetMs(): number {
  return state.clockOffsetMs;
}

/** Move the demo clock forward, then let any passed deadlines take effect. */
export function advanceClock(ms: number): number {
  state.clockOffsetMs += Math.max(0, ms);
  const expired = expireOverdue();
  persist();
  return expired;
}

/** Jump to just past the current pending offer's deadline. */
export function advanceToNextDeadline(): number {
  const next = state.offers
    .filter((o) => o.status === 'pending' && o.deadlineAt !== null)
    .map((o) => o.deadlineAt as number)
    .sort((a, b) => a - b)[0];
  if (next === undefined) return 0;
  const delta = next - now() + 60_000;
  return advanceClock(Math.max(60_000, delta));
}

/* ------------------------------------------------------------------ *
 * persistence
 * ------------------------------------------------------------------ */

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private browsing, blocked site data, or a preview context. The demo still
    // works for this session; it just will not survive a reload.
  }
}

export function getState(): DemoState {
  return state;
}

export function resetDemo(): void {
  state = buildSeedState(Date.now());
  seedExampleOrders();
  persist();
}

export function initStore(): void {
  let restored: DemoState | null = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DemoState;
      if (parsed && parsed.version === STATE_VERSION) restored = parsed;
    }
  } catch {
    restored = null;
  }

  if (restored) {
    state = restored;
    expireOverdue();
    persist();
  } else {
    resetDemo();
  }
}

export function dismissIntro(): void {
  state.introDismissed = true;
  persist();
}

/* ------------------------------------------------------------------ *
 * selectors
 * ------------------------------------------------------------------ */

export function getLot(id: string): Lot | undefined {
  return state.lots.find((l) => l.id === id);
}

export function getPartner(id: string): Partner | undefined {
  return state.partners.find((p) => p.id === id);
}

export function getLotPartner(id: string): LotPartner | undefined {
  return state.lotPartners.find((lp) => lp.id === id);
}

export function getOrder(id: string): Order | undefined {
  return state.orders.find((o) => o.id === id);
}

export function getOffer(id: string): Offer | undefined {
  return state.offers.find((o) => o.id === id);
}

export function getOfferByToken(token: string): Offer | undefined {
  return state.offers.find((o) => o.token === token);
}

export function lotPartnersFor(lotId: string): LotPartner[] {
  return state.lotPartners.filter((lp) => lp.lotId === lotId).sort((a, b) => a.rank - b.rank);
}

export function partnerNameForLotPartner(lotPartnerId: string): string {
  const lp = getLotPartner(lotPartnerId);
  if (!lp) return 'tundmatu partner';
  return getPartner(lp.partnerId)?.name ?? 'tundmatu partner';
}

export function offersFor(orderId: string): Offer[] {
  return state.offers
    .filter((o) => o.orderId === orderId)
    .sort((a, b) => a.runNo - b.runNo || a.roundNo - b.roundNo);
}

export function pendingOfferFor(orderId: string): Offer | undefined {
  return state.offers.find((o) => o.orderId === orderId && o.status === 'pending');
}

export function allPendingOffers(): Offer[] {
  return state.offers
    .filter((o) => o.status === 'pending')
    .sort((a, b) => (a.deadlineAt ?? 0) - (b.deadlineAt ?? 0));
}

export function ordersByStatus(status: OrderStatus): Order[] {
  return state.orders.filter((o) => o.status === status);
}

export function allOrders(): Order[] {
  return [...state.orders].sort((a, b) => b.createdAt - a.createdAt);
}

export function auditFor(orderId: string): AuditEvent[] {
  return state.audit.filter((e) => e.orderId === orderId).sort((a, b) => a.id - b.id);
}

export function allAudit(): AuditEvent[] {
  return [...state.audit].sort((a, b) => b.id - a.id);
}

export function allEmails(): EmailMessage[] {
  return [...state.emails].sort((a, b) => b.sentAt - a.sentAt);
}

export function emailsFor(orderId: string): EmailMessage[] {
  return state.emails.filter((e) => e.orderId === orderId).sort((a, b) => b.sentAt - a.sentAt);
}

/** Orders currently held by a lot_partner — the volume-balancing figure. */
export function assignedCountFor(lotPartnerId: string): number {
  return state.orders.filter(
    (o) =>
      o.assignedLotPartnerId === lotPartnerId &&
      (o.status === 'assigned' || o.status === 'completed'),
  ).length;
}

export function assignedValueFor(lotPartnerId: string): number {
  return state.orders
    .filter(
      (o) =>
        o.assignedLotPartnerId === lotPartnerId &&
        (o.status === 'assigned' || o.status === 'completed'),
    )
    .reduce((sum, o) => sum + o.estimatedValueEur, 0);
}

export function offerOutcomeCounts(lotPartnerId: string) {
  const mine = state.offers.filter((o) => o.lotPartnerId === lotPartnerId);
  return {
    declined: mine.filter((o) => o.status === 'declined').length,
    expired: mine.filter((o) => o.status === 'expired').length,
    skipped: mine.filter((o) => o.status === 'skipped').length,
  };
}

export function orderNumber(order: Order): string {
  return `KH-${order.orderYear}-${String(order.orderSeq).padStart(4, '0')}`;
}

/* ------------------------------------------------------------------ *
 * audit + email plumbing
 * ------------------------------------------------------------------ */

interface AuditInput {
  at: number;
  actorType: ActorType;
  actorLabel: string;
  eventType: string;
  summary: string;
  orderId?: string | null;
  offerId?: string | null;
  lotId?: string | null;
  payload?: Record<string, unknown> | null;
}

function logAudit(input: AuditInput): void {
  state.audit.push({
    id: state.nextAuditId++,
    occurredAt: input.at,
    actorType: input.actorType,
    actorLabel: input.actorLabel,
    eventType: input.eventType,
    summary: input.summary,
    orderId: input.orderId ?? null,
    offerId: input.offerId ?? null,
    lotId: input.lotId ?? null,
    payload: input.payload ?? null,
  });
}

function recordEmail(
  at: number,
  template: EmailTemplate,
  toEmail: string,
  toName: string,
  rendered: RenderedEmail,
  orderId: string | null,
  offerId: string | null,
  internal: boolean,
): void {
  state.emails.push({
    id: newId('em'),
    template,
    toEmail,
    toName,
    subject: rendered.subject,
    bodyHtml: rendered.bodyHtml,
    orderId,
    offerId,
    sentAt: at,
    internal,
  });
}

function summaryLines(order: Order): OrderSummaryLines {
  const dates = order.eventEnd
    ? `${formatIsoDay(order.eventStart)} – ${formatIsoDay(order.eventEnd)}`
    : formatIsoDay(order.eventStart);
  const location = order.locationText.trim()
    ? `${order.county} — ${order.locationText}`
    : order.county;
  return {
    workshopType: WORKSHOP_TYPE_LABELS[order.workshopType],
    eventDates: dates,
    location,
    participantCount: order.participantCount,
    language: LANGUAGE_LABELS[order.language],
    estimatedValue: formatEur(order.estimatedValueEur),
    extraNotes: order.extraNotes,
  };
}

function orderUrl(order: Order): string {
  return `${BASE_URL}/orders/${order.id}`;
}

/* ------------------------------------------------------------------ *
 * order CRUD
 * ------------------------------------------------------------------ */

export interface OrderInput {
  lotId: string;
  title: string;
  workshopType: Order['workshopType'];
  eventStart: string;
  eventEnd: string | null;
  county: Order['county'];
  locationText: string;
  participantCount: number;
  language: Order['language'];
  estimatedValueEur: number;
  extraNotes: string;
}

function nextOrderSeq(year: number): number {
  const seqs = state.orders.filter((o) => o.orderYear === year).map((o) => o.orderSeq);
  return seqs.length === 0 ? 1 : Math.max(...seqs) + 1;
}

export function createOrder(input: OrderInput, at = now()): Order {
  const year = new Date(at).getFullYear();
  const order: Order = {
    id: newId('ord'),
    orderYear: year,
    orderSeq: nextOrderSeq(year),
    ...input,
    status: 'draft',
    currentRun: 0,
    snapshot: null,
    assignedLotPartnerId: null,
    assignedAt: null,
    createdAt: at,
    createdBy: DEMO_USER,
  };
  state.orders.push(order);
  logAudit({
    at,
    actorType: 'user',
    actorLabel: DEMO_USER,
    eventType: 'order.created',
    summary: `Tellimus ${orderNumber(order)} loodud`,
    orderId: order.id,
    lotId: order.lotId,
    payload: { title: order.title, hankeosa: getLot(order.lotId)?.code },
  });
  persist();
  return order;
}

export function updateOrder(orderId: string, input: OrderInput): void {
  const order = getOrder(orderId);
  if (!order) throw new Error('Tellimust ei leitud');
  if (order.status !== 'draft') {
    // Guard, not just a disabled button: an in-flight offer email must keep
    // matching the stored order.
    throw new Error('Kaskaadi ajal ei saa tellimust muuta. Katkesta kaskaad, seejärel muuda.');
  }
  const before = { ...order };
  Object.assign(order, input);
  logAudit({
    at: now(),
    actorType: 'user',
    actorLabel: DEMO_USER,
    eventType: 'order.updated',
    summary: `Tellimust ${orderNumber(order)} muudeti`,
    orderId: order.id,
    lotId: order.lotId,
    payload: { enne: { title: before.title, eventStart: before.eventStart }, parast: input },
  });
  persist();
}

/* ------------------------------------------------------------------ *
 * cascade
 * ------------------------------------------------------------------ */

function candidatesFor(lotId: string): CandidatePartner[] {
  return lotPartnersFor(lotId).map((lp) => ({
    lotPartnerId: lp.id,
    rank: lp.rank,
    isActive: lp.isActive,
    assignedCount: assignedCountFor(lp.id),
  }));
}

function offeredThisRun(orderId: string, runNo: number): Set<string> {
  return new Set(
    state.offers.filter((o) => o.orderId === orderId && o.runNo === runNo).map((o) => o.lotPartnerId),
  );
}

function nextRoundNo(orderId: string, runNo: number): number {
  const rounds = state.offers
    .filter((o) => o.orderId === orderId && o.runNo === runNo)
    .map((o) => o.roundNo);
  return rounds.length === 0 ? 1 : Math.max(...rounds) + 1;
}

/** Create and "send" a pending offer to one partner. */
function sendOffer(order: Order, lotPartnerId: string, at: number): Offer {
  const snapshot = order.snapshot;
  if (!snapshot) throw new Error('Kaskaadi konfiguratsioon puudub');
  const lp = getLotPartner(lotPartnerId);
  const lot = getLot(order.lotId);
  if (!lp || !lot) throw new Error('Hankeosa või partnerit ei leitud');

  const deadlineAt = addWorkingDays(
    new Date(at),
    snapshot.responseDeadlineWorkingDays,
    snapshot.deadlineLocalTime,
  ).getTime();

  const offer: Offer = {
    id: newId('off'),
    orderId: order.id,
    lotPartnerId,
    runNo: order.currentRun,
    roundNo: nextRoundNo(order.id, order.currentRun),
    token: newToken(),
    status: 'pending',
    isManual: false,
    sentAt: at,
    deadlineAt,
    respondedAt: null,
    declineReasonCode: null,
    declineReasonText: '',
    skipJustification: '',
    createdAt: at,
  };
  state.offers.push(offer);

  const partnerName = partnerNameForLotPartner(lotPartnerId);
  const rendered = renderOfferEmail({
    orderNumber: orderNumber(order),
    orderTitle: order.title,
    lotCode: lot.code,
    lotName: lot.name,
    contactName: lp.contactName,
    partnerName,
    deadlineText: formatDateTime(deadlineAt),
    offerUrl: `${BASE_URL}/offer/${offer.token}`,
    summary: summaryLines(order),
  });
  recordEmail(at, 'offer', lp.contactEmail, lp.contactName, rendered, order.id, offer.id, false);

  logAudit({
    at,
    actorType: 'system',
    actorLabel: 'Kaskaad',
    eventType: 'offer.sent',
    summary: `Pakkumus saadetud: ${partnerName} (koht ${lp.rank}), tähtaeg ${formatDateTimeShort(deadlineAt)}`,
    orderId: order.id,
    offerId: offer.id,
    lotId: order.lotId,
    payload: { partner: partnerName, koht: lp.rank, voor: offer.roundNo, kaskaadiRing: offer.runNo },
  });

  return offer;
}

/** Move to the next ranked partner, or fail the order when none are left. */
function advanceCascade(order: Order, at: number): void {
  const snapshot = order.snapshot;
  if (!snapshot) return;
  const nextId = selectNextPartner(
    candidatesFor(order.lotId),
    offeredThisRun(order.id, order.currentRun),
    snapshot.rankingMode,
  );

  if (nextId) {
    sendOffer(order, nextId, at);
    return;
  }

  order.status = 'failed';
  const attempts = state.offers.filter(
    (o) => o.orderId === order.id && o.runNo === order.currentRun,
  ).length;
  logAudit({
    at,
    actorType: 'system',
    actorLabel: 'Kaskaad',
    eventType: 'cascade.exhausted',
    summary: `Kaskaad ammendunud — ükski partner ei võtnud tellimust vastu (${attempts} pöördumist)`,
    orderId: order.id,
    lotId: order.lotId,
    payload: { poordumisi: attempts },
  });
  const lot = getLot(order.lotId);
  recordEmail(
    at,
    'exhausted_team',
    TEAM_EMAIL,
    TEAM_NAME,
    renderExhaustedTeamEmail({
      orderNumber: orderNumber(order),
      orderTitle: order.title,
      lotName: lot ? `${lot.code} — ${lot.name}` : order.lotId,
      attemptCount: attempts,
      orderUrl: orderUrl(order),
    }),
    order.id,
    null,
    true,
  );
}

export interface PreSkip {
  lotPartnerId: string;
  justification: string;
}

/** Start (or restart) the cascade for a draft order. */
export function startCascade(orderId: string, preSkips: PreSkip[] = []): void {
  const order = getOrder(orderId);
  if (!order) throw new Error('Tellimust ei leitud');
  if (order.status !== 'draft' && order.status !== 'failed') {
    throw new Error('Kaskaadi saab käivitada ainult ettevalmistuses või ebaõnnestunud tellimusel');
  }
  const lot = getLot(order.lotId);
  if (!lot) throw new Error('Hankeosa puudub');
  const active = lotPartnersFor(order.lotId).filter((lp) => lp.isActive);
  if (active.length === 0) throw new Error('Hankeosal puuduvad aktiivsed raamlepingu partnerid');

  const at = now();
  order.currentRun += 1;
  order.snapshot = {
    responseDeadlineWorkingDays: lot.responseDeadlineWorkingDays,
    deadlineLocalTime: lot.deadlineLocalTime,
    rankingMode: lot.rankingMode,
  };
  order.status = 'cascading';

  logAudit({
    at,
    actorType: 'user',
    actorLabel: DEMO_USER,
    eventType: 'cascade.started',
    summary: `Kaskaad käivitatud (ring ${order.currentRun}): vastamistähtaeg ${lot.responseDeadlineWorkingDays} tööpäeva, järjestus ${lot.rankingMode === 'strict' ? 'range' : 'rotatsioon'}`,
    orderId: order.id,
    lotId: order.lotId,
    payload: { ...order.snapshot, ring: order.currentRun },
  });

  // Pre-skips: partners the buyer bypasses before the first offer, each with a
  // recorded justification, so every rank considered is documented.
  for (const skip of preSkips) {
    if (!skip.justification.trim()) continue;
    const lp = getLotPartner(skip.lotPartnerId);
    if (!lp || !lp.isActive) continue;
    const offer: Offer = {
      id: newId('off'),
      orderId: order.id,
      lotPartnerId: skip.lotPartnerId,
      runNo: order.currentRun,
      roundNo: nextRoundNo(order.id, order.currentRun),
      token: '',
      status: 'skipped',
      isManual: false,
      sentAt: null,
      deadlineAt: null,
      respondedAt: at,
      declineReasonCode: null,
      declineReasonText: '',
      skipJustification: skip.justification.trim(),
      createdAt: at,
    };
    state.offers.push(offer);
    logAudit({
      at,
      actorType: 'user',
      actorLabel: DEMO_USER,
      eventType: 'offer.skipped',
      summary: `${partnerNameForLotPartner(skip.lotPartnerId)} (koht ${lp.rank}) jäeti vahele: ${offer.skipJustification}`,
      orderId: order.id,
      offerId: offer.id,
      lotId: order.lotId,
      payload: { pohjendus: offer.skipJustification, koht: lp.rank },
    });
  }

  advanceCascade(order, at);
  persist();
}

export type RespondResult =
  | { ok: true; action: 'accepted' | 'declined' }
  | { ok: false; reason: 'not_found' | 'already_responded' | 'expired' | 'cancelled' };

/**
 * A partner's answer, arriving through their tokenized link.
 *
 * The guards mirror the server's: the offer must still be pending, its order
 * must still be cascading, and the deadline must not have passed. A late click
 * expires the offer and advances the cascade — the "lazy expiry" backstop.
 */
export function respondToOffer(
  token: string,
  action: 'accept' | 'decline',
  declineReason: DeclineReason | null = null,
  declineText = '',
): RespondResult {
  const offer = getOfferByToken(token);
  if (!offer || !token) return { ok: false, reason: 'not_found' };
  const order = getOrder(offer.orderId);
  if (!order) return { ok: false, reason: 'not_found' };

  if (offer.status !== 'pending') {
    return { ok: false, reason: offer.status === 'cancelled' ? 'cancelled' : 'already_responded' };
  }
  if (order.status !== 'cascading') return { ok: false, reason: 'cancelled' };

  const at = now();
  if (offer.deadlineAt !== null && at > offer.deadlineAt) {
    expireOffer(offer, order, at);
    persist();
    return { ok: false, reason: 'expired' };
  }

  const lp = getLotPartner(offer.lotPartnerId);
  const partnerName = partnerNameForLotPartner(offer.lotPartnerId);

  if (action === 'accept') {
    offer.status = 'accepted';
    offer.respondedAt = at;
    order.status = 'assigned';
    order.assignedLotPartnerId = offer.lotPartnerId;
    order.assignedAt = at;

    logAudit({
      at,
      actorType: 'partner',
      actorLabel: `${partnerName} (partner)`,
      eventType: 'offer.accepted',
      summary: `${partnerName} võttis tellimuse vastu`,
      orderId: order.id,
      offerId: offer.id,
      lotId: order.lotId,
      payload: { koht: lp?.rank, voor: offer.roundNo },
    });

    if (lp) {
      recordEmail(
        at,
        'accepted_partner',
        lp.contactEmail,
        lp.contactName,
        renderAcceptedPartnerEmail({
          orderNumber: orderNumber(order),
          orderTitle: order.title,
          partnerName,
          contactName: lp.contactName,
          buyerContact: DEMO_USER,
          summary: summaryLines(order),
        }),
        order.id,
        offer.id,
        false,
      );
    }
    recordEmail(
      at,
      'accepted_team',
      TEAM_EMAIL,
      TEAM_NAME,
      renderAcceptedTeamEmail({
        orderNumber: orderNumber(order),
        orderTitle: order.title,
        partnerName,
        detail: `Vastus saadud ${formatDateTimeShort(at)}. Järjestuses koht ${lp?.rank ?? '?'}, kaskaadi voor ${offer.roundNo}.`,
        orderUrl: orderUrl(order),
      }),
      order.id,
      offer.id,
      true,
    );

    persist();
    return { ok: true, action: 'accepted' };
  }

  offer.status = 'declined';
  offer.respondedAt = at;
  offer.declineReasonCode = declineReason;
  offer.declineReasonText = declineText.trim();

  const reasonLabel = declineReason ? DECLINE_REASON_LABELS[declineReason] : 'põhjust ei märgitud';
  logAudit({
    at,
    actorType: 'partner',
    actorLabel: `${partnerName} (partner)`,
    eventType: 'offer.declined',
    summary: `${partnerName} loobus: ${reasonLabel}${offer.declineReasonText ? ` — ${offer.declineReasonText}` : ''}`,
    orderId: order.id,
    offerId: offer.id,
    lotId: order.lotId,
    payload: { pohjus: declineReason, selgitus: offer.declineReasonText, koht: lp?.rank },
  });

  advanceCascade(order, at);

  const nextOffer = pendingOfferFor(order.id);
  const nextName = nextOffer ? partnerNameForLotPartner(nextOffer.lotPartnerId) : null;
  recordEmail(
    at,
    'declined_team',
    TEAM_EMAIL,
    TEAM_NAME,
    renderDeclinedTeamEmail({
      orderNumber: orderNumber(order),
      orderTitle: order.title,
      partnerName,
      detail: `Põhjus: ${reasonLabel}${offer.declineReasonText ? ` (${offer.declineReasonText})` : ''}. ${nextName ? `Tellimus esitati järgmisele partnerile: ${nextName}.` : 'Järjestuses rohkem partnereid ei ole.'}`,
      orderUrl: orderUrl(order),
    }),
    order.id,
    offer.id,
    true,
  );

  persist();
  return { ok: true, action: 'declined' };
}

function expireOffer(offer: Offer, order: Order, at: number): void {
  offer.status = 'expired';
  offer.respondedAt = null;
  logAudit({
    at,
    actorType: 'system',
    actorLabel: 'Tähtaja jälgija',
    eventType: 'offer.expired',
    summary: `${partnerNameForLotPartner(offer.lotPartnerId)} ei vastanud tähtajaks (${formatDateTimeShort(offer.deadlineAt ?? at)})`,
    orderId: order.id,
    offerId: offer.id,
    lotId: order.lotId,
    payload: { tahtaeg: offer.deadlineAt },
  });
  advanceCascade(order, at);
}

/**
 * Expire every offer whose deadline has passed and advance its cascade.
 *
 * Loops, because expiring round N sends round N+1 with a deadline computed from
 * the expiry instant — which may itself already be in the past after a large
 * fast-forward. Bounded so a bad state cannot spin.
 */
export function expireOverdue(): number {
  let total = 0;
  for (let pass = 0; pass < 50; pass++) {
    const at = now();
    const due = state.offers.filter(
      (o) => o.status === 'pending' && o.deadlineAt !== null && o.deadlineAt < at,
    );
    if (due.length === 0) break;
    for (const offer of due) {
      const order = getOrder(offer.orderId);
      if (!order || order.status !== 'cascading') {
        offer.status = 'cancelled';
        continue;
      }
      expireOffer(offer, order, Math.max(offer.deadlineAt ?? at, 0));
      total += 1;
    }
  }
  return total;
}

/** Buyer bypasses the partner currently holding the offer. */
export function skipCurrentOffer(orderId: string, justification: string): void {
  const order = getOrder(orderId);
  if (!order) throw new Error('Tellimust ei leitud');
  const offer = pendingOfferFor(orderId);
  if (!offer) throw new Error('Ootel pakkumus puudub');
  if (!justification.trim()) throw new Error('Vahelejätmine nõuab põhjendust');

  const at = now();
  offer.status = 'skipped';
  offer.respondedAt = at;
  offer.skipJustification = justification.trim();
  logAudit({
    at,
    actorType: 'user',
    actorLabel: DEMO_USER,
    eventType: 'offer.skipped',
    summary: `${partnerNameForLotPartner(offer.lotPartnerId)} jäeti vahele: ${offer.skipJustification}`,
    orderId: order.id,
    offerId: offer.id,
    lotId: order.lotId,
    payload: { pohjendus: offer.skipJustification },
  });
  advanceCascade(order, at);
  persist();
}

/** Abort back to draft so the order can be edited and the cascade restarted. */
export function abortCascade(orderId: string): void {
  const order = getOrder(orderId);
  if (!order) throw new Error('Tellimust ei leitud');
  if (order.status !== 'cascading') throw new Error('Kaskaad ei ole käimas');

  const at = now();
  const offer = pendingOfferFor(orderId);
  if (offer) {
    offer.status = 'cancelled';
    offer.respondedAt = at;
    const lp = getLotPartner(offer.lotPartnerId);
    if (lp) {
      recordEmail(
        at,
        'cancelled_partner',
        lp.contactEmail,
        lp.contactName,
        renderCancelledPartnerEmail({
          orderNumber: orderNumber(order),
          orderTitle: order.title,
          contactName: lp.contactName,
          reason: 'Tellija katkestas kaskaadi tingimuste muutmiseks.',
        }),
        order.id,
        offer.id,
        false,
      );
    }
  }
  order.status = 'draft';
  logAudit({
    at,
    actorType: 'user',
    actorLabel: DEMO_USER,
    eventType: 'cascade.aborted',
    summary: 'Kaskaad katkestati, tellimus viidi tagasi ettevalmistusse',
    orderId: order.id,
    offerId: offer?.id ?? null,
    lotId: order.lotId,
  });
  persist();
}

/** Direct assignment with a justification — covers phone agreements and salvage. */
export function manualAssign(orderId: string, lotPartnerId: string, justification: string): void {
  const order = getOrder(orderId);
  if (!order) throw new Error('Tellimust ei leitud');
  if (order.status === 'assigned' || order.status === 'completed' || order.status === 'cancelled') {
    throw new Error('Tellimus on juba lõpetatud või määratud');
  }
  if (!justification.trim()) throw new Error('Käsitsi määramine nõuab põhjendust');

  const at = now();
  const pending = pendingOfferFor(orderId);
  if (pending) {
    pending.status = 'cancelled';
    pending.respondedAt = at;
  }
  if (order.currentRun === 0) order.currentRun = 1;

  const offer: Offer = {
    id: newId('off'),
    orderId: order.id,
    lotPartnerId,
    runNo: order.currentRun,
    roundNo: nextRoundNo(order.id, order.currentRun),
    token: '',
    status: 'accepted',
    isManual: true,
    sentAt: null,
    deadlineAt: null,
    respondedAt: at,
    declineReasonCode: null,
    declineReasonText: '',
    skipJustification: justification.trim(),
    createdAt: at,
  };
  state.offers.push(offer);

  order.status = 'assigned';
  order.assignedLotPartnerId = lotPartnerId;
  order.assignedAt = at;

  logAudit({
    at,
    actorType: 'user',
    actorLabel: DEMO_USER,
    eventType: 'order.assigned_manually',
    summary: `Määratud käsitsi: ${partnerNameForLotPartner(lotPartnerId)} — ${justification.trim()}`,
    orderId: order.id,
    offerId: offer.id,
    lotId: order.lotId,
    payload: { pohjendus: justification.trim() },
  });
  persist();
}

export function cancelOrder(orderId: string, reason: string): void {
  const order = getOrder(orderId);
  if (!order) throw new Error('Tellimust ei leitud');
  if (order.status === 'cancelled' || order.status === 'completed') return;

  const at = now();
  const pending = pendingOfferFor(orderId);
  if (pending) {
    pending.status = 'cancelled';
    pending.respondedAt = at;
    const lp = getLotPartner(pending.lotPartnerId);
    if (lp) {
      recordEmail(
        at,
        'cancelled_partner',
        lp.contactEmail,
        lp.contactName,
        renderCancelledPartnerEmail({
          orderNumber: orderNumber(order),
          orderTitle: order.title,
          contactName: lp.contactName,
          reason,
        }),
        order.id,
        pending.id,
        false,
      );
    }
  }
  order.status = 'cancelled';
  logAudit({
    at,
    actorType: 'user',
    actorLabel: DEMO_USER,
    eventType: 'order.cancelled',
    summary: `Tellimus tühistatud${reason.trim() ? `: ${reason.trim()}` : ''}`,
    orderId: order.id,
    lotId: order.lotId,
  });
  persist();
}

export function completeOrder(orderId: string): void {
  const order = getOrder(orderId);
  if (!order) throw new Error('Tellimust ei leitud');
  if (order.status !== 'assigned') throw new Error('Lõpetada saab ainult määratud tellimuse');
  order.status = 'completed';
  logAudit({
    at: now(),
    actorType: 'user',
    actorLabel: DEMO_USER,
    eventType: 'order.completed',
    summary: 'Tellimus märgiti lõpetatuks',
    orderId: order.id,
    lotId: order.lotId,
  });
  persist();
}

/** Re-send the live offer and restart its clock — used after a mail failure. */
export function resendCurrentOffer(orderId: string): void {
  const order = getOrder(orderId);
  const offer = order ? pendingOfferFor(orderId) : undefined;
  if (!order || !offer || !order.snapshot) throw new Error('Ootel pakkumus puudub');

  const at = now();
  const lp = getLotPartner(offer.lotPartnerId);
  const lot = getLot(order.lotId);
  if (!lp || !lot) throw new Error('Partnerit või hankeosa ei leitud');

  offer.sentAt = at;
  offer.deadlineAt = addWorkingDays(
    new Date(at),
    order.snapshot.responseDeadlineWorkingDays,
    order.snapshot.deadlineLocalTime,
  ).getTime();

  recordEmail(
    at,
    'offer',
    lp.contactEmail,
    lp.contactName,
    renderOfferEmail({
      orderNumber: orderNumber(order),
      orderTitle: order.title,
      lotCode: lot.code,
      lotName: lot.name,
      contactName: lp.contactName,
      partnerName: partnerNameForLotPartner(offer.lotPartnerId),
      deadlineText: formatDateTime(offer.deadlineAt),
      offerUrl: `${BASE_URL}/offer/${offer.token}`,
      summary: summaryLines(order),
    }),
    order.id,
    offer.id,
    false,
  );

  logAudit({
    at,
    actorType: 'user',
    actorLabel: DEMO_USER,
    eventType: 'offer.resent',
    summary: `Pakkumus saadeti uuesti, uus tähtaeg ${formatDateTimeShort(offer.deadlineAt)}`,
    orderId: order.id,
    offerId: offer.id,
    lotId: order.lotId,
  });
  persist();
}

/* ------------------------------------------------------------------ *
 * lot + partner admin
 * ------------------------------------------------------------------ */

export interface LotConfigInput {
  responseDeadlineWorkingDays: number;
  deadlineLocalTime: string;
  rankingMode: Lot['rankingMode'];
  allowSkip: boolean;
}

export function updateLotConfig(lotId: string, input: LotConfigInput): void {
  const lot = getLot(lotId);
  if (!lot) throw new Error('Hankeosa ei leitud');
  const before = {
    responseDeadlineWorkingDays: lot.responseDeadlineWorkingDays,
    deadlineLocalTime: lot.deadlineLocalTime,
    rankingMode: lot.rankingMode,
    allowSkip: lot.allowSkip,
  };
  Object.assign(lot, input);
  logAudit({
    at: now(),
    actorType: 'user',
    actorLabel: DEMO_USER,
    eventType: 'lot.config_changed',
    summary: `${lot.code} kaskaadi seaded muudetud (${input.responseDeadlineWorkingDays} tööpäeva, ${input.rankingMode === 'strict' ? 'range järjestus' : 'rotatsioon'})`,
    lotId: lot.id,
    payload: { enne: before, parast: input },
  });
  persist();
}

/** Move a partner up or down the ranking, renumbering the lot contiguously. */
export function moveLotPartner(lotPartnerId: string, direction: -1 | 1): void {
  const lp = getLotPartner(lotPartnerId);
  if (!lp) return;
  const siblings = lotPartnersFor(lp.lotId);
  const index = siblings.findIndex((s) => s.id === lotPartnerId);
  const target = index + direction;
  if (target < 0 || target >= siblings.length) return;

  const swap = siblings[target];
  const fromRank = lp.rank;
  lp.rank = swap.rank;
  swap.rank = fromRank;

  logAudit({
    at: now(),
    actorType: 'user',
    actorLabel: DEMO_USER,
    eventType: 'partner.rank_changed',
    summary: `${partnerNameForLotPartner(lp.id)}: koht ${fromRank} → ${lp.rank} (${getLot(lp.lotId)?.code})`,
    lotId: lp.lotId,
    payload: { partner: partnerNameForLotPartner(lp.id), enne: fromRank, parast: lp.rank },
  });
  persist();
}

export function toggleLotPartnerActive(lotPartnerId: string): void {
  const lp = getLotPartner(lotPartnerId);
  if (!lp) return;
  lp.isActive = !lp.isActive;
  logAudit({
    at: now(),
    actorType: 'user',
    actorLabel: DEMO_USER,
    eventType: 'partner.rank_changed',
    summary: `${partnerNameForLotPartner(lp.id)} ${lp.isActive ? 'aktiveeritud' : 'deaktiveeritud'} hankeosas ${getLot(lp.lotId)?.code}`,
    lotId: lp.lotId,
  });
  persist();
}

/* ------------------------------------------------------------------ *
 * example orders
 * ------------------------------------------------------------------ */

const DAY = 86_400_000;

/**
 * Populate the demo by *replaying* real operations against a rewound clock, so
 * the seeded audit trail and mailbox are genuine rather than fabricated rows.
 */
function seedExampleOrders(): void {
  const dates = seedEventDates(Date.now());
  const realOffset = state.clockOffsetMs;

  const withClockAt = (msAgo: number, fn: () => void) => {
    state.clockOffsetMs = realOffset - msAgo;
    fn();
  };

  // 1. Rank 1 declined, rank 2 accepted — the canonical cascade outcome.
  withClockAt(11 * DAY, () => {
    const order = createOrder({
      lotId: 'lot_1',
      title: 'Töötuba 1 Tallinna linnavalitsuse teenistujatele',
      workshopType: 'tootuba_1',
      eventStart: dates.mid,
      eventEnd: null,
      county: 'Harju maakond',
      locationText: 'Koolitaja pakutud ruumid kesklinnas',
      participantCount: 28,
      language: 'et',
      estimatedValueEur: 1450,
      extraNotes: 'Osalejad on valdavalt AI-tööriistadega varem kokku puutunud.',
    });
    startCascade(order.id);
  });

  withClockAt(9 * DAY, () => {
    const order = state.orders[0];
    const offer = pendingOfferFor(order.id);
    if (offer) respondToOffer(offer.token, 'decline', 'no_capacity', 'Koolitajad on sel perioodil hõivatud.');
  });

  withClockAt(8 * DAY, () => {
    const order = state.orders[0];
    const offer = pendingOfferFor(order.id);
    if (offer) respondToOffer(offer.token, 'accept');
  });

  // 2. Large event under rotation ranking, accepted straight away.
  withClockAt(6 * DAY, () => {
    const order = createOrder({
      lotId: 'lot_4',
      title: 'Eesti.ai kaasloomepäev avaliku sektori juhtidele',
      workshopType: 'suursundmus',
      eventStart: dates.latest,
      eventEnd: null,
      county: 'Tartu maakond',
      locationText: 'Tartu, täpsustatakse kokkuleppel',
      participantCount: 180,
      language: 'et',
      estimatedValueEur: 4800,
      extraNotes: 'Vajalik modereerimine, registreerimine ja tehniline koordineerimine.',
    });
    startCascade(order.id);
    const offer = pendingOfferFor(order.id);
    if (offer) respondToOffer(offer.token, 'accept');
  });

  // 3. A live cascade waiting for an answer — what the demo opens on.
  withClockAt(1 * DAY, () => {
    const order = createOrder({
      lotId: 'lot_3',
      title: 'Töötuba 2 veebis Sotsiaalkindlustusameti spetsialistidele',
      workshopType: 'tootuba_2',
      eventStart: dates.soon,
      eventEnd: null,
      county: 'Veebipõhine',
      locationText: 'MS Teams',
      participantCount: 45,
      language: 'et',
      estimatedValueEur: 760,
      extraNotes: 'Vajalik salvestus ja järelvaatamise võimalus.',
    });
    startCascade(order.id);
  });

  // 4. A draft, so the "start cascade" flow is available to try immediately.
  state.clockOffsetMs = realOffset;
  createOrder({
    lotId: 'lot_2',
    title: 'Töötuba 1 Pärnu haridusasutuste töötajatele',
    workshopType: 'tootuba_1',
    eventStart: dates.later,
    eventEnd: null,
    county: 'Pärnu maakond',
    locationText: 'Pärnu Kesklinna kool, tellija ruumid',
    participantCount: 32,
    language: 'et',
    estimatedValueEur: 980,
    extraNotes: '',
  });

  state.clockOffsetMs = realOffset;
  state.introDismissed = false;
}
