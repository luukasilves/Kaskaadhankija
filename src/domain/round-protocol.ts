/**
 * The round protocol as data [L-22].
 *
 * A protocol is the thing a person signs outside this system, so it must be a
 * *fact* rather than a rendering: the whole document is captured once, when the
 * round ends, as one JSON structure that is then hashed. The PDF and the .xlsx
 * annex are only two views of that structure, produced on demand — which is why
 * the fingerprint printed on the paper can be trusted to name the data, no
 * matter which version of the renderer drew it.
 *
 * Everything here is pure and has no imports from the server, so the shape can
 * be built in a test, hashed, and compared without a database.
 *
 * Two rules govern what may go in:
 *
 *  - **Only stored facts.** Nothing is recomputed at protocol time — not the
 *    allocation (the round's own snapshots are copied as they were stored), not
 *    a deadline (the extensions come from the audit rows that made them). A
 *    protocol that recalculated anything would drift from the decision it
 *    documents the moment a rule changed.
 *  - **Bids in arrival order.** Every confirmation row of the round is listed,
 *    not just the binding one, because the question a signer must be able to
 *    answer is "who answered what, and when" [K-09][D-09]. Which one bound is
 *    marked, taken from the final trace's `usedConfirmationId`.
 */

import type { CapKind } from './allocate';
import type { FrameworkIdentity } from './framework';
import type { AllocationSnapshot } from '@/db/schema';

export const PROTOCOL_SCHEMA_VERSION = 1;

/** Why a protocol exists: the round was confirmed, or cancelled while open. */
export type ProtocolKind = 'confirmed' | 'cancelled';

export const PROTOCOL_KIND_LABELS: Record<ProtocolKind, string> = {
  confirmed: 'Vooru lõpp-protokoll',
  cancelled: 'Vooru tühistamise protokoll',
};

export interface ProtocolDeadlineChange {
  /** the instant the deadline was moved to */
  at: number;
  /** what it was before */
  from: number | null;
  reason: string;
  by: string;
  occurredAt: number;
}

/** The conditions the round ran under — the half a signer checks first. */
export interface ProtocolConditions {
  visibilityMode: string;
  capOptions: string;
  /** [V-03] frozen at publication, so a later lot edit cannot rewrite history */
  workloadThreshold: number;
  responseWorkingDays: number;
  note: string;
  /** [L-20] what the scheme file asked for, when it did */
  plannedPublishAt: number | null;
  plannedDeadlineAt: number | null;
  publishedAt: number | null;
  publishedBy: string;
  /** the deadline as first set at publication */
  originalDeadlineAt: number | null;
  /** every extension since, oldest first [E-06] */
  deadlineChanges: ProtocolDeadlineChange[];
  /** the deadline that actually applied — the cut [J-05] */
  deadlineAt: number | null;
  expectedDecisionAt: number | null;
  cutAt: number | null;
  closedAt: number | null;
  confirmedAt: number | null;
  confirmedBy: string;
  cancelledAt: number | null;
  cancelReason: string;
}

export interface ProtocolTraining {
  code: string;
  title: string;
  workshopType: string;
  eventDate: string;
  eventEnd: string | null;
  county: string;
  locationText: string;
  participantCount: number;
  language: string;
  /** [V-04] withdrawn from the round; kept for the record */
  withdrawnAt: number | null;
  withdrawnReason: string;
  withdrawnBy: string;
}

export interface ProtocolParticipant {
  lotPartnerId: string;
  /** [V-07] the frozen rank; the order of this array */
  rank: number;
  partnerName: string;
  partnerRegCode: string;
  contactName: string;
  contactEmail: string;
  unitPriceEur: number;
  excludedAt: number | null;
  excludedReason: string;
  /**
   * [K-08] The recorded outcome at close, or null for a cancelled round.
   *
   * Stored as the code, not the label, and rendered through
   * `TRACE_OUTCOME_LABELS` — unlike the round's status and configuration, whose
   * labels *are* the wording the round ran under and are therefore frozen into
   * the protocol as text.
   */
  outcomeAtClose: string | null;
}

/** One row of the append-only `confirmations` table [K-09]. */
export interface ProtocolBid {
  /** 1-based position in arrival order — how the PDF refers to a bid */
  seq: number;
  confirmationId: number;
  lotPartnerId: string;
  partnerName: string;
  rank: number;
  kind: 'confirm' | 'decline_all';
  /** training codes, in the order the partner's marks were stored */
  marks: string[];
  cap: number | null;
  capKind: CapKind;
  confirmedAt: number;
  /** [D-09] who pressed it, including the admin behind an act-as */
  actorLabel: string;
  contactEmail: string;
  ip: string;
  ua: string;
  /** [K-04] this is the confirmation the final allocation used */
  binding: boolean;
}

export interface ProtocolAdjustment {
  lotPartnerId: string;
  partnerName: string;
  kind: 'skip' | 'cap' | 'clear';
  capValue: number | null;
  justification: string;
  createdBy: string;
  createdAt: number;
  /** the latest row per partner is the one that applied [T-02] */
  effective: boolean;
}

