/**
 * Sign-in codes and sessions [L-08]: hashed at rest, rate-limited before the
 * lookup, five guesses then burned, one use, real-time expiry.
 */

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loginCodes, partnerRepresentatives, sessions, users } from '@/db/schema';
import {
  CODE_MAX_ATTEMPTS,
  CODE_TTL_MS,
  SESSION_TTL_MS,
  createSession,
  findSubjectByEmail,
  generateCode,
  hashCode,
  issueLoginCode,
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

afterEach(() => harness.close());

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
    expect(verify('JAAN@partner.ee', result.code)).toMatchObject({ ok: true, subject: { kind: 'representative', id: 'r-jaan' } });
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
  const subject = { kind: 'buyer' as const, id: 'u-mari', name: 'Mari Tamm', email: 'mari.tamm@riik.ee' };

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
