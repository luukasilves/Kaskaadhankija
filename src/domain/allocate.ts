/**
 * Parallel-cascade allocation — the heart of the system.
 *
 * A pure transcription of the business-logic spec (`docs/kaskaadi-ariloogika.md`),
 * section J. Dependency-free and side-effect-free, so the same function serves
 * all three cut points of rule [J-05]:
 *
 *   - **prognoos**        cutAt = now,        adjustments = []
 *   - **jaotusettepanek** cutAt = deadlineAt, adjustments = []
 *   - **lõplik jaotus**   cutAt = deadlineAt, adjustments = buyer's
 *
 * Nothing displayed to anyone is computed any other way, so a partner's
 * projection and the eventual allocation can only differ because someone's
 * confirmed marks changed — never because two code paths disagreed.
 *
 * Rule IDs in comments refer to that document; the tests are named after them.
 */

/** How a partner's ceiling is counted [K-06][L-17]. */
export type CapKind = 'trainings' | 'participants';

/** One training in the round. `eventDate` is an ISO day, 'YYYY-MM-DD'. */
export interface AllocationTraining {
  id: string;
  code: string;
  eventDate: string;
  /**
   * Trainees. Absent in snapshots frozen before participant caps existed; they
   * cannot contain such a cap, so the figure only matters for display there.
   */
  participantCount?: number;
}

/** One row of the append-only `confirmations` table, as the algorithm sees it. */
export interface ConfirmationSnapshot {
  /** autoincrement id — the tiebreak when two confirmations share a millisecond */
  id: number;
  kind: 'confirm' | 'decline_all';
  /** training ids the partner marked */
  marks: string[];
  /** "võtan vastu kuni N koolitust" / "kuni N osalejat", or null for no limit [K-06] */
  cap: number | null;
  /** what `cap` counts; absent means trainings (the only kind before v2.2) */
  capKind?: CapKind;
  confirmedAt: number;
}

export interface AllocationParticipant {
  lotPartnerId: string;
  /** rank frozen at publication [V-07] */
  rank: number;
  /** deactivated mid-round [E-01] */
  excluded: boolean;
  /** every confirmation this partner made in this round, any order */
  confirmations: ConfirmationSnapshot[];
}

/** A buyer adjustment at review time [T-02]. Justification is enforced upstream. */
export type BuyerAdjustment =
  | { lotPartnerId: string; kind: 'skip' }
  | { lotPartnerId: string; kind: 'cap'; cap: number };

export interface AllocationInput {
  roundId: string;
  /** lõikehetk [J-05] — confirmations after this instant are ignored */
  cutAt: number;
  /** withdrawn trainings must already be excluded by the caller [V-04] */
  trainings: AllocationTraining[];
  participants: AllocationParticipant[];
  /** empty for projections and the proposal [N-09] */
  adjustments: BuyerAdjustment[];
}

export type ParticipantOutcome =
  | 'confirmed'
  | 'declined_all'
  | 'no_response'
  | 'excluded'
  | 'skipped_by_buyer';

/** Why one participant got what they got — the audit-friendly explanation. */
export interface AllocationTraceStep {
  lotPartnerId: string;
  rank: number;
  outcome: ParticipantOutcome;
  /** confirmed marks still unallocated when their turn came, in take order */
  wanted: string[];
  /** effective limit on the *number* of trainings (own training cap ∧ buyer cap), or null */
  limit: number | null;
  /** the partner's own cap kind, or null without a cap of their own */
  capKind: CapKind | null;
  /** the partner's trainee budget, when their cap counts participants */
  participantLimit: number | null;
  /** trainees in the trainings taken */
  participantsTaken: number;
  taken: string[];
  /** which confirmation was binding [K-04] */
  usedConfirmationId: number | null;
}

export interface AllocationResult {
  /** in rank order; trainingIds in (eventDate, code) order */
  allocations: Array<{ lotPartnerId: string; trainingIds: string[] }>;
  /** trainingId → lotPartnerId. A training appears at most once [J-07] */
  byTraining: Record<string, string>;
  /** trainings nobody eligible confirmed [J-06] */
  leftover: string[];
  trace: AllocationTraceStep[];
}

/**
 * The confirmation that binds at `cutAt`: the latest one made at or before it.
 * Ties on the millisecond break on the autoincrement id. [K-04][J-01]
 *
 * The boundary is inclusive — a confirmation landing exactly on the deadline
 * counts. The engine separately refuses actions strictly after it [E-05].
 */
