/**
 * One-time sign-in codes and sessions [L-08].
 *
 * A person types their address; if it belongs to an active buyer user or an
 * active partner representative, a six-digit code goes to that address and
 * typing it back opens a session. Three properties the code below holds to:
 *
 *  - **Nothing here reveals whether an address is known.** The caller shows
 *    the same message either way; rate limits apply before the lookup.
 *  - **Only hashes are stored.** The code's HMAC (with AUTH_SECRET, since six
 *    digits are brute-forceable offline) and the session token's SHA-256.
 *  - **Wall-clock time throughout.** Expiry and rate limits are real-world
 *    security state; the virtual test clock has no business here.
 */

import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';
import { loginCodes, partnerRepresentatives, sessions, users, type SessionSubjectKind } from '@/db/schema';
import { env, isDemoMode } from '@/lib/env';
import type { Db, Tx } from '../context';

type Reader = Tx | Db;

export const CODE_TTL_MS = 10 * 60_000;
export const CODE_MAX_ATTEMPTS = 5;
export const SESSION_TTL_MS = 30 * 86_400_000;
/** how often a live session's last-seen mark is refreshed */
const TOUCH_INTERVAL_MS = 5 * 60_000;

export interface RateLimits {
  perEmail: { max: number; windowMs: number };
  perIp: { max: number; windowMs: number };
}

export const DEFAULT_LIMITS: RateLimits = {
  perEmail: { max: 3, windowMs: 15 * 60_000 },
  perIp: { max: 10, windowMs: 60 * 60_000 },
};

let fallbackSecret: string | null = null;

/**
 * The key that signs codes. Without AUTH_SECRET a per-process key is used, so
 * codes and sessions survive only until the next restart — fine for local
 * work, loud outside the test environment.
 */
