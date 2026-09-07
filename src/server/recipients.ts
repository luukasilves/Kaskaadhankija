/**
 * Who receives a notification's e-mail.
 *
 * Kept apart from the engine so the answer can change without touching the
 * rules that decide *when* a notice is due: today a partner's mail goes to the
 * contact named in its framework membership; once the representatives' list is
 * uploaded it goes to every active representative of the company, with the lot
 * contact as the fallback. The engine only ever asks "who, for this partner".
 */

import { and, eq } from 'drizzle-orm';
import { lotPartners, partnerRepresentatives, users } from '@/db/schema';
import { env } from '@/lib/env';
import type { Db, Tx } from './context';

type Reader = Tx | Db;

/**
 * The addresses a partner's formal notices go to: every active representative
 * of the company [D-10], else the contact named in the lot membership. Empty
 * keeps the notice in-app only.
 */
export function partnerRecipients(tx: Reader, lotPartnerId: string): string[] {
  const member = tx
    .select({ partnerId: lotPartners.partnerId, contactEmail: lotPartners.contactEmail })
    .from(lotPartners)
    .where(eq(lotPartners.id, lotPartnerId))
    .get();
  if (!member) return [];

  const representatives = tx
    .select({ email: partnerRepresentatives.email })
    .from(partnerRepresentatives)
    .where(
      and(eq(partnerRepresentatives.partnerId, member.partnerId), eq(partnerRepresentatives.isActive, true)),
    )
    .all()
    .map((r) => r.email);
  if (representatives.length > 0) return representatives;

  return member.contactEmail ? [member.contactEmail] : [];
}

/**
 * The buyer team's addresses: the configured team mailbox, else every active
 * admin user. Empty keeps the team's copies in-app only.
 */
export function teamRecipients(tx: Reader): string[] {
  if (env.TEAM_NOTIFICATIONS_EMAIL) return [env.TEAM_NOTIFICATIONS_EMAIL];
  return tx
    .select({ email: users.email })
    .from(users)
    .where(and(eq(users.isActive, true), eq(users.role, 'admin')))
    .all()
    .map((row) => row.email);
}
