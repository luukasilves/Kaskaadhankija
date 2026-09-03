/**
 * Scenario rounds for the mock database.
 *
 * Built by **replaying real engine calls against a rewound virtual clock**, so
 * the audit trail, the notification log and the frozen snapshots a tester sees
 * are genuine rather than fabricated rows. Each step gets its own `Ctx` with
 * its own `at` and its own actor label — publishing happens weeks ago as the
 * buyer, a confirmation happens hours later as that partner's contact — while
 * they all share one transaction, so a broken scenario seeds nothing at all.
 *
 * The four scenarios exist to make specific rules reachable without any setup:
 *
 *  - **0** a finished round, so orders, a completed training and the [T-01]
 *    workload warning exist from the first page load;
 *  - **B** a finished round that left a training unallocated, so the [T-06]
 *    jääk decision is waiting on the buyer's töölaud;
 *  - **A** an **open** round that reproduces Lisa B of the spec exactly, so a
 *    tester can walk the worked example from three partner personas — with the
 *    third holding an unconfirmed draft, which is where the [K-03] trap lives;
 *  - **C** a draft, so "publish a round" can be tried without building one.
 *
 * Everything else stays `unassigned`, so "Uus voor" has material.
 */

import { and, eq, inArray } from 'drizzle-orm';
import { addWorkingDays, subWorkingDays } from '@/domain/working-days';
import { NO_EVIDENCE, type Ctx, type Tx } from '@/server/context';
import {
  closeRound,
  confirmAllocation,
  confirmMarks,
  createRound,
  declineAll,
  markTrainingCompleted,
  publishRound,
  saveDraftMarks,
} from '@/server/rounds/engine';
import { lotPartners, lots, partners, trainings } from './schema';

/** Reg codes of the fictional partners, as the sample ranking file spells them. */
const REG = {
  tehisaru: '10000001',
  aiAkadeemia: '10000002',
  digioskus: '80000003',
  nutikoolitus: '10000004',
  eoppe: '10000005',
  targaToo: '10000006',
} as const;

/* ------------------------------------------------------------------ *
 * lookups
 * ------------------------------------------------------------------ */

interface Cast {
  lotId: (code: string) => string;
  partnerId: (regCode: string) => string;
  contactLabel: (regCode: string, lotCode: string) => string;
  trainingIds: (codes: readonly string[]) => string[];
}

function buildCast(tx: Tx): Cast {
  const lotByCode = new Map(
    tx
      .select({ id: lots.id, code: lots.code })
      .from(lots)
      .all()
      .map((row) => [row.code, row.id] as const),
  );
  const partnerByReg = new Map(
    tx
      .select({ id: partners.id, regCode: partners.regCode, name: partners.name })
      .from(partners)
      .all()
      .map((row) => [row.regCode, row] as const),
  );
  const trainingByCode = new Map(
    tx
      .select({ id: trainings.id, code: trainings.code })
      .from(trainings)
      .all()
      .map((row) => [row.code, row.id] as const),
  );

  const need = <T>(value: T | undefined, what: string): T => {
    if (value === undefined) throw new Error(`Seemendus: ${what} puudub näidisandmetes.`);
    return value;
  };

  return {
    lotId: (code) => need(lotByCode.get(code), `hankeosa ${code}`),
    partnerId: (regCode) => need(partnerByReg.get(regCode), `partner ${regCode}`).id,
    contactLabel: (regCode, lotCode) => {
      const partner = need(partnerByReg.get(regCode), `partner ${regCode}`);
      const membership = tx
        .select({ contactName: lotPartners.contactName })
        .from(lotPartners)
        .innerJoin(lots, eq(lots.id, lotPartners.lotId))
        .where(and(eq(lotPartners.partnerId, partner.id), eq(lots.code, lotCode)))
        .get();
      return `${membership?.contactName ?? 'kontaktisik'}, ${partner.name}`;
    },
    trainingIds: (codes) => codes.map((code) => need(trainingByCode.get(code), `koolitus ${code}`)),
  };
}

/* ------------------------------------------------------------------ *
 * contexts
 * ------------------------------------------------------------------ */

function buyerCtx(tx: Tx, at: number, buyerLabel: string): Ctx {
  return { tx, at, actor: { kind: 'buyer', id: null, label: buyerLabel }, evidence: NO_EVIDENCE, outbox: [] };
}

function partnerCtx(tx: Tx, at: number, label: string): Ctx {
  return { tx, at, actor: { kind: 'partner', id: null, label }, evidence: NO_EVIDENCE, outbox: [] };
}

/** Hours in ms, for placing the steps of one scenario inside its window. */
const H = 3_600_000;

/* ------------------------------------------------------------------ *
 * scenarios
 * ------------------------------------------------------------------ */