export interface ProtocolAllocationRow {
  trainingCode: string;
  /** partner name in the proposal, or null when nobody took it */
  proposed: string | null;
  /** partner name in the final allocation */
  final: string | null;
  /** the two differ — the buyer's adjustments moved it [T-03] */
  changed: boolean;
}

export interface ProtocolTraceRow {
  rank: number;
  partnerName: string;
  outcome: string;
  wanted: string[];
  taken: string[];
  limit: number | null;
  capKind: CapKind | null;
  participantLimit: number | null;
  participantsTaken: number;
  usedConfirmationId: number | null;
}

export interface ProtocolOrder {
  number: string;
  partnerName: string;
  partnerRegCode: string;
  trainingCodes: string[];
  totalEur: number;
  unitPriceEur: number;
  partnerConfirmedAt: number | null;
  buyerConfirmedAt: number;
  buyerConfirmedBy: string;
  status: string;
}

export interface ProtocolNotice {
  createdAt: number;
  type: string;
  recipientKind: string;
  recipientName: string;
  title: string;
}

export interface ProtocolAuditRow {
  id: number;
  occurredAt: number;
  eventType: string;
  actorLabel: string;
  viaLabel: string | null;
  summary: string;
}

/**
 * Everything a signed protocol asserts. Stored verbatim as the canonical JSON
 * whose SHA-256 is the protocol's identity, so any later change to any field
 * changes the fingerprint on the paper.
 */
export interface RoundProtocolData {
  schemaVersion: number;
  kind: ProtocolKind;
  generatedAt: number;
  generatedBy: string;
  framework: FrameworkIdentity;
  lot: {
    code: string;
    name: string;
    description: string;
  };
  round: {
    code: string;
    status: string;
    /** the round this one re-issued leftovers from [T-06] */
    originRoundCode: string | null;
    createdAt: number;
    createdBy: string;
  };
  conditions: ProtocolConditions;
  trainings: ProtocolTraining[];
  participants: ProtocolParticipant[];
  bids: ProtocolBid[];
  adjustments: ProtocolAdjustment[];
  allocation: {
    /** [V-06] the proposal frozen at the deadline, as stored */
    proposal: AllocationSnapshot | null;
    /** [T-04] the confirmed allocation, as stored */
    final: AllocationSnapshot | null;
    /** proposal beside final, per training */
    byTraining: ProtocolAllocationRow[];
    /** the final run's reasoning, one row per participant */
    trace: ProtocolTraceRow[];
    /** [J-06][T-06] training codes nobody took */
    leftover: string[];
  };
  orders: ProtocolOrder[];
  notices: ProtocolNotice[];
  audit: ProtocolAuditRow[];
}

/**
 * Deterministic JSON: object keys sorted, arrays left in their given order.
 *
 * The hash is over this text, so the ordering rule must not depend on how the
 * builder happened to construct the object. Array order is meaning (rank order,
 * arrival order) and is therefore preserved.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== 'object') return value;
  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    if (source[key] === undefined) continue;
    out[key] = sortKeys(source[key]);
  }
  return out;
}

/**
 * The short form printed in the PDF footer: the first 16 hex characters of the
 * SHA-256. Long enough that nobody will collide one by accident, short enough
 * to read off paper and compare against the screen.
 */
export function fingerprint(hashHex: string): string {
  return hashHex.slice(0, 16);
}

/** How the fingerprint is written where there is room for a label. */
export function fingerprintLine(hashHex: string): string {
  return `sõrmejälg ${fingerprint(hashHex)}`;
}

/* ------------------------------------------------------------------ *
 * shared wording — the PDF and the annex must say the same things
 * ------------------------------------------------------------------ */

export const BID_KIND_LABELS: Record<ProtocolBid['kind'], string> = {
  confirm: 'Kinnitas märked',
  decline_all: 'Loobus voorust',
};

export const ADJUSTMENT_KIND_LABELS: Record<ProtocolAdjustment['kind'], string> = {
  skip: 'Jäetakse vahele',
  cap: 'Piirmäär',
  clear: 'Kohandus eemaldatud',
};

export const TRACE_OUTCOME_LABELS: Record<string, string> = {
  confirmed: 'Kinnitas',
  declined_all: 'Loobus',
  no_response: 'Ei vastanud',
  excluded: 'Arvati välja',
  skipped_by_buyer: 'Tellija jättis vahele',
};

/** „kuni 5 koolitust“ / „piirmäärata“ — one phrasing for both renderers. */
export function capText(cap: number | null, capKind: CapKind): string {
  if (cap === null) return 'piirmäärata';
  return `kuni ${cap} ${capKind === 'participants' ? 'osalejat' : 'koolitust'}`;
}

/** The one-line summary under the protocol's title. */
export function protocolHeadline(data: RoundProtocolData): string {
  const orders = data.orders.length;
  const leftover = data.allocation.leftover.length;
  if (data.kind === 'cancelled') {
    return `Voor ${data.round.code} tühistati; ükski koolitus ei jaotatud.`;
  }
  return `Voor ${data.round.code}: ${orders} tellimust, jääk ${leftover} koolitust.`;
}

/**
 * How many partners actually answered — the figure a reader wants before
 * reading forty rows of bids.
 */
export function respondingPartnerCount(data: RoundProtocolData): number {
  return new Set(data.bids.map((bid) => bid.lotPartnerId)).size;
}
