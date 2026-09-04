/**
 * Tests for the parallel-cascade allocation, named after the rules they hold to
 * account in `docs/kaskaadi-ariloogika.md`. Lisa B is the acceptance fixture.
 */

import { describe, expect, it } from 'vitest';
import {
  allocate,
  latestConfirmationBefore,
  partnerView,
  sortTrainings,
  type AllocationInput,
  type AllocationParticipant,
  type AllocationTraining,
  type ConfirmationSnapshot,
} from './allocate';
import {
  asMap,
  CUT_AT,
  LISA_B1_EXPECTED,
  LISA_B2_EXPECTED,
  LISA_B2_PROJECTION_COUNTS,
  LISA_B3_EXPECTED,
  LISA_B4_EXPECTED,
  LISA_B_OWN,
  LISA_B_TRAININGS,
  lisaBInput,
  PARTNER_A,
  PARTNER_B,
  PARTNER_C,
} from './__fixtures__/lisa-b';

/* helpers */

const confirmation = (
  over: Partial<ConfirmationSnapshot> & { marks: string[] },
): ConfirmationSnapshot => ({
  id: 1,
  kind: 'confirm',
  cap: null,
  confirmedAt: CUT_AT - 3_600_000,
  ...over,
});

const participant = (
  lotPartnerId: string,
  rank: number,
  marks: string[],
  over: Partial<AllocationParticipant> & { cap?: number | null } = {},
): AllocationParticipant => ({
  lotPartnerId,
  rank,
  excluded: over.excluded ?? false,
  confirmations:
    over.confirmations ??
    [confirmation({ id: rank * 10, marks, cap: over.cap ?? null })],
});

const input = (
  participants: AllocationParticipant[],
  over: Partial<AllocationInput> = {},
): AllocationInput => ({
  roundId: 'R',
  cutAt: CUT_AT,
  trainings: LISA_B_TRAININGS,
  participants,
  adjustments: [],
  ...over,
});

/** 'state' or 'state/reason', matching the Lisa B.2 encoding. */
function viewCell(
  view: ReturnType<typeof partnerView>,
  trainingId: string,
): string {
  const row = view.rows.find((r) => r.trainingId === trainingId);
  if (!row) throw new Error(`no row for ${trainingId}`);
  return row.reason ? `${row.state}/${row.reason}` : row.state;
}

/* ------------------------------------------------------------------ */

describe('[J-02] jaotusalgoritmi protseduur', () => {
  it('reproduces Lisa B.1 exactly', () => {
    const result = allocate(lisaBInput());
    expect(asMap(result.allocations)).toEqual({
      A: LISA_B1_EXPECTED.A,
      B: LISA_B1_EXPECTED.B,
      C: LISA_B1_EXPECTED.C,
    });
    expect(result.leftover).toEqual(LISA_B1_EXPECTED.leftover);
  });

  it('gives each training to exactly one partner', () => {
    const result = allocate(lisaBInput());
    expect(result.byTraining).toEqual({
      K1: 'A',
      K2: 'A',
      K3: 'B',
      K4: 'B',
      K5: 'C',
      K6: 'B',
    });
  });

  it('records a trace step per participant with the binding confirmation', () => {
    const result = allocate(lisaBInput());
    expect(result.trace.map((s) => [s.lotPartnerId, s.outcome, s.taken])).toEqual([
      ['A', 'confirmed', ['K1', 'K2']],
      ['B', 'confirmed', ['K3', 'K4', 'K6']],
      ['C', 'confirmed', ['K5']],
    ]);
    expect(result.trace.map((s) => s.usedConfirmationId)).toEqual([10, 20, 30]);
  });

  it('ignores marks on trainings that are not in the round', () => {
    const result = allocate(input([participant('A', 1, ['K1', 'MITTE-VOORUS'])]));
    expect(asMap(result.allocations)).toEqual({ A: ['K1'] });
  });
});

