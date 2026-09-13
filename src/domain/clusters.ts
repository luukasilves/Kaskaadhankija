/**
 * Clusters — a volume order as interchangeable groups [L-28][K-10][V-09].
 *
 * The buyer can order "500 participants in Harju county, October to December"
 * instead of a dated workshop. The application keeps "one row = one training =
 * at most one holder" [J-07] literally true by storing such an order as **G
 * identical group rows**: each is an ordinary training whose date is a period,
 * whose code ends in its position in the cluster (`KL-2026-001-07`), and whose
 * size is the cluster's group size (the last group carries the remainder).
 * Confirmations, the allocation, the protocol and the workload count all work
 * unchanged; the one algorithmic change is that a partner's request in a
 * cluster is a *count*, satisfied with the first still-unallocated groups
 * (`allocate.ts`).
 *
 * Pure: the import, the engine, the screens and the tests share these rules.
 */

/** A training's date: a day (`fixed`) or, for a cluster's group, a period. */
export type DateKind = 'fixed' | 'period';

/** A round holds dated trainings or clusters, never both [V-09]. */
export type RoundKind = 'fixed' | 'cluster';

export const ROUND_KIND_LABELS: Record<RoundKind, string> = {
  fixed: 'Kindla kuupäevaga koolitused',
  cluster: 'Klastrivoor — rühmad perioodi jooksul',
};

/** KK-2026-101 — a dated training, as before. */
export const TRAINING_CODE_RE = /^KK-\d{4}-\d{3,4}$/;
/** KL-2026-001 — a cluster, the code a file writes. */
export const CLUSTER_CODE_RE = /^KL-\d{4}-\d{3,4}$/;
/** KL-2026-001-07 — one group; derived, never written in a file. */
export const GROUP_CODE_RE = /^(KL-\d{4}-\d{3,4})-(\d{2})$/;

/** Two digits in the group code, so 99 is the ceiling. */
export const MAX_GROUPS = 99;

export function roundKindOf(dateKind: DateKind): RoundKind {
  return dateKind === 'period' ? 'cluster' : 'fixed';
}

export function pad2(index: number): string {
  return String(index).padStart(2, '0');
}

export function groupCode(clusterCode: string, index: number): string {
  return `${clusterCode}-${pad2(index)}`;
}

export function parseGroupCode(code: string): { clusterCode: string; groupIndex: number } | null {
  const match = GROUP_CODE_RE.exec(code);
  if (!match) return null;
  return { clusterCode: match[1]!, groupIndex: Number(match[2]) };
}

/* ------------------------------------------------------------------ *
 * unit words — „koolitust“ in a dated round, „rühma“ in a cluster round
 * ------------------------------------------------------------------ */

export interface UnitWords {
  /** nominative singular: koolitus / rühm */
  one: string;
  /** nominative plural: koolitused / rühmad */
  many: string;
  /** partitive after a numeral: 6 koolitust / 6 rühma */
  partitive: string;
  /** genitive plural: koolituste arv / rühmade arv */
  ofMany: string;
}

export const UNIT_WORDS: Record<RoundKind, UnitWords> = {
  fixed: { one: 'koolitus', many: 'koolitused', partitive: 'koolitust', ofMany: 'koolituste' },
  cluster: { one: 'rühm', many: 'rühmad', partitive: 'rühma', ofMany: 'rühmade' },
};

/** „6 koolitust“ / „6 rühma“ — the count with its unit, as every notice writes it. */
export function unitCount(kind: RoundKind, n: number): string {
  return `${n} ${UNIT_WORDS[kind].partitive}`;
}

/* ------------------------------------------------------------------ *
 * the group plan of one cluster row
 * ------------------------------------------------------------------ */

export interface GroupPlan {
  /** the nominal group size — „× kuni 50 osalejat“ */
  groupSize: number;
  groups: number;
  /** the size of each group, in group order */
  sizes: number[];
}

/**
 * How a cluster of `total` participants is cut into groups, from whichever of
 * `ruhma_suurus` and `ruhmi` the row gave. Both given must agree, so a row
 * cannot quietly mean two different things.
 *
 * With a group size the groups are filled and the last carries the remainder
 * („rühmad kuni 50, viimane 30“); with only a count the participants are spread
 * as evenly as the count allows, so no group is left nearly empty.
 */