export function latestConfirmationBefore(
  confirmations: readonly ConfirmationSnapshot[],
  cutAt: number,
): ConfirmationSnapshot | null {
  let best: ConfirmationSnapshot | null = null;
  for (const candidate of confirmations) {
    if (candidate.confirmedAt > cutAt) continue;
    if (
      best === null ||
      candidate.confirmedAt > best.confirmedAt ||
      (candidate.confirmedAt === best.confirmedAt && candidate.id > best.id)
    ) {
      best = candidate;
    }
  }
  return best;
}

/**
 * Round trainings in the order a partner receives them within their cap:
 * earliest event first, code as the tiebreak. [K-06]
 */
export function sortTrainings(
  trainings: readonly AllocationTraining[],
): AllocationTraining[] {
  return [...trainings].sort(
    (a, b) => a.eventDate.localeCompare(b.eventDate) || a.code.localeCompare(b.code),
  );
}

function effectiveLimit(own: number | null, buyer: number | null): number | null {
  if (own === null) return buyer;
  if (buyer === null) return own;
  return Math.min(own, buyer);
}

/**
 * The priority waterfall of [J-02].
 *
 * Deterministic by construction: it sorts its own inputs, so the result cannot
 * depend on the order rows came back from the database. [J-03]
 */
export function allocate(input: AllocationInput): AllocationResult {
  const ordered = sortTrainings(input.trainings);
  const validIds = new Set(ordered.map((t) => t.id));
  const takeOrder = ordered.map((t) => t.id);
  const sizeOf = new Map(ordered.map((t) => [t.id, t.participantCount ?? 0] as const));

  const skipped = new Set(
    input.adjustments.filter((a) => a.kind === 'skip').map((a) => a.lotPartnerId),
  );
  const buyerCaps = new Map<string, number>();
  for (const adjustment of input.adjustments) {
    if (adjustment.kind === 'cap') buyerCaps.set(adjustment.lotPartnerId, adjustment.cap);
  }

  const unallocated = new Set(takeOrder);
  const byTraining: Record<string, string> = {};
  const allocations: AllocationResult['allocations'] = [];
  const trace: AllocationTraceStep[] = [];

  // Strict rank order — response speed never matters. [J-04]
  const participants = [...input.participants].sort(
    (a, b) => a.rank - b.rank || a.lotPartnerId.localeCompare(b.lotPartnerId),
  );

  for (const participant of participants) {
    const step: AllocationTraceStep = {
      lotPartnerId: participant.lotPartnerId,
      rank: participant.rank,
      outcome: 'confirmed',
      wanted: [],
      limit: null,
      capKind: null,
      participantLimit: null,
      participantsTaken: 0,
      taken: [],
      usedConfirmationId: null,
    };

    if (participant.excluded) {
      // Deactivated during the round — marks are ignored entirely. [E-01]
      step.outcome = 'excluded';
      trace.push(step);
      continue;
    }
    if (skipped.has(participant.lotPartnerId)) {
      // Buyer exercised the workload right; marks flow down. [T-02]
      step.outcome = 'skipped_by_buyer';
      trace.push(step);
      continue;
    }

    const binding = latestConfirmationBefore(participant.confirmations, input.cutAt);
    if (binding === null) {
      // Silence is a decline by non-response. [K-08]
      step.outcome = 'no_response';
      trace.push(step);
      continue;
    }
    step.usedConfirmationId = binding.id;

    // An explicit decline, or a confirmation of an empty set, which is the
    // same thing. [K-07][E-03]
    const marks = binding.marks.filter((id) => validIds.has(id));
    if (binding.kind === 'decline_all' || marks.length === 0) {
      step.outcome = 'declined_all';
      trace.push(step);
      continue;
    }

    const marked = new Set(marks);
    step.wanted = takeOrder.filter((id) => marked.has(id) && unallocated.has(id));

    // The partner's own cap counts either trainings or trainees [K-06]; the
    // buyer's cap [T-02] always counts trainings, and combines with either.
    const ownCap = binding.cap ?? null;
    const ownKind: CapKind = binding.capKind ?? 'trainings';
    step.capKind = ownCap === null ? null : ownKind;
    step.limit = effectiveLimit(
      ownCap !== null && ownKind === 'trainings' ? ownCap : null,
      buyerCaps.get(participant.lotPartnerId) ?? null,
    );
    step.participantLimit = ownCap !== null && ownKind === 'participants' ? ownCap : null;

    // Date order throughout. A count limit ends the walk; a trainee budget
    // skips what does not fit and keeps going, so a small later training can
    // still be taken — deterministic, and it uses the budget better [L-17].
    const take: string[] = [];
    let budget = step.participantLimit ?? Number.POSITIVE_INFINITY;
    for (const id of step.wanted) {
      if (step.limit !== null && take.length >= Math.max(0, step.limit)) break;
      const size = sizeOf.get(id) ?? 0;
      if (size > budget) continue;
      take.push(id);
      budget -= size;
    }
    step.taken = take;
    step.participantsTaken = take.reduce((sum, id) => sum + (sizeOf.get(id) ?? 0), 0);
    for (const id of take) {
      unallocated.delete(id);
      byTraining[id] = participant.lotPartnerId;
    }
    if (take.length > 0) {
      allocations.push({ lotPartnerId: participant.lotPartnerId, trainingIds: take });
    }
    trace.push(step);
  }

  return {
    allocations,
    byTraining,
    leftover: takeOrder.filter((id) => unallocated.has(id)),
    trace,
  };
}