describe('[J-04] range järjestus — kiirus ei loe', () => {
  it('gives the training to the higher rank even when they confirmed later', () => {
    const early = participant('low', 3, ['K1'], {
      confirmations: [confirmation({ id: 1, marks: ['K1'], confirmedAt: CUT_AT - 100_000 })],
    });
    const late = participant('high', 1, ['K1'], {
      confirmations: [confirmation({ id: 2, marks: ['K1'], confirmedAt: CUT_AT - 10 })],
    });
    const result = allocate(input([early, late]));
    expect(result.byTraining.K1).toBe('high');
  });

  it('lets a lower rank in only when every higher rank passes on it', () => {
    const result = allocate(
      input([
        participant('r1', 1, ['K2']),
        participant('r2', 2, [], { confirmations: [confirmation({ id: 2, kind: 'decline_all', marks: [] })] }),
        participant('r3', 3, ['K1', 'K2']),
      ]),
    );
    expect(result.byTraining.K2).toBe('r1');
    expect(result.byTraining.K1).toBe('r3');
  });

  it('orders by rank regardless of the input array order', () => {
    const result = allocate(input([PARTNER_C, PARTNER_A, PARTNER_B]));
    expect(result.trace.map((s) => s.rank)).toEqual([1, 2, 3]);
  });
});

describe('[J-03] determineeritus', () => {
  it('is unaffected by the order of participants, trainings or confirmations', () => {
    const canonical = allocate(lisaBInput());

    const shuffledTrainings: AllocationTraining[] = [
      LISA_B_TRAININGS[4],
      LISA_B_TRAININGS[0],
      LISA_B_TRAININGS[3],
      LISA_B_TRAININGS[5],
      LISA_B_TRAININGS[1],
      LISA_B_TRAININGS[2],
    ];
    const shuffled = allocate(
      lisaBInput({
        trainings: shuffledTrainings,
        participants: [PARTNER_B, PARTNER_C, PARTNER_A],
      }),
    );
    expect(shuffled).toEqual(canonical);
  });

  it('is stable across repeated calls', () => {
    expect(allocate(lisaBInput())).toEqual(allocate(lisaBInput()));
  });
});

describe('[J-06] jääk', () => {
  it('leaves trainings nobody confirmed as leftover, in date order', () => {
    const result = allocate(input([participant('A', 1, ['K3'])]));
    expect(result.leftover).toEqual(['K1', 'K2', 'K4', 'K5', 'K6']);
  });

  it('returns everything as leftover when nobody responded', () => {
    const result = allocate(
      input([{ lotPartnerId: 'A', rank: 1, excluded: false, confirmations: [] }]),
    );
    expect(result.leftover).toHaveLength(6);
    expect(result.allocations).toEqual([]);
  });
});

describe('[J-07] invariandid', () => {
  const ids = LISA_B_TRAININGS.map((t) => t.id);

  it('never allocates a training twice and never exceeds a cap', () => {
    // Deterministic pseudo-random sweep — enough shapes to catch an off-by-one.
    let seed = 42;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

    for (let round = 0; round < 200; round++) {
      const count = 1 + Math.floor(rnd() * 5);
      const participants: AllocationParticipant[] = [];
      for (let r = 1; r <= count; r++) {
        const marks = ids.filter(() => rnd() < 0.5);
        const cap = rnd() < 0.4 ? Math.floor(rnd() * 4) : null;
        participants.push(participant(`p${r}`, r, marks, { cap }));
      }
      const adjustments = participants
        .filter(() => rnd() < 0.2)
        .map((p) =>
          rnd() < 0.5
            ? ({ lotPartnerId: p.lotPartnerId, kind: 'skip' } as const)
            : ({ lotPartnerId: p.lotPartnerId, kind: 'cap', cap: Math.floor(rnd() * 3) } as const),
        );

      const result = allocate(input(participants, { adjustments }));

      const allTaken = result.allocations.flatMap((a) => a.trainingIds);
      expect(new Set(allTaken).size).toBe(allTaken.length);
      expect([...allTaken, ...result.leftover].sort()).toEqual([...ids].sort());

      for (const step of result.trace) {
        if (step.limit !== null) expect(step.taken.length).toBeLessThanOrEqual(step.limit);
        expect(step.taken.every((id) => step.wanted.includes(id))).toBe(true);
      }
    }
  });
});

