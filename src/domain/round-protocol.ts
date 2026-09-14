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
import { groupIndexRange, type DateKind } from './clusters';
import { formatPeriod } from './format';
import type { FrameworkIdentity } from './framework';
import type { AllocationSnapshot } from '@/db/schema';

/**
 * 2 (v2.6): trainings carry the target group; the renderers add a per-partner
 * section derived from the allocation. Stored v1 protocols are never rewritten,
 * so every reader treats the new field as optional.
 */
export const PROTOCOL_SCHEMA_VERSION = 2;

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
  /** the label from `TARGET_GROUPS`; absent in protocols stored before schema 2 */
  targetGroup?: string;
  /**
   * [L-28] Set on a cluster's group (v2.7): its period stands in `eventDate`/
   * `eventEnd`, and the cluster and position name it. Absent on a dated
   * training and in every earlier protocol, which therefore read unchanged.
   */
  dateKind?: DateKind;
  clusterCode?: string;
  groupIndex?: number;
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
  /** the partner's framework price per participant in this lot [T-08] */
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
  const leftover = data.allocation.leftover.length;
  const cluster = isClusterProtocol(data);
  if (data.kind === 'cancelled') {
    return `Voor ${data.round.code} tühistati; ${cluster ? 'ükski rühm' : 'ükski koolitus'} ei jaotatud.`;
  }
  const byPartner = allocationByPartner(data);
  const allocated = byPartner.reduce((sum, row) => sum + row.trainings.length, 0);
  const unit = cluster ? 'rühma' : 'koolitust';
  return `Voor ${data.round.code}: ${allocated} ${unit} ${byPartner.length} täitjale, jääk ${leftover} ${unit}.`;
}

/** [V-09] A protocol of a cluster round: its trainings are groups. */
export function isClusterProtocol(data: RoundProtocolData): boolean {
  return data.trainings.some((t) => t.dateKind === 'period');
}

export interface ProtocolClusterHolder {
  rank: number;
  partnerName: string;
  groupCount: number;
  indices: number[];
  participantCount: number;
}

export interface ProtocolClusterRow {
  clusterCode: string;
  title: string;
  /** „okt–dets 2026“ */
  periodText: string;
  /** non-withdrawn groups */
  groupCount: number;
  participantCount: number;
  holders: ProtocolClusterHolder[];
  leftoverIndices: number[];
}

/**
 * [L-22][K-10] The cluster summary: for each cluster, who holds how many of its
 * groups — the „Klastrite kokkuvõte“ of the PDF and the annex. A derivation
 * over `allocation.byTraining` and `trainings`, like `allocationByPartner`.
 */
export function clusterSummary(data: RoundProtocolData): ProtocolClusterRow[] {
  const finalByCode = new Map(data.allocation.byTraining.map((row) => [row.trainingCode, row.final] as const));
  const rankOf = new Map(data.participants.map((p) => [p.partnerName, p.rank] as const));
  const rows: ProtocolClusterRow[] = [];
  for (const training of data.trainings) {
    if (training.dateKind !== 'period' || !training.clusterCode || training.withdrawnAt !== null) continue;
    if (rows.some((row) => row.clusterCode === training.clusterCode)) continue;
    const groups = data.trainings
      .filter((t) => t.clusterCode === training.clusterCode && t.withdrawnAt === null)
      .sort((a, b) => (a.groupIndex ?? 0) - (b.groupIndex ?? 0));
    const holders = new Map<string, ProtocolClusterHolder>();
    const leftoverIndices: number[] = [];
    for (const group of groups) {
      const holder = finalByCode.get(group.code) ?? null;
      if (holder === null) {
        leftoverIndices.push(group.groupIndex ?? 0);
        continue;
      }
      const entry = holders.get(holder) ?? {
        rank: rankOf.get(holder) ?? 0,
        partnerName: holder,
        groupCount: 0,
        indices: [],
        participantCount: 0,
      };
      entry.groupCount += 1;
      entry.indices.push(group.groupIndex ?? 0);
      entry.participantCount += group.participantCount;
      holders.set(holder, entry);
    }
    rows.push({
      clusterCode: training.clusterCode,
      title: training.title,
      periodText: formatPeriod(training.eventDate, training.eventEnd),
      groupCount: groups.length,
      participantCount: groups.reduce((sum, g) => sum + g.participantCount, 0),
      holders: [...holders.values()].sort((a, b) => a.rank - b.rank),
      leftoverIndices,
    });
  }
  return rows;
}

/** „05–10“ — the annex and the PDF print a holder's groups the same way. */
export function clusterGroupsText(indices: readonly number[]): string {
  return groupIndexRange(indices);
}

export interface ProtocolPartnerAllocation {
  rank: number;
  partnerName: string;
  partnerRegCode: string;
  /** the partner's price per participant in the lot [T-08] */
  unitPriceEur: number;
  /** Σ max participants × price per participant */
  maxPriceEur: number;
  participantCount: number;
  trainings: ProtocolTraining[];
}

/**
 * The final allocation grouped by partner, in rank order — „kes teeb mitu
 * koolitust tervishoiutöötajatele, kus“, which is the list the buyer reads off
 * the protocol when preparing the decision. A derivation over stored facts
 * (`allocation.byTraining` joined to `trainings` and `participants`), never a
 * recomputation, so it serves protocols of every schema version.
 */
export function allocationByPartner(data: RoundProtocolData): ProtocolPartnerAllocation[] {
  const trainingByCode = new Map(data.trainings.map((t) => [t.code, t] as const));
  const groups = new Map<string, ProtocolTraining[]>();
  for (const row of data.allocation.byTraining) {
    if (row.final === null) continue;
    const training = trainingByCode.get(row.trainingCode);
    if (!training) continue;
    const list = groups.get(row.final) ?? [];
    list.push(training);
    groups.set(row.final, list);
  }
  return data.participants
    .filter((p) => groups.has(p.partnerName))
    .map((p) => {
      const list = [...(groups.get(p.partnerName) ?? [])].sort(
        (a, b) => a.eventDate.localeCompare(b.eventDate) || a.code.localeCompare(b.code),
      );
      const participantCount = list.reduce((sum, t) => sum + t.participantCount, 0);
      return {
        rank: p.rank,
        partnerName: p.partnerName,
        partnerRegCode: p.partnerRegCode,
        unitPriceEur: p.unitPriceEur,
        maxPriceEur: Math.round(participantCount * p.unitPriceEur * 100) / 100,
        participantCount,
        trainings: list,
      };
    });
}

/**
 * How many partners actually answered — the figure a reader wants before
 * reading forty rows of bids.
 */
export function respondingPartnerCount(data: RoundProtocolData): number {
  return new Set(data.bids.map((bid) => bid.lotPartnerId)).size;
}
