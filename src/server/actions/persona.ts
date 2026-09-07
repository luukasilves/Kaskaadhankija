'use server';

/**
 * Persona selection — the test harness's stand-in for authentication.
 *
 * Two entry points, matching the two places a persona is chosen: the opening
 * screen, before any of the environment is visible, and the strip's dropdown
 * from inside it. Both funnel through one cookie write so there is a single
 * place where identity is established in demo mode.
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { assertDemoMode } from '@/lib/env';
import { PERSONA_COOKIE, resolvePersona } from '../auth/actor';
import { endSession } from './auth';

const THIRTY_DAYS = 60 * 60 * 24 * 30;

function homeFor(value: string): string {
  return value.startsWith('buyer:') ? '/tellija' : '/partner/voorud';
}

async function applyPersona(key: string): Promise<string> {
  assertDemoMode();
  if (!resolvePersona(key)) throw new Error('Tundmatu persoon.');
  // A live session would otherwise keep winning over the persona [L-08].
  await endSession();
  const store = await cookies();
  store.set(PERSONA_COOKIE, key, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: THIRTY_DAYS,
    secure: process.env.NODE_ENV === 'production',
  });
  return homeFor(key);
}

/** From the opening screen (a plain form post, so it works without JS). */
export async function choosePersona(formData: FormData): Promise<void> {
  const key = String(formData.get('persona') ?? '');
  redirect(await applyPersona(key));
}

/** From the strip. */
export async function switchPersona(key: string): Promise<void> {
  redirect(await applyPersona(key));
}

export async function clearPersona(): Promise<void> {
  assertDemoMode();
  await endSession();
  const store = await cookies();
  store.delete(PERSONA_COOKIE);
  redirect('/');
}
