/**
 * Which framework partner gets the next offer in a cascade round.
 *
 * Pure: takes plain data, returns an id. The demo calls this against its
 * in-memory store and the server calls it inside a transaction, so the two can
 * never disagree about whose turn it is.
 */

/**
 * How a lot orders its partners.
 * - `strict`   — always the lowest unused rank. The default, and what a plain
 *                cascade clause in a framework agreement means.
 * - `rotation` — among partners not yet offered this run, prefer whoever
 *                currently holds the fewest assigned orders, using rank to
 *                break ties. For volume balancing where the agreement allows it.
 */
export type RankingMode = 'strict' | 'rotation';

export interface CandidatePartner {
  /** id of the lot_partners row (a partner's membership of one lot) */
  lotPartnerId: string;
  /** 1-based position from the tender evaluation */
  rank: number;
  isActive: boolean;
  /** orders currently assigned or completed — only consulted in rotation mode */
  assignedCount: number;
}

/**
 * The next partner to offer to, or null when the cascade is exhausted.
 *
 * `alreadyOffered` holds the lotPartnerIds that have had an offer in the
 * *current run* — declined, expired, skipped or cancelled alike. A partner is
 * never offered the same run twice; restarting a cascade begins a new run and
 * clears the set, so everyone gets another chance under the revised terms.
 */
export function selectNextPartner(
  candidates: readonly CandidatePartner[],
  alreadyOffered: ReadonlySet<string>,
  mode: RankingMode = 'strict',
): string | null {
  const eligible = candidates.filter(
    (c) => c.isActive && !alreadyOffered.has(c.lotPartnerId),
  );
  if (eligible.length === 0) return null;

  const ordered = [...eligible].sort((a, b) => {
    if (mode === 'rotation' && a.assignedCount !== b.assignedCount) {
      return a.assignedCount - b.assignedCount;
    }
    return a.rank - b.rank;
  });

  return ordered[0].lotPartnerId;
}

/**
 * Ranks in cascade order, for showing the buyer who is next in line before
 * they start. Same ordering rule as selectNextPartner.
 */
export function cascadeOrder(
  candidates: readonly CandidatePartner[],
  mode: RankingMode = 'strict',
): CandidatePartner[] {
  return [...candidates]
    .filter((c) => c.isActive)
    .sort((a, b) => {
      if (mode === 'rotation' && a.assignedCount !== b.assignedCount) {
        return a.assignedCount - b.assignedCount;
      }
      return a.rank - b.rank;
    });
}
