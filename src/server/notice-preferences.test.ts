/**
 * The representative's own switch [L-27]: personal, audited, and refused to an
 * admin acting as the company.
 */

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { auditEvents, partnerRepresentatives } from '@/db/schema';
import { informationalMailOn, setInformationalMail } from './notice-preferences';
import { createHarness, seedLotWithPartners, type LotFixture, type TestHarness } from './test-support';

let harness: TestHarness;
let fx: LotFixture;

beforeEach(() => {
  harness = createHarness();
  fx = seedLotWithPartners(harness, { partnerCount: 2, trainingCount: 1 });
  harness.write((ctx) =>
    ctx.tx
      .insert(partnerRepresentatives)
      .values({
        id: 'rep-1',
        partnerId: fx.partnerIds[0]!,
        name: 'Jaan Kask',
        email: 'jaan.kask@tehisaru-naidis.ee',
        role: 'esindaja',
        createdAt: ctx.at,
        updatedAt: ctx.at,
      })
      .run(),
  );
});

afterEach(() => harness.close());

const jaan = () => ({ representativeId: 'rep-1', partnerId: fx.partnerIds[0]! });
const audits = () =>
  harness.read((db) =>
    db.select().from(auditEvents).where(eq(auditEvents.eventType, 'representative.preferences_changed')).all(),
  );

describe('[L-27] the informational-mail switch', () => {
  it('starts on, switches off and back on, and audits each change once', () => {
    expect(harness.read((db) => informationalMailOn(db, jaan()))).toBe(true);

    expect(harness.write((ctx) => setInformationalMail(ctx, jaan(), false))).toEqual({ changed: true });
    expect(harness.read((db) => informationalMailOn(db, jaan()))).toBe(false);
    expect(harness.write((ctx) => setInformationalMail(ctx, jaan(), false))).toEqual({ changed: false });
    expect(audits()).toHaveLength(1);
    expect(audits()[0]!.summary).toContain('välja lülitatud');

    expect(harness.write((ctx) => setInformationalMail(ctx, jaan(), true))).toEqual({ changed: true });
    expect(audits()).toHaveLength(2);
  });

  it('is personal: an admin acting as the company has no switch to flip', () => {
    expect(harness.read((db) => informationalMailOn(db, { representativeId: undefined, partnerId: fx.partnerIds[0]! }))).toBeNull();
    expect(() =>
      harness.write((ctx) => setInformationalMail(ctx, { representativeId: undefined, partnerId: fx.partnerIds[0]! }, false)),
    ).toThrow(/isiklik/);
  });

  it('refuses a representative row that belongs to another company', () => {
    expect(() =>
      harness.write((ctx) => setInformationalMail(ctx, { representativeId: 'rep-1', partnerId: fx.partnerIds[1]! }, false)),
    ).toThrow(/ei leitud/);
    expect(harness.read((db) => informationalMailOn(db, jaan()))).toBe(true);
  });
});
