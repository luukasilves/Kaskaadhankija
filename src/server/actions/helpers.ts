/**
 * Shared plumbing for server actions.
 *
 * Every mutation goes through one of these, so no action can forget the four
 * things that must always happen: authorize the actor, run inside one
 * immediate transaction, dispatch the notifications the transaction queued, and
 * revalidate what the change affects.
 */

import { revalidatePath } from 'next/cache';
import { getDb } from '@/db';
import { nowMs } from '../clock';
import { actorRef, requireBuyer, requirePartner, requestEvidence, type PartnerActor } from '../auth/actor';
import { NO_EVIDENCE, type Ctx, type QueuedNotification } from '../context';
import { dispatchOutbox } from '../notify';

/** What an action reports back to the page that called it. */
export interface ActionOutcome<T = undefined> {
  ok: boolean;
  message: string;
  value?: T;
}

export function ok<T>(message: string, value?: T): ActionOutcome<T> {
  return { ok: true, message, value };
}

export function fail(message: string): ActionOutcome<never> {
  return { ok: false, message };
}

/** Turn a thrown error into a message the buyer or partner can act on. */
export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Toiming ebaõnnestus.';
}

/** Run a buyer mutation. */
export async function buyerWrite<T>(
  fn: (ctx: Ctx) => T,
  revalidate: string[] = [],
): Promise<T> {
  const actor = await requireBuyer();
  const evidence = await requestEvidence();
  const db = getDb();
  const outbox: QueuedNotification[] = [];

  const result = db.transaction(
    (tx) => fn({ tx, at: nowMs(tx), actor: actorRef(actor), evidence, outbox }),
    { behavior: 'immediate' },
  );

  await dispatchOutbox(outbox);
  for (const path of revalidate) revalidatePath(path);
  return result;
}

/**
 * Run a partner mutation.
 *
 * The callback receives the resolved actor but never a lot_partner id from the
 * client: the engine derives the acting membership from `actor.partnerId`, so a
 * partner cannot answer for another company.
 */
export async function partnerWrite<T>(
  fn: (ctx: Ctx, actor: PartnerActor) => T,
  revalidate: string[] = [],
): Promise<T> {
  const actor = await requirePartner();
  const evidence = await requestEvidence();
  const db = getDb();
  const outbox: QueuedNotification[] = [];

  const result = db.transaction(
    (tx) => fn({ tx, at: nowMs(tx), actor: actorRef(actor), evidence, outbox }, actor),
    { behavior: 'immediate' },
  );

  await dispatchOutbox(outbox);
  for (const path of revalidate) revalidatePath(path);
  return result;
}

/** A system-actor write, for maintenance paths with no human behind them. */
export async function systemWrite<T>(fn: (ctx: Ctx) => T, revalidate: string[] = []): Promise<T> {
  const db = getDb();
  const outbox: QueuedNotification[] = [];
  const result = db.transaction(
    (tx) =>
      fn({
        tx,
        at: nowMs(tx),
        actor: { kind: 'system', id: null, label: 'Süsteem' },
        evidence: NO_EVIDENCE,
        outbox,
      }),
    { behavior: 'immediate' },
  );
  await dispatchOutbox(outbox);
  for (const path of revalidate) revalidatePath(path);
  return result;
}

/* form-field helpers, so actions stop repeating the same coercions */

export function fieldText(form: FormData, name: string): string {
  return String(form.get(name) ?? '').trim();
}

export function fieldNumber(form: FormData, name: string): number | null {
  const raw = fieldText(form, name);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function fieldList(form: FormData, name: string): string[] {
  return form.getAll(name).map((v) => String(v)).filter(Boolean);
}
