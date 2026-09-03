/**
 * Notifications [D-01…D-07].
 *
 * The in-app log is the primary channel and is written inside the mutation's
 * transaction: a notification is application state, and a partner must be able
 * to see what they were told even if mail was never configured.
 *
 * Email is a side effect and is therefore queued on `ctx.outbox` and dispatched
 * only **after** the transaction commits. A mail server being down must never
 * roll back a confirmation.
 */

import nodemailer, { type Transporter } from 'nodemailer';
import { notifications, type NotificationType } from '@/db/schema';
import { env, hasSmtp } from '@/lib/env';
import type { Ctx, QueuedNotification } from './context';
import type { RenderedNotice } from '@/domain/round-templates';

export interface NotifyInput {
  recipientKind: 'buyer' | 'partner';
  /** null for the buyer team */
  recipientLotPartnerId?: string | null;
  type: NotificationType;
  roundId?: string | null;
  orderId?: string | null;
  notice: RenderedNotice;
  /** partner contact, or the team address; '' to keep it in-app only */
  emailTo?: string;
}

/**
 * Record a notification and queue its email. Called inside the transaction.
 */
export function notify(ctx: Ctx, input: NotifyInput): void {
  const emailTo = input.emailTo ?? '';

  ctx.tx
    .insert(notifications)
    .values({
      id: crypto.randomUUID(),
      createdAt: ctx.at,
      recipientKind: input.recipientKind,
      recipientLotPartnerId: input.recipientLotPartnerId ?? null,
      type: input.type,
      roundId: input.roundId ?? null,
      orderId: input.orderId ?? null,
      title: input.notice.title,
      body: input.notice.body,
      bodyHtml: input.notice.bodyHtml,
      emailTo,
      emailStatus: 'skipped',
    })
    .run();

  if (emailTo) {
    ctx.outbox.push({
      recipientKind: input.recipientKind,
      recipientLotPartnerId: input.recipientLotPartnerId ?? null,
      type: input.type,
      roundId: input.roundId ?? null,
      orderId: input.orderId ?? null,
      title: input.notice.title,
      body: input.notice.body,
      bodyHtml: input.notice.bodyHtml,
      emailTo,
    });
  }
}

/** The buyer team's address, when one is configured. */
export function teamEmail(): string {
  return env.TEAM_NOTIFICATIONS_EMAIL ?? '';
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!hasSmtp) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

/**
 * Send the queued emails. Runs after the transaction has committed, so a
 * failure is reported and logged but changes nothing that was decided.
 *
 * Without SMTP configured this is a no-op beyond a console line in dev: the
 * in-app log already holds every message, which is the intended channel for
 * the test deployment.
 */
export async function dispatchOutbox(outbox: QueuedNotification[]): Promise<void> {
  if (outbox.length === 0) return;

  const mail = getTransporter();

  for (const message of outbox) {
    if (!mail) {
      if (env.EMAIL_DEV_MODE) {
        console.log(
          `\n--- e-kiri (ei saadetud, EMAIL_DEV_MODE) ---\nSaaja: ${message.emailTo}\nTeema: ${message.title}\n\n${message.body}\n---\n`,
        );
      }
      continue;
    }
    try {
      await mail.sendMail({
        from: env.EMAIL_FROM,
        to: message.emailTo,
        subject: message.title,
        text: message.body,
        html: message.bodyHtml,
      });
    } catch (error) {
      // The in-app notification already exists; surface the failure loudly.
      console.error(
        `[kaskaadhankija] e-kirja saatmine ebaõnnestus (${message.emailTo}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

/**
 * Run a write and then dispatch whatever it queued.
 *
 * Every server action should use this rather than calling `db.transaction`
 * directly, so no code path can forget to flush the outbox.
 */
export async function withOutbox<T>(
  run: (outbox: QueuedNotification[]) => T,
): Promise<T> {
  const outbox: QueuedNotification[] = [];
  const result = run(outbox);
  await dispatchOutbox(outbox);
  return result;
}
