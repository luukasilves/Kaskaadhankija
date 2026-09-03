/**
 * Test harness for server-side code.
 *
 * Gives each test an isolated in-memory database with the real migrations
 * applied — including the append-only triggers — and an injectable clock, so
 * engine and import behaviour is exercised against the actual schema rather
 * than a mock.
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { join } from 'node:path';
import * as schema from '@/db/schema';
import { ensureAppState } from './clock';
import { NO_EVIDENCE, type ActorRef, type Ctx, type Db, type Tx } from './context';

export interface TestHarness {
  db: Db;
  raw: Database.Database;
  /** current virtual instant; move it with `advance` or set directly */
  now: number;
  advance(ms: number): void;
  /** run a function inside one immediate transaction with a fresh ctx */
  write<T>(fn: (ctx: Ctx) => T, actor?: ActorRef): T;
  /** read-only helper */
  read<T>(fn: (db: Db) => T): T;
  close(): void;
}

export const TEST_BUYER: ActorRef = {
  kind: 'buyer',
  id: 'user-test',
  label: 'Mari Tamm (Tellija)',
};

export function partnerActor(label: string, lotPartnerId: string): ActorRef {
  return { kind: 'partner', id: lotPartnerId, label };
}

export function createHarness(startAt = Date.UTC(2026, 8, 1, 9, 0)): TestHarness {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  const db = drizzle(raw, { schema });
  migrate(db, { migrationsFolder: join(process.cwd(), 'drizzle') });
  ensureAppState(db);

  const harness: TestHarness = {
    db,
    raw,
    now: startAt,
    advance(ms: number) {
      harness.now += ms;
    },
    write<T>(fn: (ctx: Ctx) => T, actor: ActorRef = TEST_BUYER): T {
      return db.transaction(
        (tx: Tx) => {
          const ctx: Ctx = { tx, at: harness.now, actor, evidence: NO_EVIDENCE, outbox: [] };
          return fn(ctx);
        },
        { behavior: 'immediate' },
      );
    },
    read<T>(fn: (db: Db) => T): T {
      return fn(db);
    },
    close() {
      raw.close();
    },
  };

  return harness;
}

/** Minimal lots, so import tests have somewhere to put trainings. */
export function seedLots(harness: TestHarness): Record<string, string> {
  const ids: Record<string, string> = {};
  harness.write((ctx) => {
    for (const [index, code] of ['OSA-1', 'OSA-2', 'OSA-3', 'OSA-4'].entries()) {
      const id = crypto.randomUUID();
      ids[code] = id;
      ctx.tx
        .insert(schema.lots)
        .values({
          id,
          code,
          name: `Hankeosa ${code}`,
          responseDeadlineWorkingDays: code === 'OSA-3' ? 2 : 3,
          deadlineLocalTime: '17:00',
          workloadThreshold: index === 1 ? 4 : 25,
          createdAt: ctx.at,
        })
        .run();
    }
  });
  return ids;
}

/** A training row as the CSV reader would deliver it. */
export function rawTrainingRow(over: Record<string, string> = {}): Record<string, string> {
  return {
    kood: 'KK-2026-101',
    hankeosa: 'OSA-1',
    nimetus: 'Töötuba 1 näidisrühmale',
    formaat: 'Töötuba 1',
    kuupaev: '12.10.2026',
    lopp_kuupaev: '',
    maakond: 'Harju maakond',
    asukoht: 'Koolitaja ruumid',
    sihtruhm: 'KOV ametnikud',
    osalejate_arv: '20',
    keel: 'et',
    hinnanguline_maksumus: '1450',
    markused: '',
    ...over,
  };
}

/** A partner-ranking row as the CSV reader would deliver it. */
export function rawPartnerRow(over: Record<string, string> = {}): Record<string, string> {
  return {
    partner: 'Tehisaru Koolitus OÜ',
    registrikood: '10000001',
    hankeosa: 'OSA-1',
    koht: '1',
    kontaktisik: 'Jaan Kask',
    e_post: 'jaan.kask@tehisaru-naidis.ee',
    uhikhind: '1450',
    ...over,
  };
}

