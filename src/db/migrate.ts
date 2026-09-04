/**
 * Apply migrations. Called from `boot()` at server start and by `pnpm db:migrate`.
 *
 * Migrations run in-process rather than as a release step: the SQLite file lives
 * on a mounted volume that a Fly release machine would not have, and there is
 * only ever one writer process.
 */

import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getDb } from './index';

const migrationsFolder = join(
  dirname(dirname(dirname(fileURLToPath(import.meta.url)))),
  'drizzle',
);

export function runMigrations(): void {
  migrate(getDb(), { migrationsFolder });
}

// `pnpm db:migrate`
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^.*\//, ''))) {
  runMigrations();
  console.log('Migratsioonid rakendatud.');
}
