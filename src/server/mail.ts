/**
 * The one place that talks to a mail server.
 *
 * Everything that leaves as e-mail — the formal notifications and, later, the
 * sign-in codes — goes through `sendMail`, and nothing else imports nodemailer.
 * Three properties follow:
 *
 *  - **The test environment cannot mail strangers.** The seeded partners have
 *    fictional addresses, and the team's sheet will carry real ones. With
 *    `DEMO_MODE` on, an address is sent to only if `EMAIL_ALLOWED_RECIPIENTS`
 *    names it or its domain; everything else is recorded as *suppressed* and
 *    never attempted. An unset list in the test environment suppresses all mail.
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
            'Testkeskkond: lubatud saajate loend (EMAIL_ALLOWED_RECIPIENTS) on tühi, e-kirju ei saadeta.',
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
    reason: `${demoMode ? 'Testkeskkond: ' : ''}saaja ei ole lubatud saajate loendis (EMAIL_ALLOWED_RECIPIENTS).`,
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
export async function sendMail(message: MailMessage): Promise<SendOutcome> {
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
    allowlist: parseAllowlist(env.EMAIL_ALLOWED_RECIPIENTS),
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

/** One sentence for the screens about where mail goes right now. */
export function describeMailMode(): string {
  switch (mailMode()) {
    case 'smtp':
      return isDemoMode && parseAllowlist(env.EMAIL_ALLOWED_RECIPIENTS).length === 0
        ? 'SMTP on seadistatud, aga testkeskkonna lubatud saajate loend on tühi — e-kirju ei saadeta.'
        : 'SMTP on seadistatud: iga teade saadetakse ka e-postiga ja iga saaja kohta on kirjas, mis kirjaga juhtus.';
    case 'dev':
      return 'E-kirjad kirjutatakse serveri logisse (EMAIL_DEV_MODE), mitte ei saadeta.';
    default:
      return 'SMTP ei ole seadistatud, seega e-kirju ei saadetud — see logi on ainus kanal.';
  }
}
