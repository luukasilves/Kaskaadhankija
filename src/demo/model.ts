/**
 * Demo data model. Mirrors the server schema in PLAN.md field for field, so the
 * screens built here translate directly to the real tables. Held in memory and
 * mirrored to localStorage; nothing here is a system of record.
 */

import type {
  County,
  DeclineReason,
  OfferStatus,
  OrderLanguage,
  OrderStatus,
  WorkshopType,
} from '../domain/statuses';
import type { RankingMode } from '../domain/select-next';

export interface Lot {
  id: string;
  code: string;
  name: string;
  description: string;
  /** cascade config — per lot, because framework agreements may differ */
  responseDeadlineWorkingDays: number;
  deadlineLocalTime: string; // 'HH:MM' Tallinn
  rankingMode: RankingMode;
  allowSkip: boolean;
  isActive: boolean;
}

export interface Partner {
  id: string;
  name: string;
  regCode: string;
  isActive: boolean;
}

/** A partner's membership of one lot, carrying their rank from the tender. */
export interface LotPartner {
  id: string;
  lotId: string;
  partnerId: string;
  rank: number;
  contactName: string;
  contactEmail: string;
  unitPriceEur: number;
  isActive: boolean;
}

/** Cascade config frozen onto an order when its cascade starts. */
export interface CascadeSnapshot {
  responseDeadlineWorkingDays: number;
  deadlineLocalTime: string;
  rankingMode: RankingMode;
}

export interface Order {
  id: string;
  orderYear: number;
  orderSeq: number;
  lotId: string;
  title: string;
  workshopType: WorkshopType;
  eventStart: string; // ISO date, 'YYYY-MM-DD'
  eventEnd: string | null;
  county: County;
  locationText: string;
  participantCount: number;
  language: OrderLanguage;
  estimatedValueEur: number;
  extraNotes: string;
  status: OrderStatus;
  /** incremented each time a cascade is (re)started; offers carry the run they belong to */
  currentRun: number;
  snapshot: CascadeSnapshot | null;
  assignedLotPartnerId: string | null;
  assignedAt: number | null;
  createdAt: number;
  createdBy: string;
}

export interface Offer {
  id: string;
  orderId: string;
  lotPartnerId: string;
  runNo: number;
  roundNo: number;
  /**
   * Demo-only plaintext token. The server stores only a SHA-256 hash and the
   * raw value exists solely inside the email.
   */
  token: string;
  status: OfferStatus;
  isManual: boolean;
  sentAt: number | null;
  deadlineAt: number | null;
  respondedAt: number | null;
  declineReasonCode: DeclineReason | null;
  declineReasonText: string;
  skipJustification: string;
  createdAt: number;
}

export type ActorType = 'user' | 'partner' | 'system';

export interface AuditEvent {
  id: number;
  occurredAt: number;
  actorType: ActorType;
  actorLabel: string;
  eventType: string;
  summary: string;
  orderId: string | null;
  offerId: string | null;
  lotId: string | null;
  payload: Record<string, unknown> | null;
}

export type EmailTemplate =
  | 'offer'
  | 'accepted_partner'
  | 'accepted_team'
  | 'declined_team'
  | 'exhausted_team'
  | 'cancelled_partner';

export interface EmailMessage {
  id: string;
  template: EmailTemplate;
  toEmail: string;
  toName: string;
  subject: string;
  bodyHtml: string;
  orderId: string | null;
  offerId: string | null;
  sentAt: number;
  /** true for mail addressed to the buyer team rather than a partner */
  internal: boolean;
}

export interface DemoState {
  version: number;
  /** virtual clock = real now + this offset; only moves when the user moves it */
  clockOffsetMs: number;
  lots: Lot[];
  partners: Partner[];
  lotPartners: LotPartner[];
  orders: Order[];
  offers: Offer[];
  audit: AuditEvent[];
  emails: EmailMessage[];
  nextAuditId: number;
  introDismissed: boolean;
}

export const STATE_VERSION = 1;

export const DEMO_USER = 'Mari Tamm (Riigikantselei)';