describe('[K-04] viimane kinnitus enne lõikehetke', () => {
  it('picks the latest confirmation at or before the cut', () => {
    const chosen = latestConfirmationBefore(
      [
        confirmation({ id: 1, marks: ['K1'], confirmedAt: 100 }),
        confirmation({ id: 2, marks: ['K2'], confirmedAt: 300 }),
        confirmation({ id: 3, marks: ['K3'], confirmedAt: 200 }),
      ],
      400,
    );
    expect(chosen?.id).toBe(2);
  });

  it('ignores confirmations made after the cut', () => {
    const chosen = latestConfirmationBefore(
      [
        confirmation({ id: 1, marks: ['K1'], confirmedAt: 100 }),
        confirmation({ id: 2, marks: ['K2'], confirmedAt: 900 }),
      ],
      500,
    );
    expect(chosen?.id).toBe(1);
  });

  it('counts a confirmation landing exactly on the cut', () => {
    const chosen = latestConfirmationBefore([confirmation({ id: 7, marks: ['K1'], confirmedAt: 500 })], 500);
    expect(chosen?.id).toBe(7);
  });

  it('breaks a same-millisecond tie on the autoincrement id', () => {
    const chosen = latestConfirmationBefore(
      [
        confirmation({ id: 5, marks: ['K1'], confirmedAt: 500 }),
        confirmation({ id: 9, marks: ['K2'], confirmedAt: 500 }),
        confirmation({ id: 7, marks: ['K3'], confirmedAt: 500 }),
      ],
      600,
    );
    expect(chosen?.id).toBe(9);
  });

  it('returns null when there is nothing before the cut', () => {
    expect(latestConfirmationBefore([], 500)).toBeNull();
    expect(latestConfirmationBefore([confirmation({ id: 1, marks: [], confirmedAt: 900 })], 500)).toBeNull();
  });

  it('lets a revision change the outcome — Lisa B.3', () => {
    const revisedA: AllocationParticipant = {
      ...PARTNER_A,
      confirmations: [
        ...PARTNER_A.confirmations,
        confirmation({ id: 11, marks: ['K1', 'K3', 'K5'], cap: 2, confirmedAt: CUT_AT - 60_000 }),
      ],
    };
    const result = allocate(lisaBInput({ participants: [revisedA, PARTNER_B, PARTNER_C] }));
    expect(asMap(result.allocations)).toEqual(LISA_B3_EXPECTED);
  });
});

describe('[K-06] piirmäär ja [E-04] allavoolamine', () => {
  it('takes trainings in event-date order within the cap', () => {
    const result = allocate(input([participant('A', 1, ['K6', 'K2', 'K4'], { cap: 2 })]));
    expect(asMap(result.allocations)).toEqual({ A: ['K2', 'K4'] });
  });

  it('breaks a same-date tie on the training code', () => {
    const sameDay: AllocationTraining[] = [
      { id: 'x', code: 'KK-2026-999', eventDate: '2026-10-05' },
      { id: 'y', code: 'KK-2026-111', eventDate: '2026-10-05' },
    ];
    const result = allocate(
      input([participant('A', 1, ['x', 'y'], { cap: 1 })], { trainings: sameDay }),
    );
    expect(asMap(result.allocations)).toEqual({ A: ['y'] });
  });

  it('flows marks beyond the cap down to lower ranks', () => {
    const result = allocate(
      input([participant('A', 1, ['K1', 'K2', 'K3'], { cap: 1 }), participant('B', 2, ['K2', 'K3'])]),
    );
    expect(asMap(result.allocations)).toEqual({ A: ['K1'], B: ['K2', 'K3'] });
  });

  it('treats a cap of 0 as taking nothing', () => {
    const result = allocate(
      input([participant('A', 1, ['K1'], { cap: 0 }), participant('B', 2, ['K1'])]),
    );
    expect(asMap(result.allocations)).toEqual({ B: ['K1'] });
  });

  it('applies no limit when the cap is null', () => {
    const result = allocate(input([participant('A', 1, ['K1', 'K2', 'K3'])]));
    expect(asMap(result.allocations)).toEqual({ A: ['K1', 'K2', 'K3'] });
  });
});

