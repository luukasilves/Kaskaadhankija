/**
 * Migrations against a database that already holds data — the case the volume
 * on Fly presents at every deploy, and the one an in-memory test database built
 * from scratch never exercises.
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as schema from './schema';

const folder = join(process.cwd(), 'drizzle');
const journal = JSON.parse(readFileSync(join(folder, 'meta/_journal.json'), 'utf8')) as {
  entries: Array<{ tag: string; when: number }>;
};

/** Apply one migration file the way the migrator would, statement by statement. */
function applyRaw(raw: Database.Database, tag: string): void {
  const text = readFileSync(join(folder, `${tag}.sql`), 'utf8');
  for (const part of text.split('--> statement-breakpoint')) {
    const statement = part.trim();
    if (statement) raw.exec(statement);
  }
}

/** A database as v2 left it: the first two migrations applied and recorded. */
function v2Database(): Database.Database {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  const [first, second] = journal.entries;
  applyRaw(raw, first!.tag);
  applyRaw(raw, second!.tag);
  raw.exec(
    'CREATE TABLE "__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)',
  );
  raw
    .prepare('INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES (?, ?), (?, ?)')
    .run('v2-0', first!.when, 'v2-1', second!.when);
  return raw;
}

/**
 * A database as v2.2 left it: everything up to and including `tag` applied and
 * recorded, so `migrate()` applies only what comes after.
 *
 * The migrator decides what to run by comparing each migration's journal
 * timestamp against the newest `created_at` it finds, which is why recording
 * one row with that timestamp is enough.
 */
function databaseThrough(tag: string): Database.Database {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  const upTo = journal.entries.findIndex((entry) => entry.tag === tag);
  if (upTo < 0) throw new Error(`unknown migration ${tag}`);
  for (const entry of journal.entries.slice(0, upTo + 1)) applyRaw(raw, entry.tag);
  raw.exec(
    'CREATE TABLE "__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)',
  );
  raw
    .prepare('INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES (?, ?)')
    .run('applied', journal.entries[upTo]!.when);
  return raw;
}

