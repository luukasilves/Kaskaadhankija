/**
 * The context every mutation carries.
 *
 * Engine and import functions take `(ctx, input)` rather than reaching for the
 * database, the clock or the current user themselves. Three benefits:
 *
 *  - one transaction, one `at` instant — every timestamp written by one action
 *    agrees, which matters because the virtual test clock can make two real
 *    milliseconds look identical;
 *  - the audit row is written through the same `tx`, so it commits or rolls
 *    back with the change it describes [D-08];
 *  - the functions are testable against an in-memory database with an injected
 *    clock, without any request plumbing.
 */

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '@/db/schema';

export type Db = BetterSQLite3Database<typeof schema>;

/** The transaction handle drizzle hands to a `db.transaction()` callback. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export type ActorKind = 'buyer' | 'partner' | 'system' | 'tester';

export interface ActorRef {
  kind: ActorKind;
  /** user id, lot_partner id, or null for the system */
  id: string | null;
  /** e.g. "Mari Tamm (Tellija)" or "Jaan Kask, Tehisaru Koolitus OÜ" */
  label: string;
}

/** [D-09] kept solely as procurement evidence for partner actions. */
export interface Evidence {
  ip: string;
  ua: string;
}

export const NO_EVIDENCE: Evidence = { ip: '', ua: '' };

export const SYSTEM_ACTOR: ActorRef = { kind: 'system', id: null, label: 'Süsteem' };

export const CASCADE_ACTOR: ActorRef = { kind: 'system', id: null, label: 'Kaskaad' };

export const DEADLINE_ACTOR: ActorRef = { kind: 'system', id: null, label: 'Tähtaja jälgija' };

export interface Ctx {
  tx: Tx;
  /** the instant this whole action happens at, from the virtual clock */
  at: number;
  actor: ActorRef;
  evidence: Evidence;
  /**
   * Notifications queued during the transaction and dispatched after it
   * commits — a failed email must never roll back a state change.
   */
  outbox: QueuedNotification[];
}

export interface QueuedNotification {
  recipientKind: 'buyer' | 'partner';
  recipientLotPartnerId: string | null;
  type: string;
  roundId: string | null;
  orderId: string | null;
  title: string;
  body: string;
  bodyHtml: string;
  emailTo: string;
}

/** A result type for guarded actions, so a rejection can still be audited. */
export type ActionResult<T = void> =
  | ({ ok: true } & (T extends void ? Record<string, never> : { value: T }))
  | { ok: false; reason: string; message: string };

export function failure(reason: string, message: string): { ok: false; reason: string; message: string } {
  return { ok: false, reason, message };
}
