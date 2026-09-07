/**
 * Delivery bookkeeping [D-10]: one row per recipient, written with the notice,
 * updated after the transaction with what actually happened to the mail.
 *
 * Without SMTP configured (as here) every attempt records `skipped`, which is
 * exactly what the test deployment without a relay shows its users.
 */

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { emailDeliveries, notifications } from '@/db/schema';
import type { QueuedNotification } from './context';
import {
  MAX_DELIVERY_ATTEMPTS,
  dispatchOutbox,
  normalizeRecipients,
  notify,
  resendDelivery,
  retryEligible,
} from './notify';
import { createHarness, type TestHarness } from './test-support';

let harness: TestHarness;

beforeEach(() => {
  harness = createHarness();
});

afterEach(() => harness.close());

const notice = { title: 'Voor sulgus', body: 'Sisu.', bodyHtml: '<p>Sisu.</p>' };

function send(emailTo: string | string[] | undefined): QueuedNotification[] {
  let outbox: QueuedNotification[] = [];
  harness.write((ctx) => {
    notify(ctx, { recipientKind: 'buyer', type: 'buyer_round_closed', notice, emailTo });
    outbox = ctx.outbox;
  });
  return outbox;
}

const deliveryRows = () => harness.read((db) => db.select().from(emailDeliveries).all());

describe('[D-10] e-mail deliveries', () => {
  it('normalises recipients: trimmed, lowercased, distinct, plausible', () => {
    expect(normalizeRecipients([' A@x.ee', 'a@x.ee', 'b@x.ee', '', 'kontakt'])).toEqual([
      'a@x.ee',
      'b@x.ee',
    ]);
    expect(normalizeRecipients('Keegi@Riik.ee')).toEqual(['keegi@riik.ee']);
    expect(normalizeRecipients(undefined)).toEqual([]);
  });

  it('records one queued delivery per distinct recipient, inside the transaction', () => {
    const outbox = send(['A@x.ee', 'a@x.ee', 'b@x.ee']);
    const rows = deliveryRows();
    expect(rows.map((r) => [r.to, r.status, r.attempts])).toEqual([
      ['a@x.ee', 'queued', 0],
      ['b@x.ee', 'queued', 0],
    ]);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.deliveries.map((d) => d.to)).toEqual(['a@x.ee', 'b@x.ee']);
    // The delivery rows and the outbox agree on ids, so outcomes land on the right row.
    expect(new Set(outbox[0]?.deliveries.map((d) => d.deliveryId))).toEqual(new Set(rows.map((r) => r.id)));
  });

  it('keeps a notice in-app only when there is nobody to mail', () => {
    const outbox = send([]);
    expect(outbox).toHaveLength(0);
    expect(deliveryRows()).toHaveLength(0);
    expect(harness.read((db) => db.select().from(notifications).all())).toHaveLength(1);
  });

  it('dispatching without a transport records skipped, with the attempt counted', async () => {
    const outbox = send(['a@x.ee']);
    await dispatchOutbox(outbox, harness.db);
    const [row] = deliveryRows();
    expect(row?.status).toBe('skipped');
    expect(row?.attempts).toBe(1);
    expect(row?.lastAttemptAt).toBeTruthy();
    expect(row?.sentAt).toBeNull();
    expect(row?.detail).toMatch(/SMTP/);
  });

  it('a manual re-send is another attempt on the same row', async () => {
    const outbox = send(['a@x.ee']);
    await dispatchOutbox(outbox, harness.db);
    const id = deliveryRows()[0]!.id;
    await resendDelivery(id, harness.db);
    expect(harness.read((db) => db.select().from(emailDeliveries).where(eq(emailDeliveries.id, id)).get())?.attempts).toBe(2);
  });

  it('retries only failed rows, with backoff, and gives up after the limit', () => {
    const now = 10_000_000;
    const failed = (attempts: number, ago: number) => ({ status: 'failed', attempts, lastAttemptAt: now - ago });
    expect(retryEligible(failed(1, 4 * 60_000), now)).toBe(false);
    expect(retryEligible(failed(1, 5 * 60_000), now)).toBe(true);
    expect(retryEligible(failed(2, 29 * 60_000), now)).toBe(false);
    expect(retryEligible(failed(2, 30 * 60_000), now)).toBe(true);
    expect(retryEligible(failed(MAX_DELIVERY_ATTEMPTS, 10 * 3_600_000), now)).toBe(false);
    expect(retryEligible({ status: 'suppressed', attempts: 1, lastAttemptAt: 0 }, now)).toBe(false);
    expect(retryEligible({ status: 'skipped', attempts: 1, lastAttemptAt: 0 }, now)).toBe(false);
    expect(retryEligible({ status: 'sent', attempts: 1, lastAttemptAt: 0 }, now)).toBe(false);
  });
});
