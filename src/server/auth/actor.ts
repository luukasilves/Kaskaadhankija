/**
 * Who is acting — the single seam between identity and everything else.
 *
 * Identity comes from a session opened by an e-mail code [L-08]: a buyer user
 * or a partner's representative, resolved through `sessionActor()`. In the test
 * deployment (`DEMO_MODE`) a persona cookie set by the opening screen or the
 * test strip stands in when there is no session, so a tester can be anyone
 * without an inbox. A live session always wins over a persona, and choosing a
 * persona ends the session, so identity is never ambiguous. Every page and
 * every server action goes through `getActor`, `requireBuyer` or
 * `requirePartner` and never inspects a cookie itself.
 *
 * Authorization rule for partners: an action receives a `roundId`, never a
 * `lotPartnerId`. The engine resolves which membership is acting from the
 * actor's `partnerId`, so a client cannot act for a company that is not theirs.
 */

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { lotPartners, lots, partnerRepresentatives, partners, users, type SessionSubjectKind } from '@/db/schema';
import { isDemoMode } from '@/lib/env';
import type { ActorRef, Evidence } from '../context';
import type { Db } from '../context';
import { resolveSession } from './codes';

export const PERSONA_COOKIE = 'kh_persona';
export const SESSION_COOKIE = 'kh_session';

export interface BuyerActor {
  kind: 'buyer';
  userId: string;
  name: string;
  email: string;
  role: 'admin' | 'member';
  /** how this actor appears in the audit log */
  label: string;
}

export interface PartnerActor {
  kind: 'partner';
  partnerId: string;
  partnerName: string;
  regCode: string;
  contactName: string;
  contactEmail: string;
  /** every lot membership this company holds */
  lotPartnerIds: string[];
  memberships: Array<{ lotPartnerId: string; lotId: string; lotCode: string; rank: number }>;
  label: string;
}

export type Actor = BuyerActor | PartnerActor;

function buildBuyer(row: typeof users.$inferSelect): BuyerActor {
  return {
    kind: 'buyer',
    userId: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    label: `${row.name} (Tellija)`,
  };
}

type Membership = { lotPartnerId: string; lotId: string; lotCode: string; rank: number; contactName: string; contactEmail: string };

/**
 * The acting person is the signed-in representative when there is one; the
 * persona fallback names the lot contact. Either way it is what the audit
 * trail and the confirmations record as who acted [D-09].
 */
function buildPartner(
  partner: typeof partners.$inferSelect,
  memberships: Membership[],
  person?: { name: string; email: string },
): PartnerActor {
  const contact = person ?? {
    name: memberships[0]?.contactName ?? '',
    email: memberships[0]?.contactEmail ?? '',
  };
  return {
    kind: 'partner',
    partnerId: partner.id,
    partnerName: partner.name,
    regCode: partner.regCode,
    contactName: contact.name,
    contactEmail: contact.email,
    lotPartnerIds: memberships.map((m) => m.lotPartnerId),
    memberships: memberships.map(({ lotPartnerId, lotId, lotCode, rank }) => ({
      lotPartnerId,
      lotId,
      lotCode,
      rank,
    })),
    label: `${contact.name || 'kontaktisik'}, ${partner.name}`,
  };
}

function membershipsOf(db: Db, partnerId: string): Membership[] {
  return db
    .select({
      lotPartnerId: lotPartners.id,
      lotId: lotPartners.lotId,
      lotCode: lots.code,
      rank: lotPartners.rank,
      contactName: lotPartners.contactName,
      contactEmail: lotPartners.contactEmail,
    })
    .from(lotPartners)
    .innerJoin(lots, eq(lots.id, lotPartners.lotId))
    .where(and(eq(lotPartners.partnerId, partnerId), eq(lotPartners.isActive, true)))
    .all()
    .sort((a, b) => a.lotCode.localeCompare(b.lotCode));
}

/** The actor a session subject stands for, or null if it has since been deactivated. */
export function actorForSubject(db: Db, kind: SessionSubjectKind, subjectId: string): Actor | null {
  if (kind === 'buyer') {
    const row = db
      .select()
      .from(users)
      .where(and(eq(users.id, subjectId), eq(users.isActive, true)))
      .get();
    return row ? buildBuyer(row) : null;
  }
  const representative = db
    .select()
    .from(partnerRepresentatives)
    .where(and(eq(partnerRepresentatives.id, subjectId), eq(partnerRepresentatives.isActive, true)))
    .get();
  if (!representative) return null;
  const partner = db
    .select()
    .from(partners)
    .where(and(eq(partners.id, representative.partnerId), eq(partners.isActive, true)))
    .get();
  if (!partner) return null;
  return buildPartner(partner, membershipsOf(db, partner.id), {
    name: representative.name,
    email: representative.email,
  });
}

/** The signed-in person behind the session cookie, if any [L-08]. */
export async function getSessionActor(): Promise<Actor | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = getDb();
  const session = resolveSession(db, token);
  if (!session) return null;
  return actorForSubject(db, session.subjectKind, session.subjectId);
}

export async function hasSession(): Promise<boolean> {
  return (await getSessionActor()) !== null;
}

/** Resolve a persona cookie value to a live actor, or null. */
export function resolvePersona(value: string | undefined): Actor | null {
  if (!value) return null;
  const db = getDb();
  const [kind, id] = value.split(':');
  if (!id) return null;

  if (kind === 'buyer') {
    const row = db
      .select()
      .from(users)
      .where(and(eq(users.id, id), eq(users.isActive, true)))
      .get();
    return row ? buildBuyer(row) : null;
  }

  if (kind === 'partner') {
    const partner = db
      .select()
      .from(partners)
      .where(and(eq(partners.id, id), eq(partners.isActive, true)))
      .get();
    if (!partner) return null;
    return buildPartner(partner, membershipsOf(db, id));
  }

  return null;
}

export async function getActor(): Promise<Actor | null> {
  const signedIn = await getSessionActor();
  if (signedIn) return signedIn;
  if (!isDemoMode) return null;
  const store = await cookies();
  return resolvePersona(store.get(PERSONA_COOKIE)?.value);
}

/** Where someone without the right identity is sent: the gate, or the sign-in. */
export function signInPath(): string {
  return isDemoMode ? '/' : '/sisene';
}

export async function requireBuyer(): Promise<BuyerActor> {
  const actor = await getActor();
  if (!actor || actor.kind !== 'buyer') redirect(signInPath());
  return actor;
}

/** A buyer with the admin role; throws rather than redirects, for actions. */
export async function requireAdmin(): Promise<BuyerActor> {
  const actor = await requireBuyer();
  if (actor.role !== 'admin') throw new Error('See toiming on ainult tellimismeeskonna adminile.');
  return actor;
}

export async function requirePartner(): Promise<PartnerActor> {
  const actor = await getActor();
  if (!actor || actor.kind !== 'partner') redirect(signInPath());
  return actor;
}

/** The audit-log shape of the current actor. */
export function actorRef(actor: Actor): ActorRef {
  return actor.kind === 'buyer'
    ? { kind: 'buyer', id: actor.userId, label: actor.label }
    : { kind: 'partner', id: actor.partnerId, label: actor.label };
}

/** [D-09] request evidence, kept solely as procurement evidence. */
export async function requestEvidence(): Promise<Evidence> {
  const store = await headers();
  const forwarded = store.get('x-forwarded-for') ?? '';
  return {
    ip: forwarded.split(',')[0]?.trim() || store.get('x-real-ip') || '',
    ua: store.get('user-agent') ?? '',
  };
}
