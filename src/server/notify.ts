/**
 * Notifications [D-01…D-07] and their e-mail deliveries [D-10].
 *
 * The in-app log is the primary channel and is written inside the mutation's
 * transaction: a notification is application state, and a partner must be able
 * to see what they were told even if mail was never configured.
 *
 * E-mail is a side effect. One `email_deliveries` row per recipient is created
 * in the same transaction as *queued*, and the actual sending happens on
 * `ctx.outbox` only **after** the transaction commits: a mail server being down
 * must never roll back a confirmation. Each delivery row then records what
 * happened to that one message — sent, failed (and retried), suppressed by the
 * test environment's allowlist, or skipped because there is no transport — so
 * the log can say, per person, whether a formal step reached them.
 */

import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { emailDeliveries, notifications, type NotificationType } from '@/db/schema';
import type { Ctx, Db, QueuedNotification } from './context';
import { sendMail, type MailMessage, type SendOutcome } from './mail';
import { frameworkRecipients } from './recipients';
import type { RenderedNotice } from '@/domain/round-templates';

export interface NotifyInput {
  recipientKind: 'buyer' | 'partner';
  /** null for the buyer team */
  recipientLotPartnerId?: string | null;
  type: NotificationType;
  roundId?: string | null;
  orderId?: string | null;
  notice: RenderedNotice;
  /** e-mail recipients; empty or absent keeps the notice in-app only */
  emailTo?: string | readonly string[];
}

/** Distinct, lowercased, plausible addresses, in a stable order. */
export function normalizeRecipients(input: string | readonly string[] | undefined): string[] {
  const list = typeof input === 'string' ? [input] : [...(input ?? [])];
  const seen = new Set<string>();
  for (const raw of list) {
    const address = raw.trim().toLowerCase();
    if (address.includes('@')) seen.add(address);
  }
  return [...seen].sort();
}

/**
 * Record a notification and queue its e-mails. Called inside the transaction.
 */
export function notify(ctx: Ctx, input: NotifyInput): void {
  const notificationId = crypto.randomUUID();

  ctx.tx
    .insert(notifications)
    .values({
      id: notificationId,
      createdAt: ctx.at,
      recipientKind: input.recipientKind,
      recipientLotPartnerId: input.recipientLotPartnerId ?? null,
      type: input.type,
      roundId: input.roundId ?? null,
      orderId: input.orderId ?? null,
      title: input.notice.title,
      body: input.notice.body,
      bodyHtml: input.notice.bodyHtml,
    })
    .run();

  const recipients = normalizeRecipients(input.emailTo);
  if (recipients.length === 0) return;

  const deliveries = recipients.map((to) => ({ deliveryId: crypto.randomUUID(), to }));
  ctx.tx
    .insert(emailDeliveries)
    .values(
      deliveries.map((d) => ({
        id: d.deliveryId,
        notificationId,
        to: d.to,
        status: 'queued' as const,
        createdAt: ctx.at,
      })),
    )
    .run();

  ctx.outbox.push({
    notificationId,
    type: input.type,
    title: input.notice.title,
    body: input.notice.body,
    bodyHtml: input.notice.bodyHtml,
    deliveries,
  });
}

/**
 * Send the queued e-mails. Runs after the transaction has committed, so a
 * failure is recorded but changes nothing that was decided.
 */
export async function dispatchOutbox(outbox: QueuedNotification[], database?: Db): Promise<void> {
  if (outbox.length === 0) return;
  // Read the framework's own addresses once for the whole burst [L-19]:
  // publishing one round is a notice per partner and a message per
  // representative, and this loop is sequential.
  const db = database ?? getDb();
  const known = frameworkRecipients(db);
  for (const message of outbox) {
    for (const delivery of message.deliveries) {
      await attemptDelivery(
        delivery.deliveryId,
        { to: delivery.to, subject: message.title, text: message.body, html: message.bodyHtml },
        database,
        known,
      );
    }
  }
}

/**
 * One attempt at one recipient, with the outcome written to its delivery row.
 *
 * `known` is the framework's own addresses [L-19]. Resolved here when a caller
 * has not already done it for a burst; omitting it entirely would suppress
 * every partner's mail, so it is never left to chance.
 */
export async function attemptDelivery(
  deliveryId: string,
  message: MailMessage,
  database?: Db,
  known?: readonly string[],
): Promise<SendOutcome> {
  const outcome = await sendMail(message, known ?? frameworkRecipients(database ?? getDb()));
  recordDeliveryOutcome(deliveryId, outcome, database);
  return outcome;
}

