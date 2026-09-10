/**
 * The representatives import [R-02][D-10]: identity by (company, e-mail), one
 * active company per address, and no overlap with the buyer team.
 */

import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { partnerRepresentatives, partners, users } from '@/db/schema';
import { importPartnersFromRows } from './partners-import';
import {
  applyRepresentativesImport,
  importRepresentativesFromRows,
  previewRepresentativesImport,
  setRepresentativeActive,
} from './representatives-import';
import { createHarness, rawPartnerRow, seedLots, type TestHarness } from '../test-support';

let harness: TestHarness;

beforeEach(() => {
  harness = createHarness();
  seedLots(harness);
  // Two companies in the ranking, so representatives have somewhere to belong.
  harness.write((ctx) =>
    importPartnersFromRows(ctx, {
      fileName: 'partnerid.csv',
      fileSize: 1,
      source: 'seed',
      rawRows: [
        rawPartnerRow(),
        rawPartnerRow({ partner: 'AI Akadeemia OÜ', registrikood: '10000002', koht: '2', kontaktisik: 'Liis Mägi', e_post: 'liis.magi@ai-akadeemia-naidis.ee' }),
      ],
    }),
  );
});

afterEach(() => harness.close());

const rep = (over: Record<string, string> = {}) => ({
  registrikood: '10000001',
  esindaja: 'Jaan Kask',
  e_post: 'jaan.kask@tehisaru-naidis.ee',
  roll: 'esindaja',
  ...over,
});

const importRows = (rawRows: Array<Record<string, string>>, deactivateMissing = false) =>
  harness.write((ctx) =>
    importRepresentativesFromRows(ctx, {
      fileName: 'esindajad.csv',
      fileSize: 1,
      source: 'upload',
      rawRows,
      options: { deactivateMissing },
    }),
  );

const sourceOf = (email: string) =>
  harness.read(
    (db) =>
      db
        .select({ source: partnerRepresentatives.source })
        .from(partnerRepresentatives)
        .where(eq(partnerRepresentatives.email, email))
        .get()?.source,
  );

const activeFor = (regCode: string) =>
  harness.read((db) =>
    db
      .select({ name: partnerRepresentatives.name, email: partnerRepresentatives.email, role: partnerRepresentatives.role })
      .from(partnerRepresentatives)
      .innerJoin(partners, eq(partners.id, partnerRepresentatives.partnerId))
      .where(and(eq(partners.regCode, regCode), eq(partnerRepresentatives.isActive, true)))
      .all()
      .sort((a, b) => a.email.localeCompare(b.email)),
  );

