'use server';

/**
 * Demo-data actions: reset, and re-load the committed sample koolituskalender.
 *
 * Both are guarded by `assertDemoMode`, so they throw rather than exist in
 * production.
 */

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb } from '@/db';
import { assertDemoMode } from '@/lib/env';
import { resetMockData } from '@/db/reset';
import { loadSampleTrainings } from '@/db/seed';
import { nowMs } from '../clock';
import { NO_EVIDENCE, type Ctx } from '../context';
import { actorRef, getActor, PERSONA_COOKIE } from '../auth/actor';

/**
 * Reset the mock data and send the tester back to the opening screen.
 *
 * The persona cookie must go too: reseeding mints new ids, so the cookie would
 * point at a persona that no longer exists. Rather than leave the tester on a
 * page belonging to a dead identity, treat a reset as what it is — a fresh
 * start, including choosing who to be.
 *
 * The navigation is returned rather than performed with `redirect()`, so the
 * caller keeps a plain resolved promise and can show the message first.
 */
export async function resetDemoData(): Promise<{ message: string; redirectTo: string }> {
  assertDemoMode();
  await resetMockData();
  const store = await cookies();
  store.delete(PERSONA_COOKIE);
  revalidatePath('/', 'layout');
  return { message: 'Näidisandmed on lähtestatud.', redirectTo: '/' };
}

/** The "Laadi näidisandmed" button on the Koolitused screen. */
export async function loadSampleData(): Promise<{ message: string }> {
  assertDemoMode();
  const db = getDb();
  const actor = await getActor();

  const result = db.transaction(
    (tx) => {
      const ctx: Ctx = {
        tx,
        at: nowMs(tx),
        actor: actor ? actorRef(actor) : { kind: 'system', id: null, label: 'Näidisandmed' },
        evidence: NO_EVIDENCE,
        outbox: [],
      };
      return loadSampleTrainings(ctx);
    },
    { behavior: 'immediate' },
  );

  revalidatePath('/tellija/koolitused');
  const { created, updated, locked, withErrors } = result.summary;
  return {
    message: `Näidisandmed laaditud: ${created} uut, ${updated} uuendatud, ${locked} lukus, ${withErrors} veaga.`,
  };
}
