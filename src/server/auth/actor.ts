/**
 * Who is acting — the single seam between identity and everything else.
 *
 * Identity always comes from a session opened by an e-mail code [L-08]: a buyer
 * user or a partner's representative. Without one there is no actor, in either
 * environment — the sign-in is the front door.
 *
 * In the test deployment (`DEMO_MODE`) a signed-in buyer **admin** may act as
 * any participant, which is what the second cookie carries. The session stays
 * open underneath: `acting` is who the request runs as, `signedIn` is who is
 * really there, and the difference is recorded as `via` on every audit row and
 * in the confirmation evidence. The rules themselves live in `./identity`,
 * which knows nothing of cookies. Every page and every server action goes
 * through `getActor`, `requireBuyer` or `requirePartner` and never inspects a
 * cookie itself.
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
import type { ActingVia, ActorRef, Evidence } from '../context';
import type { Db } from '../context';
import { resolveSession } from './codes';
import { mayActAs, mayAdminister, mayWriteProcurement, resolveActing, WRITE_REFUSED } from './identity';

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
  /** the signed-in admin acting as this actor, in the test environment */
  via?: ActingVia;
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
  via?: ActingVia;
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

/** Resolve an act-as cookie value to a live actor, or null. */
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

export interface Identity {
  /** the person the session belongs to */
  signedIn: Actor | null;
  /** who the request runs as: an act-as choice, or the signed-in person */
  acting: Actor | null;
  /** the act-as cookie value, when it resolves and the signed-in person may use it */
  actingKey: string | null;
}

/**
 * Both cookies, read once. Pages that show who is signed in *and* who they are
 * acting as need the pair; `getActor()` is the common case of wanting only the
 * second.
 */
export async function resolveIdentity(): Promise<Identity> {
  const signedIn = await getSessionActor();
  if (!signedIn) return { signedIn: null, acting: null, actingKey: null };
  if (!mayActAs(signedIn, isDemoMode)) return { signedIn, acting: signedIn, actingKey: null };

  const store = await cookies();
  const key = store.get(PERSONA_COOKIE)?.value;
  const chosen = resolvePersona(key);
  return {
    signedIn,
    acting: resolveActing(signedIn, chosen, isDemoMode),
    // A cookie left behind by data that has since changed names an identity
    // that no longer exists; treat it as no choice at all.
    actingKey: chosen ? (key ?? null) : null,
  };
}

export async function getActor(): Promise<Actor | null> {
  return (await resolveIdentity()).acting;
}

/** Where someone without the right identity is sent. */
export function signInPath(): string {
  return '/sisene';
}

export async function requireBuyer(): Promise<BuyerActor> {
  const actor = await getActor();
  if (!actor || actor.kind !== 'buyer') redirect(signInPath());
  return actor;
}

export async function requirePartner(): Promise<PartnerActor> {
  const actor = await getActor();
  if (!actor || actor.kind !== 'partner') redirect(signInPath());
  return actor;
}

/**
 * Whether the buyer screens should offer their **procurement** write controls
 * [R-01] — creating and publishing rounds, importing a calendar, the review,
 * the confirmation, the protocol.
 *
 * True for both roles: that is the purchaser's job. Pages ask this to swap a
 * panel for `<ReadOnlyNote />` rather than to decide anything; the decision is
 * `buyerWrite`'s, and it is enforced there whatever the page renders.
 */
export async function buyerCanWrite(): Promise<boolean> {
  return mayWriteProcurement(await getActor());
}

/**
 * Whether the screens should offer their **administration** controls: the
 * framework agreement's own data [L-21] and the team.
 *
 * A purchaser reads all of it and changes none of it, so these screens ask this
 * instead of `buyerCanWrite`.
 */
export async function buyerIsAdmin(): Promise<boolean> {
  return mayAdminister(await getActor());
}

/**
 * The guards for server actions.
 *
 * Both throw rather than redirecting, always: every action wraps its write in a
 * `try/catch` that turns a thrown error into a message on the form, and
 * `redirect()` throws a `NEXT_REDIRECT` that such a catch would swallow into a
 * nonsense message. So somebody asking for a write they may not do gets told
 * why, on the page.
 */
export async function assertBuyerActor(): Promise<BuyerActor> {
  const actor = await getActor();
  if (!mayWriteProcurement(actor)) throw new Error(WRITE_REFUSED.notBuyer);
  return actor;
}

export async function assertAdminActor(): Promise<BuyerActor> {
  const actor = await assertBuyerActor();
  if (!mayAdminister(actor)) throw new Error(WRITE_REFUSED.notAdmin);
  return actor;
}

/** The audit-log shape of the current actor. */
export function actorRef(actor: Actor): ActorRef {
  const base =
    actor.kind === 'buyer'
      ? { kind: 'buyer' as const, id: actor.userId, label: actor.label }
      : { kind: 'partner' as const, id: actor.partnerId, label: actor.label };
  return actor.via ? { ...base, via: actor.via } : base;
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
