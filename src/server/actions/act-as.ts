'use server';

/**
 * Acting as a participant — the test environment's way to see the tool from
 * somebody else's side without borrowing their mailbox.
 *
 * Only a signed-in buyer admin may do it, and doing it does **not** end their
 * session: `kh_session` still says who is really there, `kh_persona` says whom
 * they are looking as, and every write records both [L-08]. That is the whole
 * difference from the old persona picker, which logged the tester out and left
 * the trail naming a company instead of a person.
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { isDemoMode } from '@/lib/env';
import { PERSONA_COOKIE, getSessionActor, resolvePersona } from '../auth/actor';
import { areaHome, mayActAs } from '../auth/identity';

const THIRTY_DAYS = 60 * 60 * 24 * 30;

async function requireActAsRight(): Promise<void> {
  const signedIn = await getSessionActor();
  if (!mayActAs(signedIn, isDemoMode)) {
    throw new Error('Teise osalejana saab tegutseda ainult sisse loginud tellimismeeskonna admin.');
  }
}

async function apply(key: string): Promise<string> {
  await requireActAsRight();
  const chosen = resolvePersona(key);
  if (!chosen) throw new Error('Tundmatu osaleja.');
  const store = await cookies();
  store.set(PERSONA_COOKIE, key, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: THIRTY_DAYS,
    secure: process.env.NODE_ENV === 'production',
  });
  return areaHome(chosen.kind);
}

/** From the act-as screen (a plain form post, so it works without JS). */
export async function actAs(formData: FormData): Promise<void> {
  redirect(await apply(String(formData.get('persona') ?? '')));
}

/** From the strip's dropdown. */
export async function switchActingAs(key: string): Promise<void> {
  redirect(await apply(key));
}

/** Back to the act-as screen, still signed in. */
export async function stopActingAs(): Promise<void> {
  await requireActAsRight();
  (await cookies()).delete(PERSONA_COOKIE);
  redirect('/');
}

/** "Jätka enda nimel" — into the buyer area as oneself. */
export async function actAsSelf(): Promise<void> {
  await requireActAsRight();
  (await cookies()).delete(PERSONA_COOKIE);
  redirect('/tellija');
}
