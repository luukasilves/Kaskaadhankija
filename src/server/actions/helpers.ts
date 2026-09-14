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
import { currentTimeMs } from '../clock';
import {
  actorRef,
  assertAdminActor,
  assertBuyerActor,
  requirePartner,
  requestEvidence,
  type BuyerActor,
  type PartnerActor,
} from '../auth/actor';
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

/**
 * Run a **procurement** mutation: rounds, the training calendar, the review,
 * the confirmation, the protocol, the orders.
 *
 * This is the purchaser's job, so both buyer roles pass [R-01]. Administering
 * the framework agreement's own data and the team is a different act and goes
 * through `adminWrite` below — which is the whole point of there being two
 * functions rather than one flag: every action says which kind it is by the one
 * it calls, and that is greppable.
 *
 * The guard lives here rather than in forty actions, and it throws rather than
 * redirecting, because each action turns a thrown error into a message on the
 * form.
 */
export async function buyerWrite<T>(
  fn: (ctx: Ctx) => T,
  revalidate: string[] = [],
): Promise<T> {
  return runBuyerWrite(await assertBuyerActor(), fn, revalidate);
}

/**
 * Run an **administration** mutation: the framework identity, the lots and
 * their cascade settings, a lot's ranking, the official contacts, the
 * representatives, the team [L-21][R-01].
 *
 * Admin only. A purchaser reads every one of these screens and changes none of
 * them.
 */
export async function adminWrite<T>(
  fn: (ctx: Ctx) => T,
  revalidate: string[] = [],
): Promise<T> {
  return runBuyerWrite(await assertAdminActor(), fn, revalidate);
}

async function runBuyerWrite<T>(
  actor: BuyerActor,
  fn: (ctx: Ctx) => T,
  revalidate: string[],
): Promise<T> {
  const evidence = await requestEvidence();
  const db = getDb();
  const outbox: QueuedNotification[] = [];

  const result = db.transaction(
    (tx) => fn({ tx, at: currentTimeMs(), actor: actorRef(actor), evidence, outbox }),
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
    (tx) => fn({ tx, at: currentTimeMs(), actor: actorRef(actor), evidence, outbox }, actor),
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
        at: currentTimeMs(),
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
