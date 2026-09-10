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
 *  2. Scenario rounds are built by **replaying real engine calls** at
 *     back-dated instants, so the audit trail, the notification log and the
 *     frozen snapshots are genuine rather than fabricated rows.
 *
 * Idempotent: guarded by `app_state.seed_version`, and the imports upsert by
 * code, so running it twice changes nothing.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { env } from '@/lib/env';
import { parseCsv } from '@/server/import/csv';
import { importTrainingsFromRows } from '@/server/import/trainings-import';
import { importPartnersFromRows } from '@/server/import/partners-import';
import { importRepresentativesFromRows } from '@/server/import/representatives-import';
import { addTeamMember } from '@/server/team';
import { ensureAppState, readSeedVersion, writeSeedVersion } from '@/server/clock';
import { NO_EVIDENCE, type Ctx } from '@/server/context';
import { getDb } from './index';
import { emailDeliveries, lots, users } from './schema';

export const SEED_VERSION = 1;

const SEED_DIR = join(process.cwd(), 'seed');

export const SEED_FILES = {
  trainings: 'naidis-koolituskalender.csv',
  partners: 'naidis-partnerid.csv',
  representatives: 'naidis-esindajad.csv',
} as const;

/**
 * `SEED_REPRESENTATIVES` — `registrikood,nimi,e-post[,roll];…` — as rows the
 * representatives import accepts. Real people layered over the fictional list
 * on every seed, so a reset does not wipe the team's sign-ins. Malformed
 * entries are dropped with a warning rather than failing the boot.
 */
export function parseSeedRepresentatives(raw: string | undefined): Array<Record<string, string>> {
  if (!raw?.trim()) return [];
  const rows: Array<Record<string, string>> = [];
  for (const entry of raw.split(';')) {
    const [registrikood = '', esindaja = '', e_post = '', roll = ''] = entry.split(',').map((f) => f.trim());
    if (!registrikood || !esindaja || !e_post) {
      if (entry.trim()) console.warn(`[kaskaadhankija] SEED_REPRESENTATIVES: kirje „${entry.trim()}“ jäeti vahele`);
      continue;
    }
    rows.push({ registrikood, esindaja, e_post, roll });
  }
  return rows;
}

/**
 * `SEED_TEAM` — `nimi,e-post[,roll];…` — the buyer team's real members, added on
 * every seed so a reset does not wipe the people who actually sign in.
 *
 * These are *additional* users: the fictional Mari Tamm persona stays exactly as
 * she is, because the scenarios are replayed as her and the demo must keep
 * showing the specialists what they reviewed [L-16]. Malformed entries are
 * dropped with a warning rather than failing the boot — a typo in a secret must
 * not leave the environment unusable.
 */
export interface SeedTeamMember {
  name: string;
  email: string;
  role: 'admin' | 'member';
}

export function parseSeedTeam(raw: string | undefined): SeedTeamMember[] {
  if (!raw?.trim()) return [];
  const members: SeedTeamMember[] = [];
  for (const entry of raw.split(';')) {
    if (!entry.trim()) continue;
    const [name = '', email = '', role = ''] = entry.split(',').map((field) => field.trim());
    if (!name || !email) {
      console.warn(`[kaskaadhankija] SEED_TEAM: kirje „${entry.trim()}“ jäeti vahele`);
      continue;
    }
    const folded = role.toLowerCase();
    if (folded && folded !== 'admin' && folded !== 'liige' && folded !== 'member') {
      console.warn(`[kaskaadhankija] SEED_TEAM: tundmatu roll „${role}“ (${email}) — lisatakse adminina`);
    }
    // Admin by default: the point of the secret is that somebody can still
    // manage the team and the partners after a reset.
    members.push({ name, email, role: folded === 'liige' || folded === 'member' ? 'member' : 'admin' });
  }
  return members;
}

/**
 * Add the configured team members through the same function the Meeskond screen
 * uses, so the seed cannot bypass its checks — an address that already belongs
 * to a partner's representative is refused here too. Returns how many landed.
 */
