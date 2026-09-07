/**
 * Who a partner's formal notices go to [D-10]: the uploaded representatives,
 * else the lot contact — and the buyer team's copies.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { partnerRepresentatives, users } from '@/db/schema';
import { partnerRecipients, teamRecipients } from './recipients';
import { createHarness, seedLotWithPartners, type LotFixture, type TestHarness } from './test-support';

let harness: TestHarness;
let fx: LotFixture;

beforeEach(() => {
  harness = createHarness();
  fx = seedLotWithPartners(harness, { partnerCount: 2, trainingCount: 1 });
});

afterEach(() => harness.close());

describe('[D-10] partnerRecipients', () => {
  it('falls back to the lot contact when the company has no representatives', () => {
    expect(harness.read((db) => partnerRecipients(db, fx.lotPartnerIds[0]!))).toEqual(['kontakt1@naidis.ee']);
  });

  it('returns every active representative of the company, and no inactive one', () => {
    harness.write((ctx) => {
      const base = { partnerId: fx.partnerIds[0]!, createdAt: ctx.at, updatedAt: ctx.at };
      ctx.tx
        .insert(partnerRepresentatives)
        .values([
          { id: 'r1', ...base, name: 'A', email: 'a@partner.ee', role: 'esindaja' },
          { id: 'r2', ...base, name: 'B', email: 'b@partner.ee', role: 'asendaja' },
          { id: 'r3', ...base, name: 'C', email: 'c@partner.ee', role: 'asendaja', isActive: false },
        ])
        .run();
    });
    expect(harness.read((db) => partnerRecipients(db, fx.lotPartnerIds[0]!)).sort()).toEqual(['a@partner.ee', 'b@partner.ee']);
    // The other company is unaffected.
    expect(harness.read((db) => partnerRecipients(db, fx.lotPartnerIds[1]!))).toEqual(['kontakt2@naidis.ee']);
  });
});

describe('teamRecipients', () => {
  it('is the active admins when no team mailbox is configured', () => {
    expect(harness.read((db) => teamRecipients(db))).toEqual([]);
    harness.write((ctx) =>
      ctx.tx
        .insert(users)
        .values([
          { id: 'u1', name: 'Admin', email: 'admin@riik.ee', role: 'admin', isActive: true, createdAt: ctx.at },
          { id: 'u2', name: 'Liige', email: 'liige@riik.ee', role: 'member', isActive: true, createdAt: ctx.at },
          { id: 'u3', name: 'Endine', email: 'endine@riik.ee', role: 'admin', isActive: false, createdAt: ctx.at },
        ])
        .run(),
    );
    expect(harness.read((db) => teamRecipients(db))).toEqual(['admin@riik.ee']);
  });
});
