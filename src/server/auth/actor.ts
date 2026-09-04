/**
 * Who is acting — the single seam between identity and everything else.
 *
 * In the test deployment (`DEMO_MODE`) identity comes from a persona cookie set
 * by the opening screen or the test strip: no passwords, no accounts, and
 * switching personas is the point. In production this is the only file that
 * changes — `sessionActor()` grows a real session lookup — because every page
 * and every server action goes through `getActor`, `requireBuyer` or
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
import { lotPartners, lots, partners, users } from '@/db/schema';
import { isDemoMode } from '@/lib/env';
import type { ActorRef, Evidence } from '../context';

export const PERSONA_COOKIE = 'kh_persona';

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

function buildPartner(
  partner: typeof partners.$inferSelect,
  memberships: Array<{ lotPartnerId: string; lotId: string; lotCode: string; rank: number; contactName: string; contactEmail: string }>,
): PartnerActor {
  const contact = memberships[0];
  return {
    kind: 'partner',
    partnerId: partner.id,
    partnerName: partner.name,
    regCode: partner.regCode,
    contactName: contact?.contactName ?? '',
    contactEmail: contact?.contactEmail ?? '',
    lotPartnerIds: memberships.map((m) => m.lotPartnerId),
    memberships: memberships.map(({ lotPartnerId, lotId, lotCode, rank }) => ({
      lotPartnerId,
      lotId,
      lotCode,
      rank,
    })),
    label: `${contact?.contactName ?? 'kontaktisik'}, ${partner.name}`,
  };
}

/** Production identity. Grows a session lookup when real auth lands (L-08). */
async function sessionActor(): Promise<Actor | null> {
  return null;
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
    const memberships = db
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
      .where(and(eq(lotPartners.partnerId, id), eq(lotPartners.isActive, true)))
      .all()
      .sort((a, b) => a.lotCode.localeCompare(b.lotCode));
    return buildPartner(partner, memberships);
  }

  return null;
}

export async function getActor(): Promise<Actor | null> {
  if (!isDemoMode) return sessionActor();
  const store = await cookies();
  return resolvePersona(store.get(PERSONA_COOKIE)?.value);
}

export async function requireBuyer(): Promise<BuyerActor> {
  const actor = await getActor();
  if (!actor || actor.kind !== 'buyer') redirect('/');
  return actor;
}

export async function requirePartner(): Promise<PartnerActor> {
  const actor = await getActor();
  if (!actor || actor.kind !== 'partner') redirect('/');
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
