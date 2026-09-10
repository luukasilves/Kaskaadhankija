/**
 * Sign-in codes and sessions [L-08]: hashed at rest, rate-limited before the
 * lookup, five guesses then burned, one use, real-time expiry.
 */

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loginCodes, partnerRepresentatives, sessions, users } from '@/db/schema';
import { env } from '@/lib/env';
import {
  CODE_MAX_ATTEMPTS,
  CODE_TTL_MS,
  SESSION_TTL_MS,
  createSession,
  emailDomainAllowsAdmin,
  findSubjectByEmail,
  generateCode,
  hashCode,
  issueLoginCode,
  knownButInactive,
  nameFromEmail,
  parseAdminDomains,
  purgeAuthRows,
  resolveSession,
  revokeSession,
  verifyLoginCode,
} from './codes';
import { createHarness, seedLotWithPartners, type LotFixture, type TestHarness } from '../test-support';

let harness: TestHarness;
let fx: LotFixture;
const NOW = Date.UTC(2026, 8, 7, 12, 0);
const EVIDENCE = { ip: '203.0.113.7', ua: 'test' };

beforeEach(() => {
  harness = createHarness();
  fx = seedLotWithPartners(harness, { partnerCount: 2, trainingCount: 1 });
  harness.write((ctx) => {
    ctx.tx
      .insert(users)
      .values([
        { id: 'u-mari', name: 'Mari Tamm', email: 'Mari.Tamm@riik.ee', role: 'admin', isActive: true, createdAt: ctx.at },
        { id: 'u-endine', name: 'Endine', email: 'endine@riik.ee', role: 'member', isActive: false, createdAt: ctx.at },
      ])
      .run();
    ctx.tx
      .insert(partnerRepresentatives)
      .values([
        { id: 'r-jaan', partnerId: fx.partnerIds[0]!, name: 'Jaan Kask', email: 'jaan@partner.ee', role: 'esindaja', createdAt: ctx.at, updatedAt: ctx.at },
        { id: 'r-vana', partnerId: fx.partnerIds[0]!, name: 'Vana', email: 'vana@partner.ee', role: 'asendaja', isActive: false, createdAt: ctx.at, updatedAt: ctx.at },
      ])
      .run();
  });
});

afterEach(() => {
  harness.close();
  env.AUTO_ADMIN_EMAIL_DOMAINS = undefined;
});

const issue = (email: string, over: Partial<Parameters<typeof issueLoginCode>[1]> = {}) =>
  harness.write((ctx) => issueLoginCode(ctx.tx, { email, ip: EVIDENCE.ip, now: NOW, ...over }));
const verify = (email: string, code: string, now = NOW + 1_000) =>
  harness.write((ctx) => verifyLoginCode(ctx.tx, { email, code, now }));
const codeRows = () => harness.read((db) => db.select().from(loginCodes).all());

