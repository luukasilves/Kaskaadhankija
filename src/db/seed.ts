/**
 * Seed the mock database.
 *
 * Two principles:
 *
 *  1. The trainings and the partner ranking come from the **committed sample
 *     files** in `seed/`, loaded through the **same import functions** the
 *     buyer's upload uses. The "load from database" and "upload a table" paths
 *     therefore cannot drift, and the sample files stay the single description
 *     of the synthetic procurement.
 *  2. Scenario rounds are built by **replaying real engine calls** against a
 *     rewound virtual clock (Phase 8), so the audit trail, the notification log
 *     and the frozen snapshots are genuine rather than fabricated rows.
 *
 * Idempotent: guarded by `app_state.seed_version`, and the imports upsert by
 * code, so running it twice changes nothing.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { env } from '@/lib/env';
import { parseCsv } from '@/server/import/csv';
import { importTrainingsFromRows } from '@/server/import/trainings-import';
import { importPartnersFromRows } from '@/server/import/partners-import';
import { ensureAppState, readSeedVersion, writeSeedVersion } from '@/server/clock';
import { NO_EVIDENCE, type Ctx } from '@/server/context';
import { getDb } from './index';
import { lots, users } from './schema';

export const SEED_VERSION = 1;

const SEED_DIR = join(process.cwd(), 'seed');

export const SEED_FILES = {
  trainings: 'naidis-koolituskalender.csv',
  partners: 'naidis-partnerid.csv',
} as const;

/** The buyer persona the seed creates, and whose label appears in the audit. */
export const SEED_BUYER = {
  name: env.SEED_ADMIN_NAME,
  email: env.SEED_ADMIN_EMAIL,
} as const;

/**
 * The four lots of the framework.
 *
 * OSA-2's workload threshold is deliberately 4 rather than 25: with mock data
 * nobody would ever reach 25 trainings, and the [T-01] workload warning is one
 * of the things a tester needs to see. The screen labels it as a test value.
 */
const LOT_SEED = [
  {
    code: 'OSA-1',
    name: 'Koolitused ruumirendiga',
    description:
      'Töötubade läbiviimine koolitaja pakutud ruumides koos vajaliku tehnika ja ruumiteenustega.',
    responseDeadlineWorkingDays: 3,
    workloadThreshold: 25,
    thresholdNote: '',
  },
  {
    code: 'OSA-2',
    name: 'Koolitused ruumirendita',
    description:
      'Töötubade läbiviimine tellija määratud asukohas. Koolitaja vastutab sisu ja läbiviimise eest, ruumi ei paku.',
    responseDeadlineWorkingDays: 3,
    workloadThreshold: 4,
    thresholdNote: 'Näidise testväärtus — päris raamlepingus on lähtekohaks 25 koolitust.',
  },
  {
    code: 'OSA-3',
    name: 'Veebikoolitused',
    description:
      'Töötubade ettevalmistamine ja läbiviimine digikeskkonnas (Teams, Zoom või muu kokkulepitud platvorm).',
    responseDeadlineWorkingDays: 2,
    workloadThreshold: 25,
    thresholdNote: '',
  },
  {
    code: 'OSA-4',
    name: 'Suursündmused',
    description:
      'Suurema osalejate arvuga sündmuste korraldamine ja läbiviimine (ettekanne, loeng, kaasloome või häkaton), sh tehniline koordineerimine, modereerimine, registreerimine ja logistika.',
    responseDeadlineWorkingDays: 5,
    workloadThreshold: 25,
    thresholdNote: '',
  },
] as const;

function readSeedFile(name: string): { rows: Array<Record<string, string>>; size: number } {
  const path = join(SEED_DIR, name);
  const content = readFileSync(path);
  return { rows: parseCsv(content.toString('utf8')).rows, size: content.byteLength };
}