export function applySeedTeam(ctx: Ctx, raw: string | undefined): number {
  let added = 0;
  for (const member of parseSeedTeam(raw)) {
    try {
      addTeamMember(ctx, member);
      added += 1;
    } catch (error) {
      console.warn(
        `[kaskaadhankija] SEED_TEAM: ${member.email} jäi lisamata — ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return added;
}

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
    // Both cap kinds, so the seeded Lisa B round shows the choice [L-17].
    defaultCapOptions: 'both' as const,
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
        defaultCapOptions: 'defaultCapOptions' in lot ? lot.defaultCapOptions : 'trainings',
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
  teamMembers: number;
  partners: number;
  representatives: number;
  trainings: { created: number; updated: number; locked: number };
}

/**
 * Load the base mock data: lots, the buyer user, the partner ranking and the
 * koolituskalender. Scenario rounds are layered on top by `seedScenarios`.
 */
export function seedBaseData(ctx: Ctx): SeedReport {
  seedLotsAndUsers(ctx);

  // Before the representatives are imported: an address that appears in both
  // lists belongs to the buyer team, and the representatives import then
  // refuses it rather than quietly making a colleague somebody's partner.
  const teamMembers = applySeedTeam(ctx, env.SEED_TEAM);

  const partnerFile = readSeedFile(SEED_FILES.partners);
  const partnerResult = importPartnersFromRows(ctx, {
    fileName: SEED_FILES.partners,
    fileSize: partnerFile.size,
    source: 'seed',
    rawRows: partnerFile.rows,
  });

  // The fictional representatives, then the real ones from the deployment's
  // secrets — the upload path both times, so the seed cannot drift from it.
  const representativeFile = readSeedFile(SEED_FILES.representatives);
  const representativeResult = importRepresentativesFromRows(ctx, {
    fileName: SEED_FILES.representatives,
    fileSize: representativeFile.size,
    source: 'seed',
    rawRows: representativeFile.rows,
  });
  let representatives = representativeResult.summary.created + representativeResult.summary.updated;
  const overlay = parseSeedRepresentatives(env.SEED_REPRESENTATIVES);
  if (overlay.length > 0) {
    try {
      const result = importRepresentativesFromRows(ctx, {
        fileName: 'SEED_REPRESENTATIVES',
        fileSize: 0,
        source: 'seed',
        rawRows: overlay,
      });
      representatives += result.summary.created + result.summary.updated;
    } catch (error) {
      console.error('[kaskaadhankija] SEED_REPRESENTATIVES ei õnnestunud laadida', error);
    }
  }

  const trainingFile = readSeedFile(SEED_FILES.trainings);
  const trainingResult = importTrainingsFromRows(ctx, {
    fileName: SEED_FILES.trainings,
    fileSize: trainingFile.size,
    source: 'seed',
    rawRows: trainingFile.rows,
  });

  return {
    lots: LOT_SEED.length,
    teamMembers,
    partners: partnerResult.summary.created + partnerResult.summary.updated,
    representatives,
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

/**
 * The scenarios replay real engine calls, so they queue real e-mails. Those
 * notices are history being reconstructed, not events happening now, and must
 * never be sent — least of all to the real representatives layered on top by
 * `SEED_REPRESENTATIVES`, on every reset. Record them as not sent, and say why.
 */
export function settleSeedDeliveries(tx: Ctx['tx'], at: number): number {
  return tx
    .update(emailDeliveries)
    .set({
      status: 'skipped',
      detail: 'Näidisandmete taasesitus: e-kirja ei saadetud.',
      attempts: 1,
      lastAttemptAt: at,
    })
    .where(eq(emailDeliveries.status, 'queued'))
    .run().changes;
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
export async function seedIfEmpty(): Promise<(SeedReport & { openRoundId: string }) | null> {
  const db = getDb();
  ensureAppState(db);
  if (readSeedVersion(db) >= SEED_VERSION) return null;

  const { seedScenarios } = await import('./seed-scenarios');
  const now = Date.now();

  return db.transaction(
    (tx) => {
      const ctx = makeCtx(tx, now);
      const base = seedBaseData(ctx);
      // Scenario rounds are replayed as real engine calls at past instants, so
      // they must run after the trainings and the ranking exist.
      const scenarios = seedScenarios(tx, now, ctx.actor.label);
      settleSeedDeliveries(tx, now);
      writeSeedVersion(tx, SEED_VERSION, now);
      return { ...base, openRoundId: scenarios.openRoundId };
    },
    { behavior: 'immediate' },
  );
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
    `Seemendatud: ${report.lots} hankeosa, ${report.teamMembers} tellija liiget seadistusest, ${report.partners} partneri osalust, ${report.representatives} esindajat, ${report.trainings.created} koolitust.`,
  );
}

if (process.argv[1]?.endsWith('seed.ts')) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
