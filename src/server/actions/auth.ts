'use server';

/**
 * Sign-in by e-mail code [L-08].
 *
 * Plain form posts, so the flow works without JavaScript: request a code for
 * an address, type the code, get a session cookie. The response to a request
 * is the same whether or not the address is known — the only difference is
 * whether a mail goes out — and the code itself goes through the mail
 * transport directly, never through the notification log.
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb } from '@/db';
import { renderLoginCode } from '@/domain/auth-templates';
import { isDemoMode } from '@/lib/env';
import { logAudit } from '../audit';
import {
  CODE_TTL_MS,
  createSession,
  issueLoginCode,
  normalizeEmail,
  revokeSession,
  verifyLoginCode,
  type Subject,
} from '../auth/codes';
import { addTeamMember } from '../team';
import { PERSONA_COOKIE, SESSION_COOKIE, requestEvidence } from '../auth/actor';
import { nowMs } from '../clock';
import { NO_EVIDENCE, type ActorRef, type Ctx, type Evidence, type Tx } from '../context';
import { isEmailAddress, sendMail } from '../mail';
import { fieldText } from './helpers';

const THIRTY_DAYS = 60 * 60 * 24 * 30;
const SIGN_IN_ACTOR: ActorRef = { kind: 'system', id: null, label: 'Sisselogimine' };

function auditCtx(tx: Tx, evidence: Evidence, actor: ActorRef = SIGN_IN_ACTOR): Ctx {
  return { tx, at: nowMs(tx), actor, evidence, outbox: [] };
}

function subjectRef(subject: Subject): ActorRef {
  return {
    kind: subject.kind === 'buyer' ? 'buyer' : 'partner',
    id: subject.kind === 'buyer' ? subject.id : subject.partnerId,
    label: subject.name,
  };
}

function homeFor(subject: Subject): string {
  return subject.kind === 'buyer' ? '/tellija' : '/partner/voorud';
}

export async function requestLoginCodeAction(form: FormData): Promise<void> {
  const email = normalizeEmail(fieldText(form, 'email'));
  if (!isEmailAddress(email)) redirect('/sisene?viga=aadress');

  const evidence = await requestEvidence();
  const result = getDb().transaction(
    (tx) => {
      const issued = issueLoginCode(tx, { email, ip: evidence.ip });
      const ctx = auditCtx(tx, evidence);
      if (issued.outcome === 'sent') {
        logAudit(ctx, {
          eventType: 'login.code_requested',
          summary: `Sisenemiskood saadetud aadressile ${email}${issued.byDomainRule ? ' (tellija domeeni reegli alusel)' : ''}`,
          after: { email, subjectKind: issued.subjectKind, byDomainRule: issued.byDomainRule },
        });
      } else if (issued.outcome === 'rate_limited') {
        logAudit(ctx, {
          eventType: 'login.rate_limited',
          summary: `Sisenemiskoodi päring aadressile ${email} jäeti saatmata: liiga palju päringuid (${issued.limit === 'ip' ? 'IP' : 'aadress'})`,
          after: { email, limit: issued.limit },
        });
      }
      // An unknown address leaves no trace: nothing to learn from the log either.
      return issued;
    },
    { behavior: 'immediate' },
  );

  if (result.outcome === 'sent') {
    const notice = renderLoginCode({
      name: result.recipientName,
      code: result.code,
      minutes: CODE_TTL_MS / 60_000,
    });
    // Not awaited: the response must take the same time for every address.
    // The outcome is still worth a line, because the page deliberately cannot
    // say whether an address is known — so a code the transport refused (an
    // allowlist that does not cover this domain, no SMTP at all) would
    // otherwise fail completely invisibly.
    void sendMail({ to: email, subject: notice.title, text: notice.body, html: notice.bodyHtml }).then(
      (outcome) => {
        if (outcome.status !== 'sent') {
          console.warn(
            `[kaskaadhankija] sisenemiskoodi ei toimetatud kohale (${email}): ${outcome.status} — ${outcome.detail}`,
          );
        }
      },
    );
  }

  redirect(`/sisene/kood?e=${encodeURIComponent(email)}`);
}

export async function verifyLoginCodeAction(form: FormData): Promise<void> {
  const email = normalizeEmail(fieldText(form, 'email'));
  const code = fieldText(form, 'code');
  if (!isEmailAddress(email)) redirect('/sisene?viga=aadress');

  const evidence = await requestEvidence();
  const result = getDb().transaction(
    (tx) => {
      const verified = verifyLoginCode(tx, { email, code });
      if (verified.ok) {
        let subject: Subject;
        if (verified.who.existing) {
          subject = verified.who.existing;
        } else {
          // The domain rule admitted an address nobody had listed, and the code
          // proved the mailbox. Create the user through the same function the
          // Meeskond screen uses, so its checks and its audit entry apply.
          const { email: newEmail, name } = verified.who.toProvision;
          try {
            const userId = addTeamMember(auditCtx(tx, evidence), {
              name,
              email: newEmail,
              role: 'admin',
              note: 'lisatud sisselogimisel tellija domeeni reegli alusel',
            });
            subject = { kind: 'buyer', id: userId, name, email: newEmail };
          } catch (error) {
            logAudit(auditCtx(tx, evidence), {
              eventType: 'login.failed',
              summary: `Sisselogimine aadressiga ${email} ebaõnnestus: kasutaja loomine domeeni reegli alusel ei õnnestunud`,
              after: { email, error: error instanceof Error ? error.message : String(error) },
            });
            return { ok: false as const, reason: 'subject_gone' as const };
          }
        }

        const session = createSession(tx, subject, evidence);
        logAudit(auditCtx(tx, evidence, subjectRef(subject)), {
          eventType: 'login.succeeded',
          summary: `${subject.name} (${email}) logis sisse`,
          after: { email, subjectKind: subject.kind, sessionId: session.sessionId },
        });
        return { ok: true as const, token: session.token, subject };
      }
      logAudit(auditCtx(tx, evidence), {
        eventType: verified.reason === 'locked' ? 'login.locked' : 'login.failed',
        summary:
          verified.reason === 'locked'
            ? `Sisenemiskood aadressile ${email} lukustati: liiga palju valesid katseid`
            : `Sisselogimine aadressiga ${email} ebaõnnestus (${verified.reason})`,
        after: { email, reason: verified.reason },
      });
      return { ok: false as const, reason: verified.reason };
    },
    { behavior: 'immediate' },
  );

  if (!result.ok) {
    redirect(`/sisene/kood?e=${encodeURIComponent(email)}&viga=${result.reason}`);
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, result.token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: THIRTY_DAYS,
    secure: process.env.NODE_ENV === 'production',
  });
  // A signed-in person is one identity; a leftover persona would only confuse.
  store.delete(PERSONA_COOKIE);
  redirect(homeFor(result.subject));
}

/** Revoke the session behind the cookie and drop the cookie. No redirect. */
export async function endSession(): Promise<boolean> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  const evidence = await requestEvidence().catch(() => NO_EVIDENCE);
  getDb().transaction(
    (tx) => {
      if (revokeSession(tx, token)) {
        logAudit(auditCtx(tx, evidence), { eventType: 'login.signed_out', summary: 'Sessioon lõpetatud (välja logimine)' });
      }
    },
    { behavior: 'immediate' },
  );
  store.delete(SESSION_COOKIE);
  return true;
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect(isDemoMode ? '/' : '/sisene');
}