describe('codes', () => {
  it('are six digits, and only their keyed hash is stored', () => {
    for (let i = 0; i < 20; i++) expect(generateCode()).toMatch(/^\d{6}$/);
    expect(hashCode('a@x.ee', '123456', 's')).toBe(hashCode('A@X.ee ', '123456', 's'));
    expect(hashCode('a@x.ee', '123456', 's')).not.toBe(hashCode('a@x.ee', '123457', 's'));
    expect(hashCode('a@x.ee', '123456', 's')).not.toBe(hashCode('a@x.ee', '123456', 't'));

    const result = issue('jaan@partner.ee');
    expect(result.outcome).toBe('sent');
    if (result.outcome !== 'sent') return;
    const [row] = codeRows();
    expect(row?.codeHash).not.toContain(result.code);
    expect(row?.email).toBe('jaan@partner.ee');
    expect(row?.expiresAt).toBe(NOW + CODE_TTL_MS);
  });

  it('knows active users and representatives, case-insensitively, and nobody inactive', () => {
    expect(harness.read((db) => findSubjectByEmail(db, 'mari.tamm@RIIK.ee'))?.kind).toBe('buyer');
    expect(harness.read((db) => findSubjectByEmail(db, 'jaan@partner.ee'))).toMatchObject({ kind: 'representative', partnerId: fx.partnerIds[0] });
    expect(harness.read((db) => findSubjectByEmail(db, 'endine@riik.ee'))).toBeNull();
    expect(harness.read((db) => findSubjectByEmail(db, 'vana@partner.ee'))).toBeNull();
    expect(harness.read((db) => findSubjectByEmail(db, 'keegi@mujal.ee'))).toBeNull();
  });

  it('issues nothing for an unknown address, without leaving a trace', () => {
    expect(issue('keegi@mujal.ee')).toEqual({ outcome: 'unknown' });
    expect(codeRows()).toHaveLength(0);
  });

  it('rate-limits per address and per IP before looking anyone up', () => {
    const limits = { perEmail: { max: 2, windowMs: 60_000 }, perIp: { max: 3, windowMs: 60_000 } };
    expect(issue('jaan@partner.ee', { limits }).outcome).toBe('sent');
    expect(issue('jaan@partner.ee', { limits }).outcome).toBe('sent');
    expect(issue('jaan@partner.ee', { limits })).toEqual({ outcome: 'rate_limited', limit: 'email' });
    expect(issue('mari.tamm@riik.ee', { limits }).outcome).toBe('sent');
    expect(issue('mari.tamm@riik.ee', { limits })).toEqual({ outcome: 'rate_limited', limit: 'ip' });
    // Outside the window, or from elsewhere, the limit lifts.
    expect(issue('mari.tamm@riik.ee', { limits, now: NOW + 61_000 }).outcome).toBe('sent');
    expect(issue('jaan@partner.ee', { limits, ip: '198.51.100.1', now: NOW + 61_000 }).outcome).toBe('sent');
  });

  it('accepts the right code once, and refuses it a second time', () => {
    const result = issue('jaan@partner.ee');
    if (result.outcome !== 'sent') throw new Error('no code');
    expect(verify('JAAN@partner.ee', result.code)).toMatchObject({ ok: true, who: { existing: { kind: 'representative', id: 'r-jaan' } } });
    expect(verify('jaan@partner.ee', result.code)).toEqual({ ok: false, reason: 'no_code' });
  });

  it('counts wrong guesses and burns the code on the fifth', () => {
    const result = issue('mari.tamm@riik.ee');
    if (result.outcome !== 'sent') throw new Error('no code');
    const wrong = result.code === '000000' ? '000001' : '000000';
    for (let i = 1; i < CODE_MAX_ATTEMPTS; i++) {
      expect(verify('mari.tamm@riik.ee', wrong)).toEqual({ ok: false, reason: 'wrong' });
    }
    expect(verify('mari.tamm@riik.ee', wrong)).toEqual({ ok: false, reason: 'locked' });
    // Even the right code is dead now.
    expect(verify('mari.tamm@riik.ee', result.code)).toEqual({ ok: false, reason: 'no_code' });
    expect(codeRows()[0]?.consumedAt).toBeTruthy();
  });

  it('expires after ten minutes and tolerates spaces in the typed code', () => {
    const result = issue('mari.tamm@riik.ee');
    if (result.outcome !== 'sent') throw new Error('no code');
    expect(verify('mari.tamm@riik.ee', result.code, NOW + CODE_TTL_MS + 1)).toEqual({ ok: false, reason: 'expired' });
    const again = issue('mari.tamm@riik.ee', { now: NOW + CODE_TTL_MS + 2 });
    if (again.outcome !== 'sent') throw new Error('no code');
    const spaced = `${again.code.slice(0, 3)} ${again.code.slice(3)}`;
    expect(verify('mari.tamm@riik.ee', spaced, NOW + CODE_TTL_MS + 3).ok).toBe(true);
  });

  it('refuses to open a session for an address deactivated after the code was sent', () => {
    const result = issue('jaan@partner.ee');
    if (result.outcome !== 'sent') throw new Error('no code');
    harness.write((ctx) =>
      ctx.tx.update(partnerRepresentatives).set({ isActive: false }).where(eq(partnerRepresentatives.id, 'r-jaan')).run(),
    );
    expect(verify('jaan@partner.ee', result.code)).toEqual({ ok: false, reason: 'subject_gone' });
  });
});