let idCounter = 0;
export function newId(prefix: string): string {
  idCounter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${idCounter.toString(36)}${rand}`;
}

export function newToken(): string {
  // Demo-only: readable and unique is enough. The server uses 32 random bytes.
  return `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

const DAY_MS = 86_400_000;

/** ISO date string for an instant, in UTC terms (event dates are date-only). */
function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Push a date to the next Mon–Fri so seeded events look plausible. */
function nudgeToWeekday(ms: number): number {
  let out = ms;
  for (let i = 0; i < 7; i++) {
    const dow = new Date(out).getUTCDay();
    if (dow !== 0 && dow !== 6) return out;
    out += DAY_MS;
  }
  return out;
}

/**
 * Seed state. Dates are relative to `now` so the demo never looks stale, and
 * partner names are deliberately fictional — this must not be mistakable for
 * the real framework partner list.
 */
export function buildSeedState(now: number): DemoState {
  const lots: Lot[] = [
    {
      id: 'lot_1',
      code: 'OSA-1',
      name: 'Koolitused ruumirendiga',
      description:
        'Töötubade läbiviimine koolitaja pakutud ruumides koos vajaliku tehnika ja ruumiteenustega.',
      responseDeadlineWorkingDays: 3,
      deadlineLocalTime: '17:00',
      rankingMode: 'strict',
      allowSkip: true,
      isActive: true,
    },
    {
      id: 'lot_2',
      code: 'OSA-2',
      name: 'Koolitused ruumirendita',
      description:
        'Töötubade läbiviimine tellija määratud asukohas. Koolitaja vastutab sisu ja läbiviimise eest, ruumi ei paku.',
      responseDeadlineWorkingDays: 3,
      deadlineLocalTime: '17:00',
      rankingMode: 'strict',
      allowSkip: true,
      isActive: true,
    },
    {
      id: 'lot_3',
      code: 'OSA-3',
      name: 'Veebikoolitused',
      description:
        'Töötubade ettevalmistamine ja läbiviimine digikeskkonnas (Teams, Zoom või muu kokkulepitud platvorm).',
      responseDeadlineWorkingDays: 2,
      deadlineLocalTime: '17:00',
      rankingMode: 'strict',
      allowSkip: true,
      isActive: true,
    },
    {
      id: 'lot_4',
      code: 'OSA-4',
      name: 'Suursündmused',
      description:
        'Suurema osalejate arvuga sündmuste korraldamine ja läbiviimine (ettekanne, loeng, kaasloome või häkaton), sh tehniline koordineerimine, modereerimine, registreerimine ja logistika.',
      responseDeadlineWorkingDays: 5,
      deadlineLocalTime: '17:00',
      rankingMode: 'rotation',
      allowSkip: true,
      isActive: true,
    },
  ];

  const partners: Partner[] = [
    { id: 'p_1', name: 'Tehisaru Koolitus OÜ', regCode: '10000001', isActive: true },
    { id: 'p_2', name: 'AI Akadeemia OÜ', regCode: '10000002', isActive: true },
    { id: 'p_3', name: 'Digioskus MTÜ', regCode: '80000003', isActive: true },
    { id: 'p_4', name: 'Nutikoolitus OÜ', regCode: '10000004', isActive: true },
    { id: 'p_5', name: 'E-õppe Ekspert OÜ', regCode: '10000005', isActive: true },
  ];

  const contacts: Record<string, { name: string; email: string }> = {
    p_1: { name: 'Jaan Kask', email: 'jaan.kask@tehisaru-naidis.ee' },
    p_2: { name: 'Liis Mägi', email: 'liis.magi@ai-akadeemia-naidis.ee' },
    p_3: { name: 'Peeter Saar', email: 'peeter.saar@digioskus-naidis.ee' },
    p_4: { name: 'Kadri Lepik', email: 'kadri.lepik@nutikoolitus-naidis.ee' },
    p_5: { name: 'Toomas Rand', email: 'toomas.rand@eoppe-naidis.ee' },
  };

  // Rankings differ per lot, as they would after separate per-lot evaluations.
  const rankingByLot: Record<string, string[]> = {
    lot_1: ['p_1', 'p_2', 'p_4', 'p_5'],
    lot_2: ['p_2', 'p_3', 'p_1'],
    lot_3: ['p_5', 'p_1', 'p_2', 'p_3'],
    lot_4: ['p_3', 'p_4', 'p_2'],
  };

  const priceByLot: Record<string, number> = {
    lot_1: 1450,
    lot_2: 980,
    lot_3: 760,
    lot_4: 4800,
  };

  const lotPartners: LotPartner[] = [];
  for (const [lotId, partnerIds] of Object.entries(rankingByLot)) {
    partnerIds.forEach((partnerId, index) => {
      const contact = contacts[partnerId];
      lotPartners.push({
        id: `lp_${lotId}_${partnerId}`,
        lotId,
        partnerId,
        rank: index + 1,
        contactName: contact.name,
        contactEmail: contact.email,
        // small spread so the ranked prices look like real tender results
        unitPriceEur: priceByLot[lotId] + index * 65,
        isActive: true,
      });
    });
  }

  return {
    version: STATE_VERSION,
    clockOffsetMs: 0,
    lots,
    partners,
    lotPartners,
    orders: [],
    offers: [],
    audit: [],
    emails: [],
    nextAuditId: 1,
    introDismissed: false,
  };
}

/** Event dates for the seeded example orders, as ISO days relative to now. */
export function seedEventDates(now: number) {
  return {
    soon: isoDay(nudgeToWeekday(now + 12 * DAY_MS)),
    mid: isoDay(nudgeToWeekday(now + 21 * DAY_MS)),
    later: isoDay(nudgeToWeekday(now + 34 * DAY_MS)),
    latest: isoDay(nudgeToWeekday(now + 47 * DAY_MS)),
  };
}
