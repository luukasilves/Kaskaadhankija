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
 * Every address the framework data knows — the derived half of the allowed
 * recipients [L-19].
 *
 * The buyer already maintains this list: it is the framework agreement's own
 * contacts and representatives. Deriving it means nobody edits a secret to
 * onboard a bidder, which is what used to leave a real partner receiving
 * neither a round notice nor a sign-in code.
 *
 * Two properties this function must keep:
 *
 *  - **It must not be narrower than the sign-in gate [L-08].** An address that
 *    can request a code has to be able to receive it. `findSubjectByEmail`
 *    treats a representative as known on `partner_representatives.isActive`
 *    alone, so this does too — deliberately **not** joining `partners.isActive`,
 *    however much the neighbouring framework code does. A representative of a
 *    deactivated company can still sign in.
 *  - **It reads only live, buyer-maintained rows.** Never the frozen evidence
 *    (`round_participants.contact_email_snapshot`, `confirmations.contact_email`,
 *    the order snapshot), which would resurrect a partner the buyer has since
 *    removed, and never `login_codes.email`, which is whatever a stranger typed.
 */
export function frameworkRecipients(tx: Reader): string[] {
  const representatives = tx
    .select({ email: partnerRepresentatives.email })
    .from(partnerRepresentatives)
    .where(eq(partnerRepresentatives.isActive, true))
    .all()
    .map((row) => row.email);

  // The lot contact is normally mirrored into a `framework`-sourced
  // representative row, so this is belt to that brace — and it is the only
  // address that exists before any representatives import has run.
  const contacts = tx
    .select({ email: lotPartners.contactEmail })
    .from(lotPartners)
    .where(eq(lotPartners.isActive, true))
    .all()
    .map((row) => row.email);

  const all = [...representatives, ...contacts]
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(all)];
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
