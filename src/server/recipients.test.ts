/**
 * Who a partner's formal notices go to [D-10]: the uploaded representatives,
 * else the lot contact — and the buyer team's copies.
 *
 * Plus who the environment is allowed to mail at all [L-19]. The buyer used to
 * have to type every bidder's domain into a secret, and because that step was
 * easy to forget, a real framework partner received neither a round notice nor
 * a sign-in code. `frameworkRecipients` takes the list the buyer already
 * maintains instead — and its load-bearing test is that it is never narrower
 * than the sign-in gate, or the environment issues codes it cannot deliver.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { lotPartners, partnerRepresentatives, partners, users } from '@/db/schema';
import { findSubjectByEmail } from './auth/codes';
import { frameworkRecipients, partnerRecipients, teamRecipients } from './recipients';
import { createHarness, seedLotWithPartners, type LotFixture, type TestHarness } from './test-support';

let harness: TestHarness;
let fx: LotFixture;

beforeEach(() => {
  harness = createHarness();
  fx = seedLotWithPartners(harness, { partnerCount: 3, trainingCount: 1 });
});

afterEach(() => harness.close());

const derived = () => harness.read((db) => frameworkRecipients(db)).sort();

const addRepresentative = (
  partnerIndex: number,
  email: string,
  over: { isActive?: boolean } = {},
) =>
  harness.write((ctx) => {
    const id = crypto.randomUUID();
    ctx.tx
      .insert(partnerRepresentatives)
      .values({
        id,
        partnerId: fx.partnerIds[partnerIndex]!,
        name: 'Esindaja',
        email,
        role: 'esindaja',
        isActive: over.isActive ?? true,
        createdAt: ctx.at,
        updatedAt: ctx.at,
      })
      .run();
    return id;
  });

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

describe('[L-19] the addresses the framework data knows', () => {
  it('is every active lot contact, before any representative exists', () => {
    // The state a fresh framework upload leaves: contacts, no representatives.
    expect(derived()).toEqual(['kontakt1@naidis.ee', 'kontakt2@naidis.ee', 'kontakt3@naidis.ee']);
  });

  it('adds active representatives', () => {
    addRepresentative(0, 'jaan@partner.ee');
    expect(derived()).toContain('jaan@partner.ee');
  });

  it('lowercases and de-duplicates, so the gate can compare exactly', () => {
    addRepresentative(1, 'kontakt2@naidis.ee'); // the same address as the lot contact
    addRepresentative(2, 'SUUR@Partner.EE');
    const all = derived();
    expect(all.filter((e) => e === 'kontakt2@naidis.ee')).toHaveLength(1);
    expect(all).toContain('suur@partner.ee');
  });

  it('drops a representative the buyer switched off', () => {
    addRepresentative(0, 'endine@partner.ee', { isActive: false });
    expect(derived()).not.toContain('endine@partner.ee');
  });

  it('drops the contact of a deactivated lot membership', () => {
    harness.write((ctx) =>
      ctx.tx
        .update(lotPartners)
        .set({ isActive: false, deactivatedAt: ctx.at })
        .where(eq(lotPartners.id, fx.lotPartnerIds[0]!))
        .run(),
    );
    expect(derived()).not.toContain('kontakt1@naidis.ee');
    expect(derived()).toContain('kontakt2@naidis.ee');
  });

  it('reads no frozen evidence — a removed partner does not come back', () => {
    // The round snapshots and confirmations keep a contact address as evidence
    // [D-09]. Deriving from those would let a partner the buyer has removed go
    // on receiving mail, so the whole framework being emptied must empty this.
    harness.write((ctx) => {
      ctx.tx.update(lotPartners).set({ isActive: false, deactivatedAt: ctx.at }).run();
      ctx.tx.update(partnerRepresentatives).set({ isActive: false, deactivatedAt: ctx.at }).run();
    });
    expect(derived()).toEqual([]);
  });

  it('is never narrower than the sign-in gate [L-08]', () => {
    // The one that matters. `findSubjectByEmail` treats a representative as
    // known on their own `isActive` flag and does **not** look at whether their
    // company is still active — so a representative of a deactivated company
    // can still request a code. If this set joined `partners.isActive` (as the
    // neighbouring framework code does, for other reasons), that person would
    // be issued a code the environment then refused to deliver.
    addRepresentative(0, 'jaan@partner.ee');
    addRepresentative(1, 'kadri@teine.ee');
    harness.write((ctx) =>
      ctx.tx
        .update(partners)
        .set({ isActive: false })
        .where(eq(partners.id, fx.partnerIds[0]!))
        .run(),
    );

    const known = derived();
    for (const email of ['jaan@partner.ee', 'kadri@teine.ee']) {
      const subject = harness.read((db) => findSubjectByEmail(db, email));
      expect(subject, `${email} should still be a sign-in subject`).not.toBeNull();
      expect(known, `${email} can sign in, so it must be allowed to receive mail`).toContain(email);
    }
  });
});

describe('[L-19] every path that sends mail resolves the derived set', () => {
  // `sendMail`'s `known` parameter defaults to none, so a forgotten call site
  // fails *safe* — it suppresses a partner's mail rather than leaking it. Safe,
  // but invisible: there would be no error, only a delivery row nobody reads.
  // So the two callers are pinned here.
  it.each([
    ['src/server/notify.ts', 'notifications, incl. the retry and the manual re-send'],
    ['src/server/actions/auth.ts', 'sign-in codes'],
  ])('%s resolves frameworkRecipients', (file) => {
    expect(readFileSync(join(process.cwd(), file), 'utf8')).toContain('frameworkRecipients');
  });

  it('has exactly the two callers this test knows about', () => {
    // A third caller would need pinning too, and this is how it gets noticed.
    const callers = ['src/server/notify.ts', 'src/server/actions/auth.ts'];
    for (const file of ['src/server/rounds/engine.ts', 'src/server/rounds/jobs.ts']) {
      expect(readFileSync(join(process.cwd(), file), 'utf8'), file).not.toContain('sendMail(');
    }
    for (const file of callers) {
      expect(readFileSync(join(process.cwd(), file), 'utf8'), file).toContain('sendMail(');
    }
  });
});
