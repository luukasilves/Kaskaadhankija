/**
 * The framework data [L-21]: the workbook, and the same edits made by hand.
 *
 * The first test is the one that matters most — the committed sample workbook,
 * read back through the reader an upload uses and applied through the writer an
 * upload uses. If that passes, the file a tester downloads, the file the seed
 * loads and the file an admin drops back are the same thing.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  frameworkSettings,
  lotPartners,
  lots,
  partnerRepresentatives,
  partners,
  rounds,
  users,
} from '@/db/schema';
import { lotSheetRow } from '@/domain/framework-definition';
import { LOT_SEED } from '@/db/lot-seed';
import {
  deactivateLot,
  frameworkIdentity,
  moveLotPartnerRank,
  syncFrameworkContacts,
  updateLotPartnerContact,
} from './framework';
import { importFrameworkFromSheets, previewFrameworkImport } from './import/framework-import';
import { setRepresentativeActive } from './import/representatives-import';
import { parseXlsxSheets } from './import/xlsx';
import { createHarness, rawPartnerRow, type TestHarness } from './test-support';

let harness: TestHarness;

beforeEach(() => {
  harness = createHarness();
});

afterEach(() => harness.close());

const lotByCode = (code: string) =>
  harness.read((db) => db.select().from(lots).where(eq(lots.code, code)).get());

const membershipsOf = (code: string) =>
  harness.read((db) =>
    db
      .select({
        partnerName: partners.name,
        rank: lotPartners.rank,
        contactEmail: lotPartners.contactEmail,
        isActive: lotPartners.isActive,
      })
      .from(lotPartners)
      .innerJoin(partners, eq(partners.id, lotPartners.partnerId))
      .innerJoin(lots, eq(lots.id, lotPartners.lotId))
      .where(eq(lots.code, code))
      .all()
      .sort((a, b) => a.rank - b.rank),
  );

const representatives = () =>
  harness.read((db) =>
    db
      .select({
        email: partnerRepresentatives.email,
        name: partnerRepresentatives.name,
        source: partnerRepresentatives.source,
        isActive: partnerRepresentatives.isActive,
      })
      .from(partnerRepresentatives)
      .all()
      .sort((a, b) => a.email.localeCompare(b.email)),
  );

const activeEmails = () => representatives().filter((r) => r.isActive).map((r) => r.email);

const importSheets = (
  sheets: Parameters<typeof importFrameworkFromSheets>[1]['sheets'],
  options = { deactivateMissing: false },
) =>
  harness.write((ctx) =>
    importFrameworkFromSheets(ctx, {
      fileName: 'raamhange.xlsx',
      fileSize: 1,
      source: 'upload',
      sheets,
      options,
    }),
  );

describe('[L-21] the committed sample workbook', () => {
  it('loads through the reader and writer an upload uses', async () => {
    const path = join(process.cwd(), 'seed', 'naidis-raamhange.xlsx');
    const sheets = await parseXlsxSheets(readFileSync(path));
    const named = (name: string) => sheets.get(name)?.rows;

    expect([...sheets.keys()]).toEqual([
      'Raamleping',
      'Hankeosad',
      'Partnerid',
      'Esindajad',
      'Selgitus',
    ]);

    const report = importSheets({
      raamleping: named('Raamleping'),
      hankeosad: named('Hankeosad'),
      partnerid: named('Partnerid')!,
      esindajad: named('Esindajad'),
    });

    expect(report.lots.created.sort()).toEqual(['OSA-1', 'OSA-2', 'OSA-3', 'OSA-4']);
    expect(report.summary.valid).toBe(17);
    expect(frameworkIdentity(harness.db)).toMatchObject({
      title: 'Eesti.ai koolitajate tellimine',
      procurementReference: '10567384',
      buyerName: 'Riigikantselei',
    });

    // OSA-2's deliberately low threshold and both cap kinds survived the trip.
    expect(lotByCode('OSA-2')).toMatchObject({ workloadThreshold: 4, defaultCapOptions: 'both' });

    // Every official contact can now sign in, and the deputies came along.
    const contacts = membershipsOf('OSA-1').map((m) => m.contactEmail);
    for (const email of contacts) expect(activeEmails()).toContain(email);
    expect(representatives().some((r) => r.source === 'framework')).toBe(true);
    expect(representatives().some((r) => r.source === 'upload')).toBe(true);
  });
});

describe('[L-21] the framework workbook', () => {
  const lotSheet = () => LOT_SEED.map(lotSheetRow);

  it('creates a lot and ranks a partner into it from one file', () => {
    const report = importSheets({
      hankeosad: [lotSheetRow({ ...LOT_SEED[0]!, code: 'OSA-9', name: 'Uus hankeosa' })],
      partnerid: [rawPartnerRow({ hankeosa: 'OSA-9', koht: '1' })],
    });
    expect(report.lots.created).toEqual(['OSA-9']);
    expect(membershipsOf('OSA-9')).toEqual([
      {
        partnerName: 'Tehisaru Koolitus OÜ',
        rank: 1,
        contactEmail: 'jaan.kask@tehisaru-naidis.ee',
        isActive: true,
      },
    ]);
  });

  it('refuses a lot nobody has heard of, and says what to do', () => {
    const preview = harness.write((ctx) =>
      previewFrameworkImport(ctx, {
        fileName: 'x.xlsx',
        fileSize: 1,
        source: 'upload',
        sheets: { partnerid: [rawPartnerRow({ hankeosa: 'OSA-9' })] },
        options: { deactivateMissing: false },
      }),
    );
    expect(preview.canApply).toBe(false);
    expect(preview.partners.fileErrors.some((e) => e.message.includes('Hankeosad'))).toBe(true);
  });

  it('leaves the identity alone when the file has no Raamleping sheet', () => {
    const before = frameworkIdentity(harness.db);
    importSheets({ hankeosad: lotSheet(), partnerid: [rawPartnerRow()] });
    expect(frameworkIdentity(harness.db)).toEqual(before);
  });

  it('updates the identity when it does, and audits the change', () => {
    importSheets({
      raamleping: [
        { väli: 'nimetus', väärtus: 'Teine raamleping' },
        { väli: 'viitenumber', väärtus: '99887766' },
        { väli: 'raamlepingu_number', väärtus: '5-1/24' },
        { väli: 'tellija', väärtus: 'Rahandusministeerium' },
        { väli: 'kehtib_kuni', väärtus: '31.12.2028' },
      ],
      hankeosad: lotSheet(),
      partnerid: [rawPartnerRow()],
    });
    expect(frameworkIdentity(harness.db)).toEqual({
      title: 'Teine raamleping',
      procurementReference: '99887766',
      agreementReference: '5-1/24',
      buyerName: 'Rahandusministeerium',
      validUntil: '2028-12-31',
    });
    expect(harness.read((db) => db.select().from(frameworkSettings).all())).toHaveLength(1);
  });

  it('treats a blank cell as “leave this as it is”', () => {
    importSheets({ hankeosad: lotSheet(), partnerid: [rawPartnerRow()] });
    const before = lotByCode('OSA-2')!;

    importSheets({
      hankeosad: [{ kood: 'OSA-2', nimetus: 'Uus nimi' }],
      partnerid: [rawPartnerRow({ hankeosa: 'OSA-2' })],
    });
    const after = lotByCode('OSA-2')!;
    expect(after.name).toBe('Uus nimi');
    expect(after.workloadThreshold).toBe(before.workloadThreshold);
    expect(after.defaultCapOptions).toBe(before.defaultCapOptions);
    expect(after.responseDeadlineWorkingDays).toBe(before.responseDeadlineWorkingDays);
  });

  it('writes nothing at all when one row is wrong', () => {
    importSheets({ hankeosad: lotSheet(), partnerid: [rawPartnerRow()] });
    const before = membershipsOf('OSA-1');

    expect(() =>
      importSheets({
        partnerid: [
          rawPartnerRow({ koht: '2' }),
          rawPartnerRow({ registrikood: 'kuus', partner: 'Vigane OÜ', koht: '3' }),
        ],
      }),
    ).toThrow(/ei õnnestu lugeda/);
    expect(membershipsOf('OSA-1')).toEqual(before);
  });

  it('refuses one address for two companies — it is a sign-in [L-21]', () => {
    const preview = harness.write((ctx) =>
      previewFrameworkImport(ctx, {
        fileName: 'x.xlsx',
        fileSize: 1,
        source: 'upload',
        sheets: {
          hankeosad: lotSheet(),
          partnerid: [
            rawPartnerRow(),
            rawPartnerRow({ registrikood: '10000002', partner: 'AI Akadeemia OÜ', koht: '2', e_post: 'jaan.kask@tehisaru-naidis.ee' }),
          ],
        },
        options: { deactivateMissing: false },
      }),
    );
    expect(preview.canApply).toBe(false);
    expect(preview.partners.rows[1]?.errors[0]?.message).toMatch(/üks aadress esindab ühte/);
  });

  it('refuses a contact who is on the buyer team', () => {
    harness.write((ctx) =>
      ctx.tx
        .insert(users)
        .values({
          id: 'u-1',
          name: 'Mari Tamm',
          email: 'mari.tamm@riik.ee',
          role: 'admin',
          isActive: true,
          createdAt: ctx.at,
        })
        .run(),
    );
    const preview = harness.write((ctx) =>
      previewFrameworkImport(ctx, {
        fileName: 'x.xlsx',
        fileSize: 1,
        source: 'upload',
        sheets: {
          hankeosad: lotSheet(),
          partnerid: [rawPartnerRow({ e_post: 'mari.tamm@riik.ee' })],
        },
        options: { deactivateMissing: false },
      }),
    );
    expect(preview.canApply).toBe(false);
    expect(preview.partners.rows[0]?.errors[0]?.message).toMatch(/tellimismeeskonna/);
  });

  it('keeps a lot the file leaves out, and says why when it cannot retire it', () => {
    importSheets({ hankeosad: lotSheet(), partnerid: [rawPartnerRow(), rawPartnerRow({ hankeosa: 'OSA-3' })] });
    const osa3 = lotByCode('OSA-3')!;
    harness.write((ctx) =>
      ctx.tx
        .insert(rounds)
        .values({
          id: 'r-1',
          code: 'VOOR-2026-001',
          lotId: osa3.id,
          status: 'draft',
          visibilityMode: 'dynamic',
          capOptions: 'trainings',
          createdAt: ctx.at,
          createdBy: 'test',
        })
        .run(),
    );

    const report = importSheets(
      {
        hankeosad: [lotSheetRow(LOT_SEED[0]!)],
        partnerid: [rawPartnerRow()],
      },
      { deactivateMissing: true },
    );
    expect(report.lots.kept.join()).toMatch(/OSA-3 \(VOOR-2026-001\)/);
    expect(lotByCode('OSA-3')?.isActive).toBe(true);
    // OSA-2 and OSA-4 have no rounds, so they do go.
    expect(report.lots.deactivated.sort()).toEqual(['OSA-2', 'OSA-4']);
  });
});

describe('[L-21] the official contact is the sign-in', () => {
  beforeEach(() => {
    importSheets({
      hankeosad: LOT_SEED.map(lotSheetRow),
      partnerid: [
        rawPartnerRow(),
        rawPartnerRow({ registrikood: '10000002', partner: 'AI Akadeemia OÜ', koht: '2' }),
      ],
    });
  });

  it('creates one login per contact', () => {
    expect(activeEmails()).toEqual(['jaan.kask@tehisaru-naidis.ee', 'kontakt.10000002@naidis.ee']);
    expect(representatives().every((r) => r.source === 'framework')).toBe(true);
  });

  it('leaves a row that predates the ownership column alone [migration path]', () => {
    // A volume carried over from v2.2 has every representative marked
    // `upload`, because that is what the migration defaults them to. The sync
    // must then neither duplicate the row nor take it over silently: the
    // address already works as a sign-in, and that is the fact that matters.
    harness.raw
      .prepare("UPDATE partner_representatives SET source = 'upload', name = 'Vana Nimi'")
      .run();

    const report = harness.write((ctx) => syncFrameworkContacts(ctx));

    expect(report.created).toEqual([]);
    expect(report.reactivated).toEqual([]);
    expect(report.renamed).toEqual([]);
    expect(report.deactivated).toEqual([]);
    // One row per address still, and the sign-in still works.
    expect(activeEmails()).toEqual(['jaan.kask@tehisaru-naidis.ee', 'kontakt.10000002@naidis.ee']);
    expect(representatives().filter((r) => r.email === 'jaan.kask@tehisaru-naidis.ee')).toHaveLength(1);
    expect(representatives().every((r) => r.source === 'upload')).toBe(true);
  });

  it('moves the login when the contact changes, and retires the old one', () => {
    const membership = harness.read((db) =>
      db
        .select({ id: lotPartners.id })
        .from(lotPartners)
        .innerJoin(partners, eq(partners.id, lotPartners.partnerId))
        .where(eq(partners.regCode, '10000001'))
        .get(),
    )!;
    harness.write((ctx) =>
      updateLotPartnerContact(ctx, membership.id, {
        contactName: 'Uus Kontakt',
        contactEmail: 'uus.kontakt@tehisaru-naidis.ee',
        unitPriceEur: 1500,
      }),
    );
    expect(activeEmails()).toContain('uus.kontakt@tehisaru-naidis.ee');
    expect(activeEmails()).not.toContain('jaan.kask@tehisaru-naidis.ee');
  });

  it('refuses a contact address that already represents somebody else', () => {
    const membership = harness.read((db) =>
      db
        .select({ id: lotPartners.id })
        .from(lotPartners)
        .innerJoin(partners, eq(partners.id, lotPartners.partnerId))
        .where(eq(partners.regCode, '10000001'))
        .get(),
    )!;
    expect(() =>
      harness.write((ctx) =>
        updateLotPartnerContact(ctx, membership.id, {
          contactName: 'Keegi',
          contactEmail: 'kontakt.10000002@naidis.ee',
          unitPriceEur: 0,
        }),
      ),
    ).toThrow(/juba aktiivne/);
  });

  it('never switches off a row it does not own, and never lets the screen switch off its own', () => {
    // An uploaded deputy is the representatives sheet's row: a sync leaves it.
    harness.write((ctx) =>
      ctx.tx
        .insert(partnerRepresentatives)
        .values({
          id: 'rep-upload',
          partnerId: harness.read((db) => db.select().from(partners).where(eq(partners.regCode, '10000001')).get())!.id,
          name: 'Mari Mets',
          email: 'mari.mets@tehisaru-naidis.ee',
          role: 'asendaja',
          source: 'upload',
          phone: '',
          isActive: true,
          createdAt: ctx.at,
          updatedAt: ctx.at,
        })
        .run(),
    );
    harness.write((ctx) => syncFrameworkContacts(ctx));
    expect(activeEmails()).toContain('mari.mets@tehisaru-naidis.ee');

    const framework = harness.read((db) =>
      db
        .select({ id: partnerRepresentatives.id })
        .from(partnerRepresentatives)
        .where(
          and(
            eq(partnerRepresentatives.email, 'jaan.kask@tehisaru-naidis.ee'),
            eq(partnerRepresentatives.source, 'framework'),
          ),
        )
        .get(),
    )!;
    expect(() => harness.write((ctx) => setRepresentativeActive(ctx, framework.id, false))).toThrow(
      /raamhanke andmetes/,
    );
  });

  it('reports an address it had to skip rather than failing the import', () => {
    const report = harness.write((ctx) => {
      // Both companies now claim one address, which the database cannot hold
      // twice; the import's own check would have caught it first.
      ctx.tx
        .update(lotPartners)
        .set({ contactEmail: 'jaan.kask@tehisaru-naidis.ee' })
        .where(eq(lotPartners.rank, 2))
        .run();
      return syncFrameworkContacts(ctx);
    });
    expect(report.skipped).toHaveLength(1);
    expect(report.skipped[0]?.reason).toMatch(/juba aktiivne/);
  });
});

describe('[E-08] moving a partner in the ranking', () => {
  beforeEach(() => {
    importSheets({
      hankeosad: LOT_SEED.map(lotSheetRow),
      partnerid: [
        rawPartnerRow({ koht: '1' }),
        rawPartnerRow({ registrikood: '10000002', partner: 'AI Akadeemia OÜ', koht: '2' }),
        rawPartnerRow({ registrikood: '10000003', partner: 'Kolmas OÜ', koht: '5' }),
      ],
    });
  });

  const idOf = (regCode: string) =>
    harness.read((db) =>
      db
        .select({ id: lotPartners.id })
        .from(lotPartners)
        .innerJoin(partners, eq(partners.id, lotPartners.partnerId))
        .where(eq(partners.regCode, regCode))
        .get(),
    )!.id;

  it('swaps with the nearest neighbour, gaps and all', () => {
    harness.write((ctx) => moveLotPartnerRank(ctx, idOf('10000003'), 'up'));
    expect(membershipsOf('OSA-1').map((m) => [m.partnerName, m.rank])).toEqual([
      ['Tehisaru Koolitus OÜ', 1],
      ['Kolmas OÜ', 2],
      ['AI Akadeemia OÜ', 5],
    ]);

    harness.write((ctx) => moveLotPartnerRank(ctx, idOf('10000003'), 'down'));
    expect(membershipsOf('OSA-1').map((m) => [m.partnerName, m.rank])).toEqual([
      ['Tehisaru Koolitus OÜ', 1],
      ['AI Akadeemia OÜ', 2],
      ['Kolmas OÜ', 5],
    ]);
  });

  it('refuses to move past either end', () => {
    expect(() => harness.write((ctx) => moveLotPartnerRank(ctx, idOf('10000001'), 'up'))).toThrow(
      /esimesel kohal/,
    );
    expect(() => harness.write((ctx) => moveLotPartnerRank(ctx, idOf('10000003'), 'down'))).toThrow(
      /viimasel kohal/,
    );
  });
});

describe('[L-21] retiring a lot', () => {
  it('is refused while a round still holds it', () => {
    importSheets({ hankeosad: LOT_SEED.map(lotSheetRow), partnerid: [rawPartnerRow()] });
    const lot = lotByCode('OSA-1')!;
    harness.write((ctx) =>
      ctx.tx
        .insert(rounds)
        .values({
          id: 'r-1',
          code: 'VOOR-2026-001',
          lotId: lot.id,
          status: 'open',
          visibilityMode: 'dynamic',
          capOptions: 'trainings',
          createdAt: ctx.at,
          createdBy: 'test',
        })
        .run(),
    );
    expect(() => harness.write((ctx) => deactivateLot(ctx, lot.id, 'katse'))).toThrow(
      /VOOR-2026-001/,
    );
    expect(lotByCode('OSA-1')?.isActive).toBe(true);
  });
});