/**
 * Write back what happened to one e-mail.
 *
 * Runs after the mutation's transaction has committed, on its own connection.
 * Wall-clock time, not the virtual clock: this is real-world delivery
 * bookkeeping, not procurement state.
 */
function recordDeliveryOutcome(deliveryId: string, outcome: SendOutcome, database?: Db): void {
  const now = Date.now();
  try {
    (database ?? getDb())
      .update(emailDeliveries)
      .set({
        status: outcome.status,
        detail: outcome.detail.slice(0, 500),
        messageId: outcome.messageId,
        attempts: sql`${emailDeliveries.attempts} + 1`,
        lastAttemptAt: now,
        // Kept from an earlier success if a later manual re-send fails.
        ...(outcome.status === 'sent' ? { sentAt: now } : {}),
      })
      .where(eq(emailDeliveries.id, deliveryId))
      .run();
  } catch (error) {
    // Bookkeeping: never turn a failed status write into a failed request.
    console.error('[kaskaadhankija] e-kirja oleku salvestamine ebaõnnestus', error);
  }
}

/* ------------------------------------------------------------------ *
 * retries
 * ------------------------------------------------------------------ */

export const MAX_DELIVERY_ATTEMPTS = 3;

/** Wait before the next automatic attempt: 5 minutes, then 30. */
function backoffMs(attempts: number): number {
  if (attempts <= 1) return 5 * 60_000;
  if (attempts === 2) return 30 * 60_000;
  return Number.POSITIVE_INFINITY;
}

/** Whether a failed delivery is due for another automatic attempt. Pure. */
export function retryEligible(
  delivery: { status: string; attempts: number; lastAttemptAt: number | null },
  nowMs: number,
): boolean {
  if (delivery.status !== 'failed') return false;
  if (delivery.attempts >= MAX_DELIVERY_ATTEMPTS) return false;
  return (delivery.lastAttemptAt ?? 0) + backoffMs(delivery.attempts) <= nowMs;
}

/**
 * Retry failed deliveries that are due. Called from the jobs runner; the
 * selection is synchronous so a caller that closes the database right after
 * does not race it, and each attempt records its own outcome.
 */
export async function retryFailedDeliveries(database?: Db): Promise<number> {
  const db = database ?? getDb();
  const now = Date.now();
  const rows = db
    .select({
      id: emailDeliveries.id,
      to: emailDeliveries.to,
      status: emailDeliveries.status,
      attempts: emailDeliveries.attempts,
      lastAttemptAt: emailDeliveries.lastAttemptAt,
      title: notifications.title,
      body: notifications.body,
      bodyHtml: notifications.bodyHtml,
    })
    .from(emailDeliveries)
    .innerJoin(notifications, eq(notifications.id, emailDeliveries.notificationId))
    .where(and(eq(emailDeliveries.status, 'failed'), lt(emailDeliveries.attempts, MAX_DELIVERY_ATTEMPTS)))
    .all()
    .filter((row) => retryEligible(row, now));

  for (const row of rows) {
    await attemptDelivery(
      row.id,
      { to: row.to, subject: row.title, text: row.body, html: row.bodyHtml },
      db,
    );
  }
  return rows.length;
}

/** A deliberate re-send by the buyer, whatever the row's state. */
export async function resendDelivery(deliveryId: string, database?: Db): Promise<SendOutcome> {
  const db = database ?? getDb();
  const row = db
    .select({
      to: emailDeliveries.to,
      title: notifications.title,
      body: notifications.body,
      bodyHtml: notifications.bodyHtml,
    })
    .from(emailDeliveries)
    .innerJoin(notifications, eq(notifications.id, emailDeliveries.notificationId))
    .where(eq(emailDeliveries.id, deliveryId))
    .get();
  if (!row) throw new Error('Saadetist ei leitud.');
  return attemptDelivery(
    deliveryId,
    { to: row.to, subject: row.title, text: row.body, html: row.bodyHtml },
    db,
  );
}

/** Deliveries for a set of notifications, grouped by notification id. */
export function deliveriesFor(
  db: Db,
  notificationIds: readonly string[],
): Map<string, Array<typeof emailDeliveries.$inferSelect>> {
  const grouped = new Map<string, Array<typeof emailDeliveries.$inferSelect>>();
  if (notificationIds.length === 0) return grouped;
  const rows = db
    .select()
    .from(emailDeliveries)
    .where(inArray(emailDeliveries.notificationId, [...notificationIds]))
    .orderBy(emailDeliveries.to)
    .all();
  for (const row of rows) {
    const list = grouped.get(row.notificationId) ?? [];
    list.push(row);
    grouped.set(row.notificationId, list);
  }
  return grouped;
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
