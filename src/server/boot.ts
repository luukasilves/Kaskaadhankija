/**
 * Server start-up.
 *
 * Migrations and the seed run here rather than as a deploy step: the SQLite
 * file lives on a mounted volume that a Fly release machine would not have, and
 * there is only ever one writer process.
 *
 * The in-process timer replaces the external cron a serverless deployment would
 * need. The container is long-running, so a `setInterval` is both sufficient
 * and simpler; the guard on `globalThis` stops the dev server's module reloads
 * from stacking up timers.
 */

import { runMigrations } from '@/db/migrate';
import { seedIfEmpty } from '@/db/seed';
import { runDueJobs } from './rounds/jobs';

const TICK_MS = 60_000;

interface BootState {
  booted: boolean;
  timer: NodeJS.Timeout | null;
}

const state: BootState = ((globalThis as Record<string, unknown>).__kaskaadhankijaBoot as BootState) ?? {
  booted: false,
  timer: null,
};
(globalThis as Record<string, unknown>).__kaskaadhankijaBoot = state;

export async function boot(): Promise<void> {
  if (state.booted) return;
  state.booted = true;

  try {
    runMigrations();
    const report = await seedIfEmpty();
    if (report) {
      console.log(
        `[kaskaadhankija] näidisandmed laaditud: ${report.lots} hankeosa, ${report.partners} partneri osalust, ${report.trainings.created} koolitust`,
      );
    }
  } catch (error) {
    // A failed migration must be loud: the app is not usable without it.
    console.error('[kaskaadhankija] käivitamine ebaõnnestus', error);
    throw error;
  }

  if (state.timer) clearInterval(state.timer);
  state.timer = setInterval(() => {
    try {
      const report = runDueJobs();
      if (report.closed.length > 0) {
        console.log(`[kaskaadhankija] voorud suletud: ${report.closed.join(', ')}`);
      }
    } catch (error) {
      console.error('[kaskaadhankija] tähtaegade töötlus ebaõnnestus', error);
    }
  }, TICK_MS);
  // Never hold the process open on this alone.
  state.timer.unref?.();

  console.log('[kaskaadhankija] käivitatud, tähtaegade jälgija töötab');
}