describe('[K-07] loobumine ja [E-03] tühi kinnitus', () => {
  it('allocates nothing on an explicit decline', () => {
    const result = allocate(
      input([
        participant('A', 1, [], {
          confirmations: [confirmation({ id: 1, kind: 'decline_all', marks: [] })],
        }),
        participant('B', 2, ['K1']),
      ]),
    );
    expect(result.trace[0].outcome).toBe('declined_all');
    expect(result.byTraining.K1).toBe('B');
  });

  it('treats a confirmation of an empty mark set as a decline', () => {
    const result = allocate(input([participant('A', 1, [])]));
    expect(result.trace[0].outcome).toBe('declined_all');
  });

  it('honours a decline that supersedes an earlier confirmation', () => {
    const result = allocate(
      input([
        participant('A', 1, [], {
          confirmations: [
            confirmation({ id: 1, marks: ['K1'], confirmedAt: CUT_AT - 200_000 }),
            confirmation({ id: 2, kind: 'decline_all', marks: [], confirmedAt: CUT_AT - 100_000 }),
          ],
        }),
        participant('B', 2, ['K1']),
      ]),
    );
    expect(result.byTraining.K1).toBe('B');
  });
});

describe('[K-08] vastamata jätmine', () => {
  it('records no_response and allocates nothing', () => {
    const result = allocate(
      input([
        { lotPartnerId: 'A', rank: 1, excluded: false, confirmations: [] },
        participant('B', 2, ['K1']),
      ]),
    );
    expect(result.trace[0].outcome).toBe('no_response');
    expect(result.trace[0].usedConfirmationId).toBeNull();
    expect(result.byTraining.K1).toBe('B');
  });
});

describe('[E-01] väljaarvatud partner', () => {
  it('ignores an excluded partner and their marks', () => {
    const result = allocate(
      input([
        participant('A', 1, ['K1', 'K2'], { excluded: true }),
        participant('B', 2, ['K1']),
      ]),
    );
    expect(result.trace[0].outcome).toBe('excluded');
    expect(result.trace[0].taken).toEqual([]);
    expect(result.byTraining.K1).toBe('B');
  });
});

describe('[T-02] tellija kohandused', () => {
  it('skips a partner and flows their marks down — Lisa B.4 uses a cap, this the skip', () => {
    const result = allocate(
      lisaBInput({ adjustments: [{ lotPartnerId: 'A', kind: 'skip' }] }),
    );
    expect(result.trace[0].outcome).toBe('skipped_by_buyer');
    expect(asMap(result.allocations)).toEqual({ B: ['K2', 'K3', 'K4', 'K6'], C: ['K1', 'K5'] });
  });

  it('caps a partner for the round — Lisa B.4 exactly', () => {
    const result = allocate(lisaBInput({ adjustments: [{ lotPartnerId: 'B', kind: 'cap', cap: 1 }] }));
    expect(asMap(result.allocations)).toEqual({
      A: LISA_B4_EXPECTED.A,
      B: LISA_B4_EXPECTED.B,
      C: LISA_B4_EXPECTED.C,
    });
    expect(result.leftover).toEqual(LISA_B4_EXPECTED.leftover);
  });

  it('takes the stricter of the partner cap and the buyer cap', () => {
    const result = allocate(
      input([participant('A', 1, ['K1', 'K2', 'K3'], { cap: 2 })], {
        adjustments: [{ lotPartnerId: 'A', kind: 'cap', cap: 1 }],
      }),
    );
    expect(asMap(result.allocations)).toEqual({ A: ['K1'] });
  });

  it('leaves the partner cap in force when the buyer cap is looser', () => {
    const result = allocate(
      input([participant('A', 1, ['K1', 'K2', 'K3'], { cap: 1 })], {
        adjustments: [{ lotPartnerId: 'A', kind: 'cap', cap: 3 }],
      }),
    );
    expect(asMap(result.allocations)).toEqual({ A: ['K1'] });
  });

  it('can leave everything as jääk when every partner is skipped', () => {
    const result = allocate(
      lisaBInput({
        adjustments: [
          { lotPartnerId: 'A', kind: 'skip' },
          { lotPartnerId: 'B', kind: 'skip' },
          { lotPartnerId: 'C', kind: 'skip' },
        ],
      }),
    );
    expect(result.allocations).toEqual([]);
    expect(result.leftover).toHaveLength(6);
  });
});

