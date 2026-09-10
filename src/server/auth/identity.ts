/**
 * The identity decisions, as pure functions.
 *
 * Two cookies carry two different facts: `kh_session` says who is signed in,
 * `kh_persona` says whom a signed-in admin is acting as. Everything that follows
 * from that pair — where a sign-in lands, who may act as somebody else, which
 * actor a request runs as, and how the act-as shows up in the evidence — is
 * decided here, without touching `next/headers` or the database, so the rules
 * can be tested directly rather than through a browser.
 *
 * The rules [L-08]:
 *
 *  - No session, no actor. The sign-in is the front door in both environments;
 *    nobody reaches a participant's view without proving a mailbox first.
 *  - In the test environment a buyer **admin** lands on the act-as screen after
 *    every sign-in and may act as any participant. The session stays open, so
 *    switching is not a logout and the trail always names the real person.
 *  - Everyone else — a buyer member, a partner's representative — lands in their
 *    own area and cannot act as anyone.
 */

import type { ActingVia } from '../context';
import type { Actor, BuyerActor } from './actor';

export type { ActingVia };

/** The act-as screen; also the front door of the test environment's buyer side. */
export const ACT_AS_PATH = '/';

export type LandingSubject =
  | { kind: 'buyer'; role: 'admin' | 'member' }
  | { kind: 'partner' | 'representative'; role?: undefined };

/** Where a kind of identity works. */
export function areaHome(kind: 'buyer' | 'partner' | 'representative'): string {
  return kind === 'buyer' ? '/tellija' : '/partner/voorud';
}

/**
 * Where a sign-in lands. An admin in the test environment gets the act-as
 * screen every time, because the persona cookie is dropped at verification —
 * so the choice is made fresh rather than inherited from last week.
 */
export function landingAfterSignIn(subject: LandingSubject, demoMode: boolean): string {
  if (demoMode && subject.kind === 'buyer' && subject.role === 'admin') return ACT_AS_PATH;
  return areaHome(subject.kind);
}

/** Only a signed-in buyer admin, and only in the test environment. */
export function mayActAs(session: Actor | null, demoMode: boolean): session is BuyerActor {
  return demoMode && session?.kind === 'buyer' && session.role === 'admin';
}

/**
 * The actor a request runs as: the chosen participant when an admin has chosen
 * one, otherwise the signed-in person themselves.
 *
 * Choosing one's own card is not "acting as" anybody — it is the way back to
 * oneself — so it resolves to the session with no `via`.
 */
export function resolveActing(
  session: Actor | null,
  chosen: Actor | null,
  demoMode: boolean,
): Actor | null {
  if (!session) return null;
  if (!mayActAs(session, demoMode)) return session;
  if (!chosen) return session;
  if (chosen.kind === 'buyer' && chosen.userId === session.userId) return session;
  return { ...chosen, via: { userId: session.userId, label: session.name } };
}

/**
 * The label a partner's confirmation is signed with [D-09]. The participant's
 * own contact is what the procurement needs to see; the admin who operated the
 * screen is named in the same string rather than hidden behind it.
 */
export function evidenceLabel(ref: { label: string; via?: ActingVia }): string {
  return ref.via ? `${ref.label} (testkeskkonnas tegutses: ${ref.via.label})` : ref.label;
}