export function authSecret(): string {
  if (env.AUTH_SECRET) return env.AUTH_SECRET;
  if (!fallbackSecret) {
    fallbackSecret = randomBytes(32).toString('hex');
    if (!isDemoMode) {
      console.warn(
        '[kaskaadhankija] AUTH_SECRET puudub: sisenemiskoodid ja sessioonid kehtivad ainult selle protsessi eluea.',
      );
    }
  }
  return fallbackSecret;
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Six digits, uniformly, from the CSPRNG. */
export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function hashCode(email: string, code: string, secret = authSecret()): string {
  return createHmac('sha256', secret).update(`${normalizeEmail(email)}\n${code}`).digest('hex');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

/* ------------------------------------------------------------------ *
 * who an address belongs to
 * ------------------------------------------------------------------ */

export type Subject =
  | { kind: 'buyer'; id: string; name: string; email: string }
  | { kind: 'representative'; id: string; name: string; email: string; partnerId: string };

/** An active buyer user first, else an active representative, else nobody. */
export function findSubjectByEmail(tx: Reader, rawEmail: string): Subject | null {
  const email = normalizeEmail(rawEmail);
  const user = tx
    .select()
    .from(users)
    .where(and(sql`lower(${users.email}) = ${email}`, eq(users.isActive, true)))
    .get();
  if (user) return { kind: 'buyer', id: user.id, name: user.name, email: user.email.toLowerCase() };

  const representative = tx
    .select()
    .from(partnerRepresentatives)
    .where(and(eq(partnerRepresentatives.email, email), eq(partnerRepresentatives.isActive, true)))
    .get();
  if (representative) {
    return {
      kind: 'representative',
      id: representative.id,
      name: representative.name,
      email: representative.email,
      partnerId: representative.partnerId,
    };
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * codes
 * ------------------------------------------------------------------ */

export type IssueResult =
  | { outcome: 'sent'; code: string; subject: Subject }
  | { outcome: 'unknown' }
  | { outcome: 'rate_limited'; limit: 'email' | 'ip' };

function countSince(tx: Reader, column: 'email' | 'ip', value: string, since: number): number {
  const where =
    column === 'email'
      ? and(eq(loginCodes.email, value), gt(loginCodes.createdAt, since))
      : and(eq(loginCodes.requestIp, value), gt(loginCodes.createdAt, since));
  return tx.select({ n: sql<number>`count(*)` }).from(loginCodes).where(where).get()?.n ?? 0;
}

/**
 * Issue a code for an address, or say why not. The caller sends the code and
 * shows the same neutral message whatever the outcome.
 */
export function issueLoginCode(
  tx: Reader,
  input: { email: string; ip: string; now?: number; limits?: RateLimits },
): IssueResult {
  const now = input.now ?? Date.now();
  const limits = input.limits ?? DEFAULT_LIMITS;
  const email = normalizeEmail(input.email);

  if (countSince(tx, 'email', email, now - limits.perEmail.windowMs) >= limits.perEmail.max) {
    return { outcome: 'rate_limited', limit: 'email' };
  }
  if (input.ip && countSince(tx, 'ip', input.ip, now - limits.perIp.windowMs) >= limits.perIp.max) {
    return { outcome: 'rate_limited', limit: 'ip' };
  }

  const subject = findSubjectByEmail(tx, email);
  if (!subject) return { outcome: 'unknown' };

  const code = generateCode();
  tx.insert(loginCodes)
    .values({
      id: crypto.randomUUID(),
      email,
      codeHash: hashCode(email, code),
      createdAt: now,
      expiresAt: now + CODE_TTL_MS,
      attempts: 0,
      requestIp: input.ip,
    })
    .run();
  return { outcome: 'sent', code, subject };
}

export type VerifyFailure = 'no_code' | 'expired' | 'wrong' | 'locked' | 'subject_gone';
export type VerifyResult = { ok: true; subject: Subject } | { ok: false; reason: VerifyFailure };

/**
 * Check a code against the latest unconsumed one for the address. A wrong
 * guess counts; the fifth burns the code, so the six digits cannot be walked.
 */
export function verifyLoginCode(
  tx: Reader,
  input: { email: string; code: string; now?: number },
): VerifyResult {
  const now = input.now ?? Date.now();
  const email = normalizeEmail(input.email);
  const code = input.code.replace(/\D/g, '');

  const row = tx
    .select()
    .from(loginCodes)
    .where(and(eq(loginCodes.email, email), isNull(loginCodes.consumedAt)))
    .orderBy(desc(loginCodes.createdAt), desc(loginCodes.id))
    .limit(1)
    .get();
  if (!row) return { ok: false, reason: 'no_code' };
  if (row.expiresAt < now) return { ok: false, reason: 'expired' };
  if (row.attempts >= CODE_MAX_ATTEMPTS) return { ok: false, reason: 'locked' };

  if (code.length !== 6 || !safeEqualHex(row.codeHash, hashCode(email, code))) {
    const attempts = row.attempts + 1;
    const locked = attempts >= CODE_MAX_ATTEMPTS;
    tx.update(loginCodes)
      .set({ attempts, consumedAt: locked ? now : null })
      .where(eq(loginCodes.id, row.id))
      .run();
    return { ok: false, reason: locked ? 'locked' : 'wrong' };
  }

  tx.update(loginCodes).set({ consumedAt: now, attempts: row.attempts + 1 }).where(eq(loginCodes.id, row.id)).run();

  // The address may have been deactivated between request and entry.
  const subject = findSubjectByEmail(tx, email);
  if (!subject) return { ok: false, reason: 'subject_gone' };
  return { ok: true, subject };
}

/* ------------------------------------------------------------------ *
 * sessions
 * ------------------------------------------------------------------ */

export interface ResolvedSession {
  id: string;
  subjectKind: SessionSubjectKind;
  subjectId: string;
  expiresAt: number;
}

export function createSession(
  tx: Reader,
  subject: Subject,
  evidence: { ip: string; ua: string },
  now = Date.now(),
): { token: string; sessionId: string; expiresAt: number } {
  const token = randomBytes(32).toString('base64url');
  const sessionId = crypto.randomUUID();
  const expiresAt = now + SESSION_TTL_MS;
  tx.insert(sessions)
    .values({
      id: sessionId,
      tokenHash: hashToken(token),
      subjectKind: subject.kind,
      subjectId: subject.id,
      createdAt: now,
      expiresAt,
      lastSeenAt: now,
      ip: evidence.ip.slice(0, 64),
      ua: evidence.ua.slice(0, 300),
    })
    .run();
  return { token, sessionId, expiresAt };
}

/** The live session behind a cookie token, refreshing its last-seen mark. */
export function resolveSession(tx: Reader, token: string, now = Date.now()): ResolvedSession | null {
  if (!token) return null;
  const row = tx
    .select()
    .from(sessions)
    .where(and(eq(sessions.tokenHash, hashToken(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)))
    .get();
  if (!row) return null;
  if (now - row.lastSeenAt > TOUCH_INTERVAL_MS) {
    tx.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, row.id)).run();
  }
  return { id: row.id, subjectKind: row.subjectKind, subjectId: row.subjectId, expiresAt: row.expiresAt };
}

export function revokeSession(tx: Reader, token: string, now = Date.now()): boolean {
  const result = tx
    .update(sessions)
    .set({ revokedAt: now })
    .where(and(eq(sessions.tokenHash, hashToken(token)), isNull(sessions.revokedAt)))
    .run();
  return result.changes > 0;
}

/** Housekeeping: codes a day past expiry, sessions a month past their end. */
export function purgeAuthRows(tx: Reader, now = Date.now()): { codes: number; sessions: number } {
  const codes = tx.delete(loginCodes).where(lt(loginCodes.expiresAt, now - 86_400_000)).run().changes;
  const ended = tx
    .delete(sessions)
    .where(
      or(
        lt(sessions.expiresAt, now - 30 * 86_400_000),
        and(sql`${sessions.revokedAt} is not null`, lt(sessions.revokedAt, now - 30 * 86_400_000)),
      ),
    )
    .run().changes;
  return { codes, sessions: ended };
}