/* ------------------------------------------------------------------ *
 * fixtures for engine tests
 * ------------------------------------------------------------------ */

/** Distinguishes fixtures within one test, so codes never collide. */
let fixtureSeq = 0;

export interface LotFixture {
  lotId: string;
  /** lot_partner ids in rank order */
  lotPartnerIds: string[];
  partnerIds: string[];
  /** training ids in event-date order */
  trainingIds: string[];
  trainingCodes: string[];
}

/**
 * A lot with `partnerCount` ranked members and `trainingCount` trainings on
 * consecutive weekdays — enough to exercise the cascade end to end.
 */
export function seedLotWithPartners(
  harness: TestHarness,
  options: {
    code?: string;
    partnerCount?: number;
    trainingCount?: number;
    responseWorkingDays?: number;
    workloadThreshold?: number;
    firstEventDate?: string;
  } = {},
): LotFixture {
  const code = options.code ?? 'OSA-2';
  const partnerCount = options.partnerCount ?? 3;
  const trainingCount = options.trainingCount ?? 6;
  const firstEventDate = options.firstEventDate ?? '2026-10-05';
  // Registry codes and training codes are globally unique, so a test that
  // needs a second lot must not reuse this fixture's namespace.
  const nth = ++fixtureSeq;

  const lotId = crypto.randomUUID();
  const lotPartnerIds: string[] = [];
  const partnerIds: string[] = [];
  const trainingIds: string[] = [];
  const trainingCodes: string[] = [];

  harness.write((ctx) => {
    ctx.tx
      .insert(schema.lots)
      .values({
        id: lotId,
        code,
        name: `Hankeosa ${code}`,
        responseDeadlineWorkingDays: options.responseWorkingDays ?? 3,
        deadlineLocalTime: '17:00',
        reviewWorkingDays: 2,
        workloadThreshold: options.workloadThreshold ?? 25,
        defaultVisibilityMode: 'dynamic',
        createdAt: ctx.at,
      })
      .run();

    for (let rank = 1; rank <= partnerCount; rank++) {
      const partnerId = crypto.randomUUID();
      const lotPartnerId = crypto.randomUUID();
      partnerIds.push(partnerId);
      lotPartnerIds.push(lotPartnerId);
      ctx.tx
        .insert(schema.partners)
        .values({
          id: partnerId,
          name: nth === 1 ? `Partner ${rank}` : `Partner ${nth}.${rank}`,
          regCode: String(10000000 + nth * 100 + rank),
          createdAt: ctx.at,
        })
        .run();
      ctx.tx
        .insert(schema.lotPartners)
        .values({
          id: lotPartnerId,
          lotId,
          partnerId,
          rank,
          contactName: `Kontakt ${rank}`,
          contactEmail: `kontakt${rank}@naidis.ee`,
          unitPriceEur: 1000 + rank * 50,
          createdAt: ctx.at,
        })
        .run();
    }

    const start = new Date(`${firstEventDate}T00:00:00Z`);
    for (let i = 0; i < trainingCount; i++) {
      const id = crypto.randomUUID();
      const trainingCode = `KK-2026-${(nth - 1) * 100 + 200 + i + 1}`;
      const date = new Date(start.getTime() + i * 2 * 86_400_000);
      trainingIds.push(id);
      trainingCodes.push(trainingCode);
      ctx.tx
        .insert(schema.trainings)
        .values({
          id,
          code: trainingCode,
          lotId,
          title: `Koolitus ${i + 1}`,
          workshopType: 'tootuba_1',
          eventDate: date.toISOString().slice(0, 10),
          county: 'Harju maakond',
          targetGroup: 'kov',
          participantCount: 20,
          language: 'et',
          estimatedValueEur: 1000,
          status: 'unassigned',
          createdAt: ctx.at,
          updatedAt: ctx.at,
        })
        .run();
    }
  });

  return { lotId, lotPartnerIds, partnerIds, trainingIds, trainingCodes };
}

export { schema };