describe('sessions', () => {
  const subject = {
    kind: 'buyer' as const,
    id: 'u-mari',
    name: 'Mari Tamm',
    email: 'mari.tamm@riik.ee',
    role: 'admin' as const,
  };

  it('resolve by token until they expire or are revoked, storing only the hash', () => {
    const { token, sessionId } = harness.write((ctx) => createSession(ctx.tx, subject, EVIDENCE, NOW));
    const stored = harness.read((db) => db.select().from(sessions).where(eq(sessions.id, sessionId)).get());
    expect(stored?.tokenHash).not.toBe(token);
    expect(stored?.ip).toBe(EVIDENCE.ip);

    expect(harness.read((db) => resolveSession(db, token, NOW + 1_000))).toMatchObject({ subjectKind: 'buyer', subjectId: 'u-mari' });
    expect(harness.read((db) => resolveSession(db, 'not-a-token', NOW + 1_000))).toBeNull();
    expect(harness.read((db) => resolveSession(db, token, NOW + SESSION_TTL_MS + 1))).toBeNull();

    // Last-seen is refreshed, but not on every request.
    harness.read((db) => resolveSession(db, token, NOW + 6 * 60_000));
    expect(harness.read((db) => db.select().from(sessions).where(eq(sessions.id, sessionId)).get())?.lastSeenAt).toBe(NOW + 6 * 60_000);

    expect(harness.write((ctx) => revokeSession(ctx.tx, token, NOW + 7 * 60_000))).toBe(true);
    expect(harness.read((db) => resolveSession(db, token, NOW + 8 * 60_000))).toBeNull();
    expect(harness.write((ctx) => revokeSession(ctx.tx, token, NOW))).toBe(false);
  });

  it('are swept out with spent codes by the housekeeping job', () => {
    issue('mari.tamm@riik.ee');
    const { token } = harness.write((ctx) => createSession(ctx.tx, subject, EVIDENCE, NOW));
    harness.write((ctx) => revokeSession(ctx.tx, token, NOW));
    expect(harness.write((ctx) => purgeAuthRows(ctx.tx, NOW + 60_000))).toEqual({ codes: 0, sessions: 0 });
    expect(harness.write((ctx) => purgeAuthRows(ctx.tx, NOW + 40 * 86_400_000))).toEqual({ codes: 1, sessions: 1 });
    expect(codeRows()).toHaveLength(0);
  });
});

