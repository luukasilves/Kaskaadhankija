/**
 * Lisa B of `docs/kaskaadi-ariloogika.md`, as a test fixture.
 *
 * The spec's worked example is the acceptance test for the allocation algorithm
 * and for the four partner-facing display states. If a change here is needed,
 * the spec changed — update the document first.
 *
 * OSA-2, partners A (rank 1), B (rank 2), C (rank 3); six trainings K1..K6.
 */

import type { AllocationInput, AllocationParticipant, AllocationTraining } from '../allocate';

export const CUT_AT = Date.UTC(2026, 8, 30, 14, 0); // any instant after the confirmations

export const LISA_B_TRAININGS: AllocationTraining[] = [
  { id: 'K1', code: 'KK-2026-201', eventDate: '2026-10-05' },
  { id: 'K2', code: 'KK-2026-202', eventDate: '2026-10-07' },
  { id: 'K3', code: 'KK-2026-203', eventDate: '2026-10-12' },
  { id: 'K4', code: 'KK-2026-204', eventDate: '2026-10-14' },
  { id: 'K5', code: 'KK-2026-205', eventDate: '2026-10-19' },
  { id: 'K6', code: 'KK-2026-206', eventDate: '2026-10-21' },
];

/** A: koht 1, marks K1 K2 K3 K5, cap 2 */
export const PARTNER_A: AllocationParticipant = {
  lotPartnerId: 'A',
  rank: 1,
  excluded: false,
  confirmations: [
    {
      id: 10,
      kind: 'confirm',
      marks: ['K1', 'K2', 'K3', 'K5'],
      cap: 2,
      confirmedAt: Date.UTC(2026, 8, 29, 10, 0),
    },
  ],
};

/** B: koht 2, marks K2 K3 K4 K6, no cap */
export const PARTNER_B: AllocationParticipant = {
  lotPartnerId: 'B',
  rank: 2,
  excluded: false,
  confirmations: [
    {
      id: 20,
      kind: 'confirm',
      marks: ['K2', 'K3', 'K4', 'K6'],
      cap: null,
      confirmedAt: Date.UTC(2026, 8, 29, 12, 0),
    },
  ],
};

/** C: koht 3, marks K1 K3 K4 K5 K6, no cap */
export const PARTNER_C: AllocationParticipant = {
  lotPartnerId: 'C',
  rank: 3,
  excluded: false,
  confirmations: [
    {
      id: 30,
      kind: 'confirm',
      marks: ['K1', 'K3', 'K4', 'K5', 'K6'],
      cap: null,
      confirmedAt: Date.UTC(2026, 8, 29, 9, 0),
    },
  ],
};

export function lisaBInput(overrides: Partial<AllocationInput> = {}): AllocationInput {
  return {
    roundId: 'VOOR-2026-003',
    cutAt: CUT_AT,
    trainings: LISA_B_TRAININGS,
    participants: [PARTNER_A, PARTNER_B, PARTNER_C],
    adjustments: [],
    ...overrides,
  };
}

/** Own marks and cap per partner, for driving `partnerView`. */
export const LISA_B_OWN = {
  A: { marks: ['K1', 'K2', 'K3', 'K5'], cap: 2 as number | null },
  B: { marks: ['K2', 'K3', 'K4', 'K6'], cap: null as number | null },
  C: { marks: ['K1', 'K3', 'K4', 'K5', 'K6'], cap: null as number | null },
};

/** Lisa B.1 — the jaotusettepanek. */
export const LISA_B1_EXPECTED = {
  A: ['K1', 'K2'],
  B: ['K3', 'K4', 'K6'],
  C: ['K5'],
  leftover: [] as string[],
};

/**
 * Lisa B.2 — the display table, every cell. Encoded as
 * `state` or `state/reason` so a mismatch names the exact cell.
 */
export const LISA_B2_EXPECTED: Record<'A' | 'B' | 'C', Record<string, string>> = {
  A: {
    K1: 'projected_to_you',
    K2: 'projected_to_you',
    K3: 'marked_not_projected/over_cap',
    K4: 'available',
    K5: 'marked_not_projected/over_cap',
    K6: 'available',
  },
  B: {
    K1: 'marked_by_higher',
    K2: 'marked_not_projected/higher_partner',
    K3: 'projected_to_you',
    K4: 'projected_to_you',
    K5: 'available',
    K6: 'projected_to_you',
  },
  C: {
    K1: 'marked_not_projected/higher_partner',
    K2: 'marked_by_higher',
    K3: 'marked_not_projected/higher_partner',
    K4: 'marked_not_projected/higher_partner',
    K5: 'projected_to_you',
    K6: 'marked_not_projected/higher_partner',
  },
};

export const LISA_B2_PROJECTION_COUNTS = { A: 2, B: 3, C: 1 };

/** Lisa B.3 — A removes K2 and re-confirms. */
export const LISA_B3_EXPECTED = {
  A: ['K1', 'K3'],
  B: ['K2', 'K4', 'K6'],
  C: ['K5'],
};

/** Lisa B.4 — buyer caps B at 1 for this round, on the B.1 marks. */
export const LISA_B4_EXPECTED = {
  A: ['K1', 'K2'],
  B: ['K3'],
  C: ['K4', 'K5', 'K6'],
  leftover: [] as string[],
};

/** Flatten an AllocationResult to `{ partnerId: trainingIds }` for comparison. */
export function asMap(
  allocations: ReadonlyArray<{ lotPartnerId: string; trainingIds: string[] }>,
): Record<string, string[]> {
  return Object.fromEntries(allocations.map((a) => [a.lotPartnerId, a.trainingIds]));
}
