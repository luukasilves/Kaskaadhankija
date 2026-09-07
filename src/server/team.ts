/**
 * The buyer team [R-01]: who may act as the tellija.
 *
 * Users have no passwords; they sign in with a code sent to their address, so
 * the list of addresses *is* the access list, and an address is either a team
 * member or a partner's representative, never both.
 */

import { and, eq, ne } from 'drizzle-orm';
import { partnerRepresentatives, users } from '@/db/schema';
import { logAudit } from './audit';
import type { Ctx } from './context';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function addTeamMember(
  ctx: Ctx,
  input: { name: string; email: string; role: 'admin' | 'member' },
): string {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (name.length < 2 || name.length > 80) throw new Error('Nimi peab olema 2–80 tähemärki.');
  if (!EMAIL_RE.test(email)) throw new Error('E-posti aadress ei ole korrektne.');
  if (input.role !== 'admin' && input.role !== 'member') throw new Error('Tundmatu roll.');

  const representative = ctx.tx
    .select({ id: partnerRepresentatives.id })
    .from(partnerRepresentatives)
    .where(and(eq(partnerRepresentatives.email, email), eq(partnerRepresentatives.isActive, true)))
    .get();
  if (representative) {
    throw new Error('See aadress on partneri esindaja ja ei saa olla tellimismeeskonna liige.');
  }

  const existing = ctx.tx.select().from(users).where(eq(users.email, email)).get();
  if (existing?.isActive) throw new Error('Selle e-postiga kasutaja on juba olemas.');

  if (existing) {
    ctx.tx.update(users).set({ name, role: input.role, isActive: true }).where(eq(users.id, existing.id)).run();
    logAudit(ctx, {
      eventType: 'team.member_updated',
      summary: `${name} (${email}) taas tellimismeeskonnas rollis ${input.role}`,
      after: { userId: existing.id, role: input.role, isActive: true },
    });
    return existing.id;
  }

  const id = crypto.randomUUID();
  ctx.tx.insert(users).values({ id, name, email, role: input.role, isActive: true, createdAt: ctx.at }).run();
  logAudit(ctx, {
    eventType: 'team.member_added',
    summary: `${name} (${email}) lisatud tellimismeeskonda rollis ${input.role}`,
    after: { userId: id, role: input.role },
  });
  return id;
}

export function setTeamMemberActive(ctx: Ctx, userId: string, active: boolean): void {
  const user = ctx.tx.select().from(users).where(eq(users.id, userId)).get();
  if (!user) throw new Error('Kasutajat ei leitud.');
  if (user.isActive === active) return;

  if (!active && user.role === 'admin') {
    const otherAdmins = ctx.tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.isActive, true), eq(users.role, 'admin'), ne(users.id, userId)))
      .all();
    if (otherAdmins.length === 0) throw new Error('Viimast aktiivset adminit ei saa deaktiveerida.');
  }

  ctx.tx.update(users).set({ isActive: active }).where(eq(users.id, userId)).run();
  logAudit(ctx, {
    eventType: 'team.member_updated',
    summary: active
      ? `${user.name} (${user.email}) taas aktiivne tellimismeeskonnas`
      : `${user.name} (${user.email}) deaktiveeritud tellimismeeskonnas`,
    after: { userId, isActive: active },
  });
}