describe('the buyer-domain rule [L-08]', () => {
  const DOMAIN = '@riik.ee';
  const NEWCOMER = 'kirke.kask@riik.ee';

  beforeEach(() => {
    env.AUTO_ADMIN_EMAIL_DOMAINS = DOMAIN;
  });

  it('parses domains with or without the @, and matches only the whole domain', () => {
    expect(parseAdminDomains(' riigikantselei.ee, @Muu.EE ')).toEqual(['@riigikantselei.ee', '@muu.ee']);
    expect(parseAdminDomains(undefined)).toEqual([]);

    const domains = ['@riigikantselei.ee'];
    expect(emailDomainAllowsAdmin('Keegi@Riigikantselei.ee', domains)).toBe(true);
    expect(emailDomainAllowsAdmin('keegi@evil-riigikantselei.ee', domains)).toBe(false);
    expect(emailDomainAllowsAdmin('keegi@riigikantselei.ee.example', domains)).toBe(false);
    expect(emailDomainAllowsAdmin('keegi@sub.riigikantselei.ee', domains)).toBe(false);
    expect(emailDomainAllowsAdmin('mitte-aadress', domains)).toBe(false);
    // With nothing configured the rule admits nobody.
    expect(emailDomainAllowsAdmin('keegi@riigikantselei.ee', [])).toBe(false);
  });

  it('derives a display name from the address, falling back to the address itself', () => {
    expect(nameFromEmail('kirke.kask@riik.ee')).toBe('Kirke Kask');
    expect(nameFromEmail('MARI_TAMM@riik.ee')).toBe('Mari Tamm');
    expect(nameFromEmail('a@riik.ee')).toBe('a@riik.ee');
  });

  it('sends a code to an unlisted address at the domain, addressed by the derived name', () => {
    const result = issue(NEWCOMER);
    expect(result).toMatchObject({ outcome: 'sent', recipientName: 'Kirke Kask', subjectKind: 'buyer', byDomainRule: true });
    // Nothing is created yet: requesting codes must not populate the team.
    expect(harness.read((db) => findSubjectByEmail(db, NEWCOMER))).toBeNull();
  });

  it('still refuses an unlisted address at any other domain', () => {
    expect(issue('keegi@mujal.ee')).toEqual({ outcome: 'unknown' });
  });

  it('hands the caller a provisioning intent once the code is verified', () => {
    const result = issue(NEWCOMER);
    if (result.outcome !== 'sent') throw new Error('no code');
    const verified = verify(NEWCOMER, result.code);
    expect(verified).toEqual({ ok: true, who: { toProvision: { email: NEWCOMER, name: 'Kirke Kask' } } });
  });

  it('leaves someone already listed with their own identity', () => {
    // The seeded buyer is at the same domain in this test's configuration.
    harness.write((ctx) =>
      ctx.tx.insert(users).values({ id: 'u-domain', name: 'Juba Olemas', email: 'juba@riik.ee', role: 'member', isActive: true, createdAt: ctx.at }).run(),
    );
    const result = issue('juba@riik.ee');
    expect(result).toMatchObject({ outcome: 'sent', recipientName: 'Juba Olemas', byDomainRule: false });
    if (result.outcome !== 'sent') return;
    expect(verify('juba@riik.ee', result.code)).toEqual({
      ok: true,
      // Their own row wins over the domain rule, role and all: the rule creates
      // admins, but it never promotes somebody who is already a member.
      who: { existing: { kind: 'buyer', id: 'u-domain', name: 'Juba Olemas', email: 'juba@riik.ee', role: 'member' } },
    });
  });

  it('never resurrects somebody an admin switched off', () => {
    // `u-endine` is a deactivated user at this very domain.
    expect(harness.read((db) => knownButInactive(db, 'endine@riik.ee'))).toBe(true);
    expect(issue('endine@riik.ee')).toEqual({ outcome: 'unknown' });

    // Even a code obtained while they were still active gets them nowhere.
    harness.write((ctx) => ctx.tx.update(users).set({ isActive: true }).where(eq(users.id, 'u-endine')).run());
    const result = issue('endine@riik.ee');
    if (result.outcome !== 'sent') throw new Error('no code');
    harness.write((ctx) => ctx.tx.update(users).set({ isActive: false }).where(eq(users.id, 'u-endine')).run());
    expect(verify('endine@riik.ee', result.code)).toEqual({ ok: false, reason: 'subject_gone' });
  });

  it('leaves a representative at that domain as the partner they are', () => {
    harness.write((ctx) =>
      ctx.tx
        .insert(partnerRepresentatives)
        .values({ id: 'r-odd', partnerId: fx.partnerIds[0]!, name: 'Kummaline', email: 'kummaline@riik.ee', role: 'esindaja', createdAt: ctx.at, updatedAt: ctx.at })
        .run(),
    );
    const result = issue('kummaline@riik.ee');
    expect(result).toMatchObject({ outcome: 'sent', byDomainRule: false });
    if (result.outcome !== 'sent') return;
    const verified = verify('kummaline@riik.ee', result.code);
    expect(verified).toMatchObject({ ok: true, who: { existing: { kind: 'representative', id: 'r-odd' } } });
  });
});