/* ------------------------------------------------------------------ *
 * partner-facing view [N-03]
 * ------------------------------------------------------------------ */

export type TrainingViewState =
  /** not marked by me, no higher-ranked partner holds it */
  | 'available'
  /** not marked by me, a higher-ranked partner holds it */
  | 'marked_by_higher'
  /** marked by me, and the projection gives it to me */
  | 'projected_to_you'
  /** marked by me, but I would not get it */
  | 'marked_not_projected';

export type NotProjectedReason = 'higher_partner' | 'over_cap';

export interface PartnerViewRow {
  trainingId: string;
  state: TrainingViewState;
  reason?: NotProjectedReason;
}

export interface PartnerView {
  /** in (eventDate, code) order */
  rows: PartnerViewRow[];
  projectedTrainingIds: string[];
  projectedCount: number;
}

/**
 * What one partner may see about the state of the round. [N-03]
 *
 * Deliberately computed by running {@link allocate} over the ranks *above* this
 * partner plus this partner's own marks. Two consequences follow, both required:
 *
 *  - The partner learns the **effect** of higher-ranked partners' confirmed
 *    marks, never their identity, count, or response status. [N-04]
 *  - A higher-ranked partner's marks beyond their own cap are not held by
 *    anyone, so they correctly appear available further down. [E-04]
 *
 * Buyer adjustments are never reflected — those are decided after the deadline
 * and must not be anticipated. [N-09]
 */
export function partnerView(
  input: AllocationInput,
  lotPartnerId: string,
  own: { marks: string[]; cap: number | null; capKind?: CapKind },
): PartnerView {
  const self = input.participants.find((p) => p.lotPartnerId === lotPartnerId);
  if (!self) {
    throw new Error(`partnerView: ${lotPartnerId} ei osale voorus ${input.roundId}`);
  }

  const ownMarks = new Set(own.marks);

  // Ranks above me, as they stand, plus me carrying the marks being displayed.
  const derived: AllocationInput = {
    roundId: input.roundId,
    cutAt: input.cutAt,
    trainings: input.trainings,
    adjustments: [],
    participants: [
      ...input.participants.filter((p) => p.rank < self.rank),
      {
        lotPartnerId,
        rank: self.rank,
        excluded: self.excluded,
        confirmations: [
          {
            id: Number.MAX_SAFE_INTEGER,
            kind: own.marks.length === 0 ? 'decline_all' : 'confirm',
            marks: own.marks,
            cap: own.cap,
            capKind: own.capKind ?? 'trainings',
            confirmedAt: input.cutAt,
          },
        ],
      },
    ],
  };

  const result = allocate(derived);
  const mine = new Set(result.allocations.find((a) => a.lotPartnerId === lotPartnerId)?.trainingIds ?? []);

  const rows: PartnerViewRow[] = sortTrainings(input.trainings).map((training) => {
    const holder = result.byTraining[training.id];
    if (!ownMarks.has(training.id)) {
      return {
        trainingId: training.id,
        state: holder ? 'marked_by_higher' : 'available',
      };
    }
    if (mine.has(training.id)) {
      return { trainingId: training.id, state: 'projected_to_you' };
    }
    return {
      trainingId: training.id,
      state: 'marked_not_projected',
      // Nobody above holds it, yet it is not mine → my own cap kept it out.
      reason: holder ? 'higher_partner' : 'over_cap',
    };
  });

  const projectedTrainingIds = rows
    .filter((r) => r.state === 'projected_to_you')
    .map((r) => r.trainingId);

  return { rows, projectedTrainingIds, projectedCount: projectedTrainingIds.length };
}