describe('[N-03] neli kuvaolekut — Lisa B.2 iga lahter', () => {
  for (const key of ['A', 'B', 'C'] as const) {
    it(`matches the spec table for partner ${key}`, () => {
      const view = partnerView(lisaBInput(), key, LISA_B_OWN[key]);
      const actual = Object.fromEntries(
        LISA_B_TRAININGS.map((t) => [t.id, viewCell(view, t.id)]),
      );
      expect(actual).toEqual(LISA_B2_EXPECTED[key]);
      expect(view.projectedCount).toBe(LISA_B2_PROJECTION_COUNTS[key]);
    });
  }

  it('returns rows in event-date order', () => {
    const view = partnerView(lisaBInput(), 'B', LISA_B_OWN.B);
    expect(view.rows.map((r) => r.trainingId)).toEqual(['K1', 'K2', 'K3', 'K4', 'K5', 'K6']);
  });

  it('shows an unmarked training as available when no higher rank holds it', () => {
    const view = partnerView(lisaBInput(), 'B', { marks: [], cap: null });
    expect(viewCell(view, 'K5')).toBe('available');
    expect(view.projectedCount).toBe(0);
  });

  it('distinguishes over_cap from higher_partner', () => {
    const view = partnerView(lisaBInput(), 'A', LISA_B_OWN.A);
    // A is rank 1, so nothing above them: only their own cap can exclude a mark.
    expect(viewCell(view, 'K3')).toBe('marked_not_projected/over_cap');
    const lower = partnerView(lisaBInput(), 'C', LISA_B_OWN.C);
    expect(viewCell(lower, 'K1')).toBe('marked_not_projected/higher_partner');
  });

  it('reflects a mark the partner has added but not yet confirmed', () => {
    // The page shows the effect of the draft [L-11]; K4 is free in Lisa B for A.
    const view = partnerView(lisaBInput(), 'A', { marks: ['K4'], cap: null });
    expect(viewCell(view, 'K4')).toBe('projected_to_you');
  });

  it('rejects a partner who is not in the round', () => {
    expect(() => partnerView(lisaBInput(), 'VOORAS', { marks: [], cap: null })).toThrow();
  });
});

describe('[N-05] prognoos muutub akna jooksul — Lisa B.3', () => {
  it('frees K2 for B when A withdraws it', () => {
    const before = partnerView(lisaBInput(), 'B', LISA_B_OWN.B);
    expect(viewCell(before, 'K2')).toBe('marked_not_projected/higher_partner');

    const revisedA: AllocationParticipant = {
      ...PARTNER_A,
      confirmations: [
        ...PARTNER_A.confirmations,
        confirmation({ id: 11, marks: ['K1', 'K3', 'K5'], cap: 2, confirmedAt: CUT_AT - 60_000 }),
      ],
    };
    const after = partnerView(
      lisaBInput({ participants: [revisedA, PARTNER_B, PARTNER_C] }),
      'B',
      LISA_B_OWN.B,
    );
    expect(viewCell(after, 'K2')).toBe('projected_to_you');
    expect(viewCell(after, 'K3')).toBe('marked_not_projected/higher_partner');
    expect(after.projectedCount).toBe(3);
  });
});

describe('[N-09] prognoos ei arvesta tellija kohandustega', () => {
  it('gives the same partner view with and without adjustments', () => {
    const plain = partnerView(lisaBInput(), 'C', LISA_B_OWN.C);
    const adjusted = partnerView(
      lisaBInput({ adjustments: [{ lotPartnerId: 'B', kind: 'cap', cap: 1 }] }),
      'C',
      LISA_B_OWN.C,
    );
    expect(adjusted).toEqual(plain);
  });
});

describe('[N-04] partneri vaade ei leki midagi teiste kohta', () => {
  it('exposes only training ids, states and reasons', () => {
    const view = partnerView(lisaBInput(), 'C', LISA_B_OWN.C);
    const serialised = JSON.stringify(view);
    expect(serialised).not.toContain('"A"');
    expect(serialised).not.toContain('"B"');
    expect(serialised).not.toMatch(/count.*higher/i);
    for (const row of view.rows) {
      expect(Object.keys(row).sort()).toEqual(
        row.reason ? ['reason', 'state', 'trainingId'] : ['state', 'trainingId'],
      );
    }
  });
});

describe('sortTrainings', () => {
  it('orders by event date then code without mutating the input', () => {
    const original = [...LISA_B_TRAININGS].reverse();
    const copy = [...original];
    expect(sortTrainings(original).map((t) => t.id)).toEqual(['K1', 'K2', 'K3', 'K4', 'K5', 'K6']);
    expect(original).toEqual(copy);
  });
});
