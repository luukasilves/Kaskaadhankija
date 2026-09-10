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
import { lotSheetRow } from '@/domain/framework-definition';
import { importFrameworkFromSheets } from '@/server/import/framework-import';
import { addTeamMember } from '@/server/team';
import { ensureAppState, readSeedVersion, writeSeedVersion } from '@/server/clock';
import { NO_EVIDENCE, type Ctx } from '@/server/context';
import { getDb } from './index';
import { LOT_SEED } from './lot-seed';
import { emailDeliveries, users } from './schema';

export const SEED_VERSION = 1;

const SEED_DIR = join(process.cwd(), 'seed');

export const SEED_FILES = {
  trainings: 'naidis-koolituskalender.csv',
  partners: 'naidis-partnerid.csv',
  representatives: 'naidis-esindajad.csv',
} as const;

/**
 * `SEED_TEAM` — `nimi,e-post[,roll];…` — the buyer team's real members, added
 * when the seed runs, so the first boot of a fresh volume already has the
 * people who actually sign in.
 *
 * These are *additional* users: the sample Mari Tamm stays exactly as she is,
 * because the example rounds are replayed as her. Real representatives are no
 * longer layered on here — they arrive with the framework data an admin
 * uploads or edits [L-21]. Malformed entries are dropped with a warning rather
 * than failing the boot: a typo in a secret must not leave the environment
 * unusable.
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

function readSeedFile(name: string): { rows: Array<Record<string, string>>; size: number } {
  const path = join(SEED_DIR, name);
  const content = readFileSync(path);
  return { rows: parseCsv(content.toString('utf8')).rows, size: content.byteLength };
}

/** The buyer user the scenarios act as. */
function seedBuyerUser(ctx: Ctx): void {
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
  seedBuyerUser(ctx);

  // Before the representatives arrive: an address that appears in both lists
  // belongs to the buyer team, and the import then refuses it rather than
  // quietly making a colleague somebody's partner.
  const teamMembers = applySeedTeam(ctx, env.SEED_TEAM);

  // The whole framework in one call — the same function an admin's upload
  // uses [L-21], so the sample procurement is loaded the way a real one will
  // be: identity, the four lots, the ranking, and the extra representatives.
  const partnerFile = readSeedFile(SEED_FILES.partners);
  const representativeFile = readSeedFile(SEED_FILES.representatives);
  const framework = importFrameworkFromSheets(ctx, {
    fileName: SEED_FILES.partners,
    fileSize: partnerFile.size + representativeFile.size,
    source: 'seed',
    sheets: {
      hankeosad: LOT_SEED.map(lotSheetRow),
      partnerid: partnerFile.rows,
      esindajad: representativeFile.rows,
    },
  });
  const partnerResult = { summary: framework.summary };
  let representatives =
    (framework.representatives?.created ?? 0) +
    (framework.representatives?.updated ?? 0) +
    framework.contacts.created.length +
    framework.contacts.reactivated.length;

  const trainingFile = readSeedFile(SEED_FILES.trainings);
  const trainingResult = importTrainingsFromRows(ctx, {
    fileName: SEED_FILES.trainings,
    fileSize: trainingFile.size,
    source: 'seed',
    rawRows: trainingFile.rows,
  });

  return {
    lots: framework.lots.created.length + framework.lots.updated.length + framework.lots.unchanged.length,
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

/**
 * The example rounds replay real engine calls, so they queue real e-mails.
 * Those notices are history being reconstructed, not events happening now, and
 * must never be sent — least of all to a real address that the framework data
 * put in the tables. Record them as not sent, and say why.
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
