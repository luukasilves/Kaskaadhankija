/**
 * One line per training for notices — and one line per **cluster** in a
 * cluster round, because a partner reading a mail about "500 participants in
 * Harju county" should see the order, not ten identical rows [D-01][L-28].
 *
 * Pure: the engine loads the rows and hands them here, so a test can hold the
 * wording to account without a database.
 */

import { describeGroups, type DateKind, type GroupLike } from './clusters';
import { formatIsoDay, formatPeriod } from './format';

export interface TrainingLineRow {
  id: string;
  code: string;
  title: string;
  dateKind: DateKind;
  eventDate: string;
  eventEnd: string | null;
  clusterCode: string | null;
  groupIndex: number | null;
  /** the Estonian label, not the key */
  workshopTypeLabel: string;
  county: string;
  locationText: string;
  participantCount: number;
}

/**
 * The groups each cluster has in scope — the whole round's, so a partner's six
 * groups read as „6 rühma (05–10)“ of the ten. Without it a cluster is
 * described by the rows given.
 */
export type ClusterGroups = ReadonlyMap<string, readonly GroupLike[]>;

function place(row: TrainingLineRow): string {
  return `${row.county}${row.locationText ? `, ${row.locationText}` : ''}`;
}

/** The dated form — unchanged since v2.6, so stored notices still match. */
export function fixedTrainingLine(row: TrainingLineRow): string {
  return `${row.code} — ${row.title} · ${formatIsoDay(row.eventDate)} · ${row.workshopTypeLabel} · ${place(row)} · ${row.participantCount} osalejat`;
}

/** „KL-2026-001 — Töötuba 1 … · okt–dets 2026 · Töötuba 1 · Harju maakond · 10 rühma × kuni 50 osalejat (500 kokku)“ */
export function clusterLine(rows: readonly TrainingLineRow[], all: readonly GroupLike[]): string {
  const head = rows[0]!;
  const shown: GroupLike[] = rows.map((r) => ({ groupIndex: r.groupIndex ?? 0, participantCount: r.participantCount }));
  return `${head.clusterCode ?? head.code} — ${head.title} · ${formatPeriod(head.eventDate, head.eventEnd)} · ${head.workshopTypeLabel} · ${place(head)} · ${describeGroups(shown, all)}`;
}

/** Sort as every list does: by date, then code — so groups come out in order. */
export function sortLineRows<T extends { eventDate: string; code: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => a.eventDate.localeCompare(b.eventDate) || a.code.localeCompare(b.code));
}

/**
 * The lines for a set of trainings: dated ones singly, a cluster's groups as
 * one line, in (date, code) order of first appearance.
 */
export function trainingLines(rows: readonly TrainingLineRow[], clusterGroups?: ClusterGroups): string[] {
  const lines: string[] = [];
  const seenClusters = new Set<string>();
  const sorted = sortLineRows(rows);
  for (const row of sorted) {
    if (row.dateKind !== 'period' || !row.clusterCode) {
      lines.push(fixedTrainingLine(row));
      continue;
    }
    if (seenClusters.has(row.clusterCode)) continue;
    seenClusters.add(row.clusterCode);
    const groupRows = sorted.filter((r) => r.clusterCode === row.clusterCode);
    lines.push(clusterLine(groupRows, clusterGroups?.get(row.clusterCode) ?? []));
  }
  return lines;
}