export function planGroups(
  total: number,
  groupSize: number | null,
  groups: number | null,
): { ok: true; value: GroupPlan } | { ok: false; message: string } {
  if (groupSize === null && groups === null) {
    return { ok: false, message: 'klastri real on vaja rühma suurust (ruhma_suurus) või rühmade arvu (ruhmi)' };
  }
  if (groupSize !== null) {
    const needed = Math.ceil(total / groupSize);
    if (groups !== null && groups !== needed) {
      return {
        ok: false,
        message: `${groups} rühma × kuni ${groupSize} osalejat ei klapi ${total} osalejaga — ${total} osalejat rühmadena kuni ${groupSize} teeb ${needed} rühma`,
      };
    }
    if (needed > MAX_GROUPS) {
      return {
        ok: false,
        message: `${total} osalejat rühmadena kuni ${groupSize} teeb ${needed} rühma — lubatud on kuni ${MAX_GROUPS}; suurenda rühma või jaga klaster kaheks`,
      };
    }
    const sizes = Array.from({ length: needed }, (_, i) =>
      i === needed - 1 ? total - groupSize * (needed - 1) : groupSize,
    );
    return { ok: true, value: { groupSize, groups: needed, sizes } };
  }
  const count = groups!;
  if (count > total) {
    return { ok: false, message: `rühmi (${count}) ei saa olla rohkem kui osalejaid (${total})` };
  }
  const base = Math.floor(total / count);
  const extra = total % count;
  const sizes = Array.from({ length: count }, (_, i) => (i < extra ? base + 1 : base));
  return { ok: true, value: { groupSize: Math.max(...sizes), groups: count, sizes } };
}

/**
 * The buyer's estimate for the whole cluster, split over the groups in
 * proportion to their size, in whole euros with the remainder on the last
 * group — so the groups still add up to the cluster [L-26].
 */
export function splitEstimate(total: number, sizes: readonly number[]): number[] {
  if (sizes.length === 0) return [];
  if (total <= 0) return sizes.map(() => 0);
  const participants = sizes.reduce((sum, size) => sum + size, 0);
  const parts = sizes.map((size) => Math.floor((total * size) / Math.max(1, participants)));
  const assigned = parts.reduce((sum, part) => sum + part, 0);
  parts[parts.length - 1] = Math.round((parts[parts.length - 1]! + (total - assigned)) * 100) / 100;
  return parts;
}

/** „05–10“ for a contiguous run, „01, 03, 05“ otherwise, „07“ alone. */
export function groupIndexRange(indices: readonly number[]): string {
  const sorted = [...indices].sort((a, b) => a - b);
  if (sorted.length === 0) return '—';
  if (sorted.length === 1) return pad2(sorted[0]!);
  const contiguous = sorted.every((value, i) => i === 0 || value === sorted[i - 1]! + 1);
  if (contiguous) return `${pad2(sorted[0]!)}–${pad2(sorted[sorted.length - 1]!)}`;
  return sorted.map(pad2).join(', ');
}

/* ------------------------------------------------------------------ *
 * describing a cluster
 * ------------------------------------------------------------------ */

export interface GroupLike {
  groupIndex: number;
  participantCount: number;
}

/** The cluster's nominal group size: the largest group, since the last may be smaller. */
export function nominalGroupSize(groups: readonly GroupLike[]): number {
  return groups.reduce((max, g) => Math.max(max, g.participantCount), 0);
}

export function totalParticipants(groups: readonly GroupLike[]): number {
  return groups.reduce((sum, g) => sum + g.participantCount, 0);
}

/**
 * „10 rühma × kuni 50 osalejat (500 kokku)“ for a whole cluster, or
 * „6 rühma (05–10) × kuni 50 osalejat (300 kokku)“ for a partner's share of it.
 */
export function describeGroups(shown: readonly GroupLike[], all: readonly GroupLike[]): string {
  const size = nominalGroupSize(all.length > 0 ? all : shown);
  const partial = all.length > 0 && shown.length < all.length;
  const range = partial ? ` (${groupIndexRange(shown.map((g) => g.groupIndex))})` : '';
  return `${shown.length} rühma${range} × kuni ${size} osalejat (${totalParticipants(shown)} kokku)`;
}