/**
 * Scenario 0 — a round that finished about three weeks ago.
 *
 * OSA-2 ranking is AI Akadeemia (1), Digioskus (2), Tehisaru (3), Targa Töö (4).
 * The koht-1 partner declines, so the tester can see that declining is normal
 * and costs nothing; Digioskus takes all five; Tehisaru marks two and receives
 * none, which is the [N-08] "määrati teisele partnerile" view; Targa Töö stays
 * silent, which is the [K-08] recorded non-response.
 *
 * Digioskus therefore holds five trainings against OSA-2's test threshold of
 * four, so the [T-01] workload warning is live in Scenario A's review without
 * the tester having to arrange it. If any of those trainings is already in the
 * past when the seed runs, the earliest one is also marked completed — the
 * sample calendar has fixed autumn-2026 dates, and claiming a training was
 * delivered before it happened would be the one piece of mock data that lies.
 */
function scenarioZero(tx: Tx, cast: Cast, now: number, buyerLabel: string): void {
  const lotId = cast.lotId('OSA-2');
  const codes = ['KK-2026-207', 'KK-2026-208', 'KK-2026-209', 'KK-2026-210', 'KK-2026-211'];
  const trainingIds = cast.trainingIds(codes);

  const publishedAt = subWorkingDays(new Date(now), 15, '09:30').getTime();
  const roundId = createRound(buyerCtx(tx, publishedAt - H, buyerLabel), { lotId, trainingIds });
  publishRound(buyerCtx(tx, publishedAt, buyerLabel), roundId);

  declineAll(
    partnerCtx(tx, publishedAt + 2 * H, cast.contactLabel(REG.aiAkadeemia, 'OSA-2')),
    roundId,
    cast.partnerId(REG.aiAkadeemia),
  );
  confirmMarks(
    partnerCtx(tx, publishedAt + 5 * H, cast.contactLabel(REG.digioskus, 'OSA-2')),
    roundId,
    cast.partnerId(REG.digioskus),
    { marks: trainingIds, cap: null },
  );
  confirmMarks(
    partnerCtx(tx, publishedAt + 26 * H, cast.contactLabel(REG.tehisaru, 'OSA-2')),
    roundId,
    cast.partnerId(REG.tehisaru),
    { marks: trainingIds.slice(0, 2), cap: null },
  );
  // Targa Töö never answers — [K-08].

  const closedAt = subWorkingDays(new Date(now), 12, '17:30').getTime();
  closeRound(buyerCtx(tx, closedAt, buyerLabel), roundId);
  confirmAllocation(buyerCtx(tx, closedAt + 20 * H, buyerLabel), roundId);

  completeIfPast(tx, now, buyerLabel, codes);
}

/**
 * Mark the earliest allocated training completed, if its event date has already
 * passed. Keeps `completed` reachable in the demo without ever showing a
 * training delivered before it took place.
 */
function completeIfPast(
  tx: Tx,
  now: number,
  buyerLabel: string,
  codes: readonly string[],
): void {
  const today = new Date(now).toISOString().slice(0, 10);
  const past = tx
    .select({ id: trainings.id, eventDate: trainings.eventDate })
    .from(trainings)
    .where(inArray(trainings.code, [...codes]))
    .all()
    .filter((row) => row.eventDate < today)
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate))[0];
  if (!past) return;

  // The working day after the event — when a trainer's report would arrive.
  const at = addWorkingDays(new Date(`${past.eventDate}T12:00:00Z`), 1, '11:00').getTime();
  markTrainingCompleted(buyerCtx(tx, Math.min(at, now), buyerLabel), past.id);
}

/**
 * Scenario B — a round that finished last week and left a jääk.
 *
 * OSA-3 ranking is E-õppe (1), Tehisaru (2), AI Akadeemia (3), Digioskus (4),
 * Targa Töö (5). E-õppe caps itself at 2 and so passes its third mark down;
 * AI Akadeemia's single mark was already taken. Nobody marks 305, so it becomes
 * the jääk waiting for the buyer's [T-06] decision.
 */
function scenarioLeftover(tx: Tx, cast: Cast, now: number, buyerLabel: string): void {
  const lotId = cast.lotId('OSA-3');
  const ids = cast.trainingIds([
    'KK-2026-301',
    'KK-2026-302',
    'KK-2026-303',
    'KK-2026-304',
    'KK-2026-305',
  ]);
  const [k301, k302, k303, k304] = ids;

  const publishedAt = subWorkingDays(new Date(now), 7, '11:00').getTime();
  const roundId = createRound(buyerCtx(tx, publishedAt - H, buyerLabel), {
    lotId,
    trainingIds: ids,
  });
  publishRound(buyerCtx(tx, publishedAt, buyerLabel), roundId);

  confirmMarks(
    partnerCtx(tx, publishedAt + 3 * H, cast.contactLabel(REG.eoppe, 'OSA-3')),
    roundId,
    cast.partnerId(REG.eoppe),
    { marks: [k301!, k302!, k303!], cap: 2 },
  );
  confirmMarks(
    partnerCtx(tx, publishedAt + 6 * H, cast.contactLabel(REG.tehisaru, 'OSA-3')),
    roundId,
    cast.partnerId(REG.tehisaru),
    { marks: [k302!, k303!, k304!], cap: null },
  );
  confirmMarks(
    partnerCtx(tx, publishedAt + 7 * H, cast.contactLabel(REG.aiAkadeemia, 'OSA-3')),
    roundId,
    cast.partnerId(REG.aiAkadeemia),
    { marks: [k301!], cap: null },
  );
  declineAll(
    partnerCtx(tx, publishedAt + 8 * H, cast.contactLabel(REG.digioskus, 'OSA-3')),
    roundId,
    cast.partnerId(REG.digioskus),
  );

  const closedAt = subWorkingDays(new Date(now), 5, '17:15').getTime();
  closeRound(buyerCtx(tx, closedAt, buyerLabel), roundId);
  confirmAllocation(buyerCtx(tx, closedAt + 3 * H, buyerLabel), roundId);
  // The jääk is deliberately left undecided, so the T-06 panel has work to do.
}