describe('0002_email_deliveries on a populated v2 database', () => {
  it('carries each notification’s e-mail record into one delivery row [D-10]', () => {
    const raw = v2Database();
    const insert = raw.prepare(
      `INSERT INTO notifications (id, created_at, recipient_kind, type, title, body, email_to, email_status, email_error, email_sent_at)
       VALUES (?, ?, 'buyer', 'buyer_round_closed', 'Pealkiri', 'Sisu', ?, ?, ?, ?)`,
    );
    insert.run('n-sent', 1_000, 'a@riik.ee', 'sent', '', 1_500);
    insert.run('n-failed', 2_000, 'b@riik.ee', 'failed', 'ECONNREFUSED', null);
    insert.run('n-inapp', 3_000, '', 'skipped', '', null);

    migrate(drizzle(raw, { schema }), { migrationsFolder: folder });

    const deliveries = raw
      .prepare('SELECT notification_id, "to", status, attempts, detail, last_attempt_at, sent_at FROM email_deliveries ORDER BY notification_id')
      .all() as Array<Record<string, unknown>>;
    expect(deliveries).toEqual([
      { notification_id: 'n-failed', to: 'b@riik.ee', status: 'failed', attempts: 1, detail: 'ECONNREFUSED', last_attempt_at: 2_000, sent_at: null },
      { notification_id: 'n-sent', to: 'a@riik.ee', status: 'sent', attempts: 1, detail: '', last_attempt_at: 1_500, sent_at: 1_500 },
    ]);

    // The notices themselves survive the rebuild, minus the e-mail columns.
    const notices = raw.prepare('SELECT id, title FROM notifications ORDER BY id').all();
    expect(notices).toEqual([
      { id: 'n-failed', title: 'Pealkiri' },
      { id: 'n-inapp', title: 'Pealkiri' },
      { id: 'n-sent', title: 'Pealkiri' },
    ]);
    const columns = (raw.prepare('PRAGMA table_info(notifications)').all() as Array<{ name: string }>).map((c) => c.name);
    expect(columns).not.toContain('email_to');

    // The append-only triggers are untouched by a rebuild of another table.
    const triggers = raw.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'trigger'").get() as { n: number };
    expect(triggers.n).toBe(6);

    // Nothing was left parked, and the child rows point at existing parents.
    expect(raw.prepare("SELECT count(*) AS n FROM sqlite_temp_master WHERE name = '__migrate_email'").get()).toEqual({ n: 0 });
    expect(raw.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    raw.close();
  });
});

describe('0008_framework_data on a populated v2.2 database', () => {
  it('inserts the framework identity, because a seeded volume never re-seeds [L-21]', () => {
    const raw = databaseThrough('0007_acting_via');
    raw
      .prepare(
        `INSERT INTO partners (id, name, reg_code, created_at) VALUES ('p1', 'Näidis OÜ', '10000001', 1000)`,
      )
      .run();
    raw
      .prepare(
        `INSERT INTO partner_representatives (id, partner_id, name, email, created_at, updated_at)
         VALUES ('r1', 'p1', 'Jaan Kask', 'jaan@naidis.ee', 1000, 1000)`,
      )
      .run();

    migrate(drizzle(raw, { schema }), { migrationsFolder: folder });

    // The one row is there, with the real public values.
    expect(
      raw.prepare('SELECT id, title, procurement_reference, buyer_name FROM framework_settings').all(),
    ).toEqual([
      {
        id: 1,
        title: 'Eesti.ai koolitajate tellimine',
        procurement_reference: '10567384',
        buyer_name: 'Riigikantselei',
      },
    ]);
    expect(() =>
      raw.prepare("INSERT INTO framework_settings (id, title, procurement_reference, buyer_name, updated_at) VALUES (2, 'x', '1', 'y', 1)").run(),
    ).toThrow();

    // A representative that predates the column is owned by the upload path,
    // not by the framework data — so an admin can still switch it off [L-21].
    expect(raw.prepare('SELECT id, source FROM partner_representatives').all()).toEqual([
      { id: 'r1', source: 'upload' },
    ]);

    const roundColumns = (raw.prepare('PRAGMA table_info(rounds)').all() as Array<{ name: string }>).map((c) => c.name);
    expect(roundColumns).toContain('planned_publish_at');
    expect(roundColumns).toContain('planned_deadline_at');

    // The widened import kind survives the table rebuild.
    expect(() =>
      raw
        .prepare(
          `INSERT INTO import_batches (id, kind, file_name, rows_json, summary, actor_label, created_at)
           VALUES ('b1', 'framework', 'raamhange.xlsx', '{}', '{}', 'Mari', 1000)`,
        )
        .run(),
    ).not.toThrow();

    const triggers = raw.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'trigger'").get() as { n: number };
    expect(triggers.n).toBe(6);
    expect(raw.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    raw.close();
  });
});

describe('0009_round_protocols on a populated v2.2 database', () => {
  it('adds the protocol table without any trigger of its own [L-22]', () => {
    const raw = databaseThrough('0008_framework_data');
    migrate(drizzle(raw, { schema }), { migrationsFolder: folder });

    const columns = (raw.prepare('PRAGMA table_info(round_protocols)').all() as Array<{ name: string }>).map((c) => c.name);
    expect(columns).toEqual([
      'id',
      'round_id',
      'kind',
      'version',
      'content_json',
      'content_hash',
      'algorithm_version',
      'generated_at',
      'generated_by',
    ]);

    // One protocol per round, enforced by the index rather than by care.
    const indexes = (raw.prepare('PRAGMA index_list(round_protocols)').all() as Array<{ name: string; unique: number }>)
      .filter((i) => i.name === 'round_protocols_round_unique');
    expect(indexes).toHaveLength(1);
    expect(indexes[0].unique).toBe(1);

    // The append-only trail is unaffected, and the protocol table deliberately
    // gets no triggers: the audited hash is what detects tampering, and a test
    // environment must be able to delete a row.
    const triggers = raw.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'trigger'").get() as { n: number };
    expect(triggers.n).toBe(6);
    expect(
      raw
        .prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'round_protocols'")
        .get(),
    ).toEqual({ n: 0 });
    raw.close();
  });
});

describe('0010_admin_allowlist on a populated v2.2 database', () => {
  it('leaves exactly one named admin and touches nobody else [R-01]', () => {
    const raw = databaseThrough('0009_round_protocols');
    const insert = raw.prepare(
      'INSERT INTO users (id, name, email, role, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    );
    // What the live volume looks like: admins the domain rule created one by
    // one, in the casing each person typed, plus a hankija and a deactivated
    // account that must both come through untouched.
    insert.run('u-luukas', 'Luukas Ilves', 'Luukas.Ilves@riigikantselei.ee', 'admin', 1, 1_000);
    insert.run('u-mari', 'Mari Tamm', 'mari.tamm@naidis.riigikantselei.ee', 'admin', 1, 1_000);
    insert.run('u-kolleeg', 'Kolleeg', 'kolleeg@riigikantselei.ee', 'admin', 1, 1_000);
    insert.run('u-hankija', 'Juba Hankija', 'hankija@riigikantselei.ee', 'member', 1, 1_000);
    insert.run('u-endine', 'Endine', 'endine@riigikantselei.ee', 'admin', 0, 1_000);

    migrate(drizzle(raw, { schema }), { migrationsFolder: folder });

    const roles = Object.fromEntries(
      (raw.prepare('SELECT id, role, is_active FROM users').all() as Array<{
        id: string;
        role: string;
        is_active: number;
      }>).map((row) => [row.id, `${row.role}/${row.is_active}`]),
    );
    expect(roles).toEqual({
      // Matched case-insensitively, as an address always is.
      'u-luukas': 'admin/1',
      'u-mari': 'member/1',
      'u-kolleeg': 'member/1',
      // Already a hankija, and still one — the statement only touches admins.
      'u-hankija': 'member/1',
      // A deactivated account is demoted like the rest but stays switched off:
      // reactivating somebody must not hand back rights nobody re-granted.
      'u-endine': 'member/0',
    });
    raw.close();
  });

  it('is a no-op on the empty database a fresh volume boots with', () => {
    const raw = databaseThrough('0009_round_protocols');
    expect(() => migrate(drizzle(raw, { schema }), { migrationsFolder: folder })).not.toThrow();
    expect(raw.prepare('SELECT count(*) AS n FROM users').get()).toEqual({ n: 0 });
    raw.close();
  });
});

describe('0007_acting_via on a populated v2 database', () => {
  it('adds the two columns without disturbing the append-only trail [L-08]', () => {
    const raw = v2Database();
    raw
      .prepare(
        `INSERT INTO audit_events (occurred_at, actor_type, actor_label, event_type, summary)
         VALUES (?, 'buyer', 'Mari Tamm (Tellija)', 'round.created', 'Voor loodud')`,
      )
      .run(1_000);

    migrate(drizzle(raw, { schema }), { migrationsFolder: folder });

    const columns = (raw.prepare('PRAGMA table_info(audit_events)').all() as Array<{ name: string }>).map((c) => c.name);
    expect(columns).toContain('via_user_id');
    expect(columns).toContain('via_label');

    // The existing row is still there, with the new columns empty — an ADD
    // COLUMN cannot rewrite history, which is the point of doing it that way.
    expect(raw.prepare('SELECT summary, via_label FROM audit_events').all()).toEqual([
      { summary: 'Voor loodud', via_label: null },
    ]);

    const triggers = raw.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'trigger'").get() as { n: number };
    expect(triggers.n).toBe(6);
    expect(() => raw.prepare('UPDATE audit_events SET summary = ?').run('muudetud')).toThrow(/muutmatu/);
    raw.close();
  });
});
