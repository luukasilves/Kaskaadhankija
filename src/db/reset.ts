/**
 * Reset the mock database — demo only.
 *
 * The append-only triggers refuse DELETE, which is the point: an audit trail
 * you can quietly erase is not evidence. So a reset replaces the whole file
 * rather than emptying tables. The handle is closed, the file renamed aside as
 * a `.bak-<timestamp>` (kept, so a tester who resets by accident loses
 * nothing), and the next `getDb()` opens a fresh one.
 *
 * Requests arriving during the swap get a clear "try again" message rather than
 * a half-open database.
 */

import { existsSync, renameSync, rmSync } from 'node:fs';
import { closeDb, setResetting } from './index';
import { env, assertDemoMode } from '@/lib/env';
import { runMigrations } from './migrate';
import { seedIfEmpty } from './seed';

export interface ResetReport {
  backupPath: string | null;
}

export async function resetMockData(): Promise<ResetReport> {
  assertDemoMode();

  const path = env.DATABASE_PATH;
  setResetting(true);
  try {
    closeDb();

    let backupPath: string | null = null;
    if (existsSync(path)) {
      backupPath = `${path}.bak-${Date.now()}`;
      renameSync(path, backupPath);
      // WAL sidecars belong to the old file and must not be reused.
      for (const suffix of ['-wal', '-shm']) {
        const sidecar = `${path}${suffix}`;
        if (existsSync(sidecar)) rmSync(sidecar);
      }
    }

    setResetting(false);
    runMigrations();
    await seedIfEmpty();
    return { backupPath };
  } finally {
    setResetting(false);
  }
}