/**
 * Scenario A — the open round, and the whole point of the seed: **Lisa B**.
 *
 * OSA-2 trainings 201–206 are K1…K6 with Lisa B's dates. A = AI Akadeemia
 * (koht 1), B = Digioskus (koht 2), C = Tehisaru (koht 3), and Targa Töö
 * (koht 4) is silent.
 *
 * A confirms twice, so the confirmation history is not hypothetical. C's marks
 * are saved as a **draft and never confirmed**: C therefore sees exactly Lisa
 * B.2 column C while the [K-03] banner warns that none of it counts yet —
 * the single most instructive screen in the application.
 */
function scenarioLisaB(tx: Tx, cast: Cast, now: number, buyerLabel: string): string {
  const lotId = cast.lotId('OSA-2');
  const [k1, k2, k3, k4, k5, k6] = cast.trainingIds([
    'KK-2026-201',
    'KK-2026-202',
    'KK-2026-203',
    'KK-2026-204',
    'KK-2026-205',
    'KK-2026-206',
  ]);

  const publishedAt = subWorkingDays(new Date(now), 2, '10:00').getTime();
  const roundId = createRound(buyerCtx(tx, publishedAt - H, buyerLabel), {
    lotId,
    trainingIds: [k1!, k2!, k3!, k4!, k5!, k6!],
    note: 'Sügisese laine teine voor — Lisa B näidisjuhtum.',
  });
  publishRound(buyerCtx(tx, publishedAt, buyerLabel), roundId);

  const aLabel = cast.contactLabel(REG.aiAkadeemia, 'OSA-2');
  const aId = cast.partnerId(REG.aiAkadeemia);
  // First answer: three marks, no cap. Then the revision Lisa B describes.
  confirmMarks(partnerCtx(tx, publishedAt + 4 * H, aLabel), roundId, aId, {
    marks: [k1!, k2!, k3!],
    cap: null,
  });
  confirmMarks(partnerCtx(tx, publishedAt + 22 * H, aLabel), roundId, aId, {
    marks: [k1!, k2!, k3!, k5!],
    cap: 2,
  });

  confirmMarks(
    partnerCtx(tx, publishedAt + 25 * H, cast.contactLabel(REG.digioskus, 'OSA-2')),
    roundId,
    cast.partnerId(REG.digioskus),
    { marks: [k2!, k3!, k4!, k6!], cap: null },
  );

  saveDraftMarks(
    partnerCtx(tx, publishedAt + 27 * H, cast.contactLabel(REG.tehisaru, 'OSA-2')),
    roundId,
    cast.partnerId(REG.tehisaru),
    { marks: [k1!, k3!, k4!, k5!, k6!], cap: null },
  );
  // Targa Töö has not opened the round at all.

  return roundId;
}

/** Scenario C — a draft round, so publishing can be tried on ready material. */
function scenarioDraft(tx: Tx, cast: Cast, now: number, buyerLabel: string): void {
  const lotId = cast.lotId('OSA-1');
  const trainingIds = cast.trainingIds([
    'KK-2026-101',
    'KK-2026-102',
    'KK-2026-103',
    'KK-2026-104',
  ]);
  createRound(buyerCtx(tx, now - 2 * H, buyerLabel), {
    lotId,
    trainingIds,
    note: 'Ettevalmistamisel — ootab avaldamist.',
  });
}

/* ------------------------------------------------------------------ *
 * entry point
 * ------------------------------------------------------------------ */

export interface ScenarioReport {
  /** the open Lisa B round, for the seed report and tests */
  openRoundId: string;
}

export function seedScenarios(tx: Tx, now: number, buyerLabel: string): ScenarioReport {
  const cast = buildCast(tx);

  scenarioZero(tx, cast, now, buyerLabel);
  scenarioLeftover(tx, cast, now, buyerLabel);
  const openRoundId = scenarioLisaB(tx, cast, now, buyerLabel);
  scenarioDraft(tx, cast, now, buyerLabel);

  return { openRoundId };
}

/** Training ids of one round, by code — used by the seed's self-check. */
export function trainingIdsByCode(tx: Tx, codes: readonly string[]): string[] {
  return tx
    .select({ id: trainings.id, code: trainings.code })
    .from(trainings)
    .where(inArray(trainings.code, [...codes]))
    .all()
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((row) => row.id);
}
