/**
 * A representative's own notification switch [D-10][L-27].
 *
 * One boolean: informational e-mail on or off. It is personal — the signed-in
 * representative's row, never the company's — which is why an admin acting as
 * a partner in the test environment cannot flip it: there is no person behind
 * that request whose mailbox it would be.
 */

import { and, eq } from 'drizzle-orm';
import { partnerRepresentatives } from '@/db/schema';
import { logAudit } from './audit';
import type { PartnerActor } from './auth/actor';
import type { Ctx, Db, Tx } from './context';

type Reader = Tx | Db;

/** The switch as it stands, or null when the actor is not a signed-in person. */
export function informationalMailOn(tx: Reader, actor: Pick<PartnerActor, 'representativeId' | 'partnerId'>): boolean | null {
  if (!actor.representativeId) return null;
  const row = tx
    .select({ notifyInformational: partnerRepresentatives.notifyInformational })
    .from(partnerRepresentatives)
    .where(
      and(
        eq(partnerRepresentatives.id, actor.representativeId),
        eq(partnerRepresentatives.partnerId, actor.partnerId),
        eq(partnerRepresentatives.isActive, true),
      ),
    )
    .get();
  return row ? row.notifyInformational : null;
}

export function setInformationalMail(
  ctx: Ctx,
  actor: Pick<PartnerActor, 'representativeId' | 'partnerId'>,
  on: boolean,
): { changed: boolean } {
  if (!actor.representativeId) {
    throw new Error('Teavituste seadistus on isiklik — teise osalejana tegutsedes seda ei muudeta.');
  }
  const row = ctx.tx
    .select()
    .from(partnerRepresentatives)
    .where(
      and(
        eq(partnerRepresentatives.id, actor.representativeId),
        eq(partnerRepresentatives.partnerId, actor.partnerId),
        eq(partnerRepresentatives.isActive, true),
      ),
    )
    .get();
  if (!row) throw new Error('Esindajat ei leitud.');
  if (row.notifyInformational === on) return { changed: false };

  ctx.tx
    .update(partnerRepresentatives)
    .set({ notifyInformational: on, updatedAt: ctx.at })
    .where(eq(partnerRepresentatives.id, row.id))
    .run();
  logAudit(ctx, {
    eventType: 'representative.preferences_changed',
    summary: `${row.name} (${row.email}): teabekirjad e-postiga ${on ? 'sisse' : 'välja'} lülitatud`,
    before: { notifyInformational: row.notifyInformational },
    after: { notifyInformational: on, representativeId: row.id },
  });
  return { changed: true };
}