/** Lots and the buyer user — the fixed scaffolding the imports need. */
function seedLotsAndUsers(ctx: Ctx): void {
  for (const lot of LOT_SEED) {
    ctx.tx
      .insert(lots)
      .values({
        id: crypto.randomUUID(),
        code: lot.code,
        name: lot.name,
        description: lot.description,
        responseDeadlineWorkingDays: lot.responseDeadlineWorkingDays,
        deadlineLocalTime: '17:00',
        reviewWorkingDays: 2,
        workloadThreshold: lot.workloadThreshold,
        thresholdNote: lot.thresholdNote,
        defaultVisibilityMode: 'dynamic',
        isActive: true,
        createdAt: ctx.at,
      })
      .onConflictDoNothing()
      .run();
  }

  ctx.tx
    .insert(users)
    .values({
      id: crypto.randomUUID(),
      name: SEED_BUYER.name,
      email: SEED_BUYER.email,
      role: 'admin',
      isActive: true,
      createdAt: ctx.at,
    })
    .onConflictDoNothing()
    .run();
}

export interface SeedReport {
  lots: number;
  partners: number;
  trainings: { created: number; updated: number; locked: number };
}

/**
 * Load the base mock data: lots, the buyer user, the partner ranking and the
 * koolituskalender. Scenario rounds are layered on top in Phase 8.
 */
export function seedBaseData(ctx: Ctx): SeedReport {
  seedLotsAndUsers(ctx);

  const partnerFile = readSeedFile(SEED_FILES.partners);
  const partnerResult = importPartnersFromRows(ctx, {
    fileName: SEED_FILES.partners,
    fileSize: partnerFile.size,
    source: 'seed',
    rawRows: partnerFile.rows,
  });

  const trainingFile = readSeedFile(SEED_FILES.trainings);
  const trainingResult = importTrainingsFromRows(ctx, {
    fileName: SEED_FILES.trainings,
    fileSize: trainingFile.size,
    source: 'seed',
    rawRows: trainingFile.rows,
  });

  return {
    lots: LOT_SEED.length,
    partners: partnerResult.summary.created + partnerResult.summary.updated,
    trainings: {
      created: trainingResult.summary.created,
      updated: trainingResult.summary.updated,
      locked: trainingResult.summary.locked,
    },
  };
}

/** Re-import the committed sample koolituskalender — the demo-only button. */
export function loadSampleTrainings(ctx: Ctx) {
  const file = readSeedFile(SEED_FILES.trainings);
  return importTrainingsFromRows(ctx, {
    fileName: SEED_FILES.trainings,
    fileSize: file.size,
    source: 'sample',
    rawRows: file.rows,
  });
}

function makeCtx(tx: Ctx['tx'], at: number): Ctx {
  return {
    tx,
    at,
    actor: { kind: 'buyer', id: null, label: `${SEED_BUYER.name} (Tellija)` },
    evidence: NO_EVIDENCE,
    outbox: [],
  };
}

/**
 * Seed if the database has not been seeded yet. Called from `boot()` and by
 * `pnpm db:seed`.
 */
export async function seedIfEmpty(): Promise<SeedReport | null> {
  const db = getDb();
  ensureAppState(db);
  if (readSeedVersion(db) >= SEED_VERSION) return null;

  const { seedScenarios } = await import('./seed-scenarios');

  const report = db.transaction(
    (tx) => {
      const ctx = makeCtx(tx, Date.now());
      const base = seedBaseData(ctx);
      seedScenarios(tx);
      writeSeedVersion(tx, SEED_VERSION, Date.now());
      return base;
    },
    { behavior: 'immediate' },
  );

  return report;
}

/** `pnpm db:seed` */
async function main(): Promise<void> {
  const { runMigrations } = await import('./migrate');
  runMigrations();
  const report = await seedIfEmpty();
  if (!report) {
    const db = getDb();
    const counts = db.get<{ trainings: number; partners: number }>(
      sql`select (select count(*) from trainings) as trainings, (select count(*) from lot_partners) as partners`,
    );
    console.log(
      `Andmebaas on juba seemendatud (versioon ${readSeedVersion(db)}). Koolitusi: ${counts?.trainings ?? 0}, partnerite osalusi: ${counts?.partners ?? 0}.`,
    );
    return;
  }
  console.log(
    `Seemendatud: ${report.lots} hankeosa, ${report.partners} partneri osalust, ${report.trainings.created} koolitust.`,
  );
}

if (process.argv[1]?.endsWith('seed.ts')) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
