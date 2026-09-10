/**
 * The one place that talks to a mail server.
 *
 * Everything that leaves as e-mail — the formal notifications and, later, the
 * sign-in codes — goes through `sendMail`, and nothing else imports nodemailer.
 * Three properties follow:
 *
 *  - **The environment cannot mail strangers.** An address is sent to only if
 *    it is among the allowed recipients [L-19], and that set has two halves:
 *    the addresses **derived from the framework data** — every active
 *    representative and every active lot contact, which `frameworkRecipients`
 *    reads — plus whatever `EMAIL_ALLOWED_RECIPIENTS` names, which is for
 *    people the framework does *not* contain (the buyer's team, testers).
 *    Everything else is recorded as *suppressed* and never attempted. With
 *    both halves empty, the test environment sends nothing at all.
 *
 *    This module stays free of the database, so the derived half arrives as an
 *    argument. It defaults to none: a caller that forgets it gets the
 *    **stricter** gate, because a mail gate should fail safe.
 *  - **Switching providers is configuration.** A public relay now, the
 *    Riigikantselei server later: host, port, credentials and the From address,
 *    nothing in the code.
 *  - **Sign-in codes never touch the notification log**, because this function
 *    sits below `notify()` rather than inside it.
 */

import nodemailer, { type Transporter } from 'nodemailer';
import { env, isDemoMode, mailMode } from '@/lib/env';

export type DeliveryOutcomeStatus = 'sent' | 'failed' | 'suppressed' | 'skipped';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface SendOutcome {
  status: DeliveryOutcomeStatus;
  /** for the log: the server's response, the error, or the rule that stopped it */
  detail: string;
  messageId: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isEmailAddress(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

/** `EMAIL_ALLOWED_RECIPIENTS` as a list of addresses and `@domain` entries, lowercased. */
export function parseAllowlist(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(/[,;\s]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export type AllowlistVerdict = { allowed: true } | { allowed: false; reason: string };

/**
 * Whether an address may receive real mail. Pure, so the rule is testable
 * without a transport. `*` opens the list to everyone — an explicit choice.
 */
export function recipientAllowed(
  address: string,
  options: { demoMode: boolean; allowlist: readonly string[] },
): AllowlistVerdict {
  const addr = address.trim().toLowerCase();
  if (!EMAIL_RE.test(addr)) return { allowed: false, reason: 'Vigane e-posti aadress.' };

  const { demoMode, allowlist } = options;
  if (allowlist.includes('*')) return { allowed: true };
  if (allowlist.length === 0) {
    return demoMode
      ? {
          allowed: false,
          reason:
            'Lubatud saajaid ei ole: raamlepingu andmed on tühjad ja loend (EMAIL_ALLOWED_RECIPIENTS) samuti.',
        }
      : { allowed: true };
  }

  const domain = addr.slice(addr.lastIndexOf('@'));
  const listed = allowlist.some(
    (entry) => entry === addr || (entry.startsWith('@') && entry === domain),
  );
  if (listed) return { allowed: true };
  return {
    allowed: false,
    reason: `${demoMode ? 'Testkeskkond: ' : ''}saaja ei ole raamlepingu kontaktisik ega lubatud saajate loendis (EMAIL_ALLOWED_RECIPIENTS).`,
  };
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
      connectionTimeout: env.SMTP_TIMEOUT_MS,
      greetingTimeout: env.SMTP_TIMEOUT_MS,
      socketTimeout: env.SMTP_TIMEOUT_MS,
    });
  }
  return transporter;
}

/**
 * Send one message and say what happened. Never throws: the caller records the
 * outcome, and a mail problem must never become an application error.
 */
export async function sendMail(
  message: MailMessage,
  /**
   * The addresses the framework data knows, from `frameworkRecipients` [L-19].
   * Defaults to none so that a caller which forgets it gets the stricter gate —
   * a suppressed message is a visible delivery row, a leaked one is a letter to
   * a stranger.
   */
  known: readonly string[] = [],
): Promise<SendOutcome> {
  const mode = mailMode();
  if (mode === 'dev') {
    console.log(
      `\n--- e-kiri (ei saadetud, EMAIL_DEV_MODE) ---\nSaaja: ${message.to}\nTeema: ${message.subject}\n\n${message.text}\n---\n`,
    );
    return {
      status: 'skipped',
      detail: 'EMAIL_DEV_MODE: kiri kirjutati serveri logisse, mitte ei saadetud.',
      messageId: '',
    };
  }
  if (mode === 'off') {
    return { status: 'skipped', detail: 'SMTP ei ole seadistatud.', messageId: '' };
  }

  const verdict = recipientAllowed(message.to, {
    demoMode: isDemoMode,
    // The two halves as one list. Composing here rather than inside
    // `recipientAllowed` keeps that function pure, and gives the intended
    // semantics for free: with an unset secret the derived addresses are the
    // whole list, and the "empty list sends nothing" branch fires only when the
    // framework data is empty too.
    allowlist: [...parseAllowlist(env.EMAIL_ALLOWED_RECIPIENTS), ...known],
  });
  if (!verdict.allowed) return { status: 'suppressed', detail: verdict.reason, messageId: '' };

  try {
    const info = await getTransporter().sendMail({
      from: env.EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return {
      status: 'sent',
      detail: String(info.response ?? '').slice(0, 500),
      messageId: String(info.messageId ?? ''),
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`[kaskaadhankija] e-kirja saatmine ebaõnnestus (${message.to}): ${detail}`);
    return { status: 'failed', detail: detail.slice(0, 500), messageId: '' };
  }
}

/**
 * One sentence for the screens about where mail goes right now.
 *
 * `knownCount` is how many addresses the framework data contributes [L-19] —
 * the callers have a database handle and this module does not. It matters
 * because an unset `EMAIL_ALLOWED_RECIPIENTS` no longer means silence: with
 * partners loaded, their own contacts are the allowed recipients.
 */
export function describeMailMode(knownCount = 0): string {
  switch (mailMode()) {
    case 'smtp':
      return isDemoMode && knownCount === 0 && parseAllowlist(env.EMAIL_ALLOWED_RECIPIENTS).length === 0
        ? 'SMTP on seadistatud, aga lubatud saajaid ei ole ühtegi — raamlepingu andmed on tühjad ja loendit ei ole seadistatud, nii et e-kirju ei saadeta.'
        : 'SMTP on seadistatud: iga teade saadetakse ka e-postiga ja iga saaja kohta on kirjas, mis kirjaga juhtus.';
    case 'dev':
      return 'E-kirjad kirjutatakse serveri logisse (EMAIL_DEV_MODE), mitte ei saadeta.';
    default:
      return 'SMTP ei ole seadistatud, seega e-kirju ei saadetud — see logi on ainus kanal.';
  }
}