describe('representatives import', () => {
  it('creates representatives for known companies', () => {
    const result = importRows([rep(), rep({ esindaja: 'Mari Mets', e_post: 'mari.mets@tehisaru-naidis.ee', roll: 'asendaja' })]);
    // Jaan Kask is already there: he is OSA-1's official contact, which the
    // ranking import turned into a sign-in [L-21]. Listing him here updates
    // that row and takes ownership of it; Mari Mets is new.
    expect(result.summary).toMatchObject({ total: 2, valid: 2, created: 1, updated: 1, withErrors: 0 });
    expect(activeFor('10000001')).toEqual([
      { name: 'Jaan Kask', email: 'jaan.kask@tehisaru-naidis.ee', role: 'esindaja' },
      { name: 'Mari Mets', email: 'mari.mets@tehisaru-naidis.ee', role: 'asendaja' },
    ]);
    expect(sourceOf('jaan.kask@tehisaru-naidis.ee')).toBe('upload');
  });

  it('leaves a lot’s official contact to the framework data [L-21]', () => {
    // Nobody listed Liis on this sheet: her row exists because she is the
    // official contact of OSA-1's second partner, and the ranking made that a
    // sign-in. It is the sync's row, not this sheet's.
    const contact = 'liis.magi@ai-akadeemia-naidis.ee';
    expect(sourceOf(contact)).toBe('framework');

    const id = harness.read((db) =>
      db
        .select({ id: partnerRepresentatives.id })
        .from(partnerRepresentatives)
        .where(eq(partnerRepresentatives.email, contact))
        .get(),
    )!.id;
    expect(() => harness.write((ctx) => setRepresentativeActive(ctx, id, false))).toThrow(
      /raamhanke andmetes/,
    );

    // Nor does listing somebody else for that company sweep her away, even
    // with "deactivate the missing" on — this sheet cannot speak for her.
    const preview = harness.write((ctx) =>
      previewRepresentativesImport(ctx, {
        fileName: 'x.csv',
        fileSize: 1,
        source: 'upload',
        rawRows: [
          rep({ registrikood: '10000002', esindaja: 'Kaia Kuusk', e_post: 'kaia.kuusk@ai-akadeemia-naidis.ee' }),
        ],
        options: { deactivateMissing: true },
      }),
    );
    expect(preview.wouldDeactivate).toEqual([]);
    harness.write((ctx) => applyRepresentativesImport(ctx, preview.batchId));
    expect(activeFor('10000002').map((r) => r.email)).toEqual([
      'kaia.kuusk@ai-akadeemia-naidis.ee',
      contact,
    ]);
  });

  it('re-importing updates by (company, e-mail) rather than duplicating', () => {
    importRows([rep()]);
    const second = importRows([rep({ esindaja: 'Jaan Kask-Tamm', roll: 'asendaja' })]);
    expect(second.summary).toMatchObject({ created: 0, updated: 1 });
    expect(activeFor('10000001')).toEqual([
      { name: 'Jaan Kask-Tamm', email: 'jaan.kask@tehisaru-naidis.ee', role: 'asendaja' },
    ]);
  });

  it('deactivates a listed company’s absent representatives only when asked, and only that company’s', () => {
    importRows([
      rep(),
      rep({ esindaja: 'Mari Mets', e_post: 'mari.mets@tehisaru-naidis.ee' }),
      rep({ registrikood: '10000002', esindaja: 'Liis Mägi', e_post: 'liis.magi@ai-akadeemia-naidis.ee' }),
    ]);
    // Without the option, absence changes nothing.
    importRows([rep()]);
    expect(activeFor('10000001')).toHaveLength(2);

    const preview = harness.write((ctx) =>
      previewRepresentativesImport(ctx, {
        fileName: 'x.csv',
        fileSize: 1,
        source: 'upload',
        rawRows: [rep()],
        options: { deactivateMissing: true },
      }),
    );
    expect(preview.wouldDeactivate).toEqual([
      { partnerName: 'Tehisaru Koolitus OÜ', name: 'Mari Mets', email: 'mari.mets@tehisaru-naidis.ee' },
    ]);
    harness.write((ctx) => applyRepresentativesImport(ctx, preview.batchId));
    expect(activeFor('10000001').map((r) => r.email)).toEqual(['jaan.kask@tehisaru-naidis.ee']);
    // The other company was not in the file, so it is untouched.
    expect(activeFor('10000002')).toHaveLength(1);
  });

  it('refuses an address that is active for another company', () => {
    importRows([rep()]);
    const preview = harness.write((ctx) =>
      previewRepresentativesImport(ctx, {
        fileName: 'x.csv',
        fileSize: 1,
        source: 'upload',
        rawRows: [rep({ registrikood: '10000002' })],
        options: { deactivateMissing: false },
      }),
    );
    expect(preview.summary.valid).toBe(0);
    expect(preview.rows[0]?.errors[0]?.message).toMatch(/juba aktiivne partneri Tehisaru Koolitus OÜ/);
  });

  it('refuses a buyer-team address', () => {
    harness.write((ctx) =>
      ctx.tx
        .insert(users)
        .values({ id: 'u1', name: 'Mari Tamm', email: 'mari.tamm@riik.ee', role: 'admin', isActive: true, createdAt: ctx.at })
        .run(),
    );
    const preview = harness.write((ctx) =>
      previewRepresentativesImport(ctx, {
        fileName: 'x.csv',
        fileSize: 1,
        source: 'upload',
        rawRows: [rep({ e_post: 'Mari.Tamm@riik.ee' })],
        options: { deactivateMissing: false },
      }),
    );
    expect(preview.summary.valid).toBe(0);
    expect(preview.rows[0]?.errors[0]?.message).toMatch(/tellimismeeskonna/);
  });

  it('a representative can be switched off and back on by hand', () => {
    importRows([rep()]);
    // By address: the company's rows now include the framework-owned contact,
    // which is deliberately not switchable here.
    const id = harness.read((db) =>
      db
        .select({ id: partnerRepresentatives.id })
        .from(partnerRepresentatives)
        .where(eq(partnerRepresentatives.email, 'jaan.kask@tehisaru-naidis.ee'))
        .get(),
    )!.id;
    harness.write((ctx) => setRepresentativeActive(ctx, id, false));
    expect(activeFor('10000001')).toHaveLength(0);
    harness.write((ctx) => setRepresentativeActive(ctx, id, true));
    expect(activeFor('10000001')).toHaveLength(1);
  });
});
