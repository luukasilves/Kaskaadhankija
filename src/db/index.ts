/**
 * Database handle.
 *
 * The handle lives on `globalThis` for two reasons: Next's dev server reloads
 * modules and would otherwise open a second connection, and the demo-only
 * "reset mock data" action swaps the file underneath us, so no module may cache
 * `db` in its own scope. Always call `getDb()`.
 */

import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { env } from '../lib/env';
import * as schema from './schema';

export type Db = BetterSQLite3Database<typeof schema>;

interface Holder {
  db: Db | null;
  raw: Database.Database | null;
  resetting: boolean;
}

const holder: Holder = ((globalThis as Record<string, unknown>).__kaskaadhankijaDb as Holder) ?? {
  db: null,
  raw: null,
  resetting: false,
};
(globalThis as Record<string, unknown>).__kaskaadhankijaDb = holder;

function open(path: string): { db: Db; raw: Database.Database } {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const raw = new Database(path);
  // WAL lets readers run while a writer holds the lock; the busy timeout covers
  // the brief window when an external process (sqlite3 CLI) is writing.
  raw.pragma('journal_mode = WAL');
  raw.pragma('synchronous = NORMAL');
  raw.pragma('foreign_keys = ON');
  raw.pragma('busy_timeout = 5000');
  return { db: drizzle(raw, { schema }), raw };
}

export function getDb(): Db {
  if (holder.resetting) {
    throw new Error('Näidisandmete lähtestamine käib, proovi hetke pärast uuesti.');
  }
  if (!holder.db) {
    const opened = open(env.DATABASE_PATH);
    holder.db = opened.db;
    holder.raw = opened.raw;
  }
  return holder.db;
}

/** The underlying better-sqlite3 connection, for migrations and maintenance. */
export function getRaw(): Database.Database {
  getDb();
  if (!holder.raw) throw new Error('Andmebaasi ühendus puudub');
  return holder.raw;
}

/** Close and forget the handle, so the next getDb() reopens. Used by reset. */
export function closeDb(): void {
  holder.raw?.close();
  holder.db = null;
  holder.raw = null;
}

export function setResetting(value: boolean): void {
  holder.resetting = value;
}

/** Open an independent in-memory database, for tests. */
export function createTestDb(): { db: Db; raw: Database.Database } {
  return open(':memory:');
}

export { schema };
