/**
 * Integration tests for the import paths, against the real schema.
 *
 * These cover the user-facing promise that the koolituskalender can be uploaded
 * as a table or loaded from the database, and the invariants that make a
 * re-import safe: identity by code [E-09], frozen round contents [V-04], and
 * open rounds untouched by a ranking change [V-07].
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { lotPartners, lots, partners, roundParticipants, rounds, trainings } from '@/db/schema';
import { parseCsv } from './csv';
import { parseXlsx } from './xlsx';
import {
  applyTrainingsImport,
  discardImport,
  importTrainingsFromRows,
  nextTrainingCode,
  previewTrainingsImport,
} from './trainings-import';
import { applyPartnersImport, importPartnersFromRows, previewPartnersImport } from './partners-import';
import {
  createHarness,
  rawPartnerRow,
  rawTrainingRow,
  seedLots,
  type TestHarness,
} from '../test-support';

let harness: TestHarness;

beforeEach(() => {
  harness = createHarness();
  seedLots(harness);
});

afterEach(() => {
  harness.close();
});

const importRows = (rawRows: Array<Record<string, string>>, source: 'upload' | 'seed' | 'sample' = 'upload') =>
  harness.write((ctx) =>
    importTrainingsFromRows(ctx, { fileName: 'test.csv', fileSize: 100, source, rawRows }),
  );

const countTrainings = () =>
  harness.read((db) => db.select().from(trainings).all().length);

describe('trainings import — upload path', () => {
  it('creates trainings from valid rows', () => {
    const result = importRows([
      rawTrainingRow({ kood: 'KK-2026-101' }),
      rawTrainingRow({ kood: 'KK-2026-102', hankeosa: 'OSA-2' }),
    ]);
    expect(result.summary).toMatchObject({ total: 2, valid: 2, created: 2, updated: 0, locked: 0 });
    expect(countTrainings()).toBe(2);

    const row = harness.read((db) =>
      db.select().from(trainings).where(eq(trainings.code, 'KK-2026-101')).get(),
    );
    expect(row).toMatchObject({
      status: 'unassigned',
      workshopType: 'tootuba_1',
      eventDate: '2026-10-12',
      county: 'Harju maakond',
      targetGroup: 'kov',
      participantCount: 20,
      language: 'et',
      estimatedValueEur: 1450,
    });
  });

  it('skips invalid rows and imports the rest', () => {
    const result = importRows([
      rawTrainingRow({ kood: 'KK-2026-101' }),
      rawTrainingRow({ kood: 'KK-2026-102', maakond: 'Stockholmi maakond' }),
      rawTrainingRow({ kood: 'KK-2026-103' }),
    ]);
    expect(result.summary).toMatchObject({ total: 3, valid: 2, created: 2, withErrors: 1 });
    expect(countTrainings()).toBe(2);
    expect(result.rows.find((r) => r.rowNumber === 3)?.action).toBe('error');
  });

  it('is idempotent — a second import updates in place, never duplicates [E-09]', () => {
    importRows([rawTrainingRow({ kood: 'KK-2026-101' })]);
    const first = harness.read((db) =>
      db.select().from(trainings).where(eq(trainings.code, 'KK-2026-101')).get(),
    );

    const second = importRows([
      rawTrainingRow({ kood: 'KK-2026-101', nimetus: 'Muudetud nimetus', osalejate_arv: '30' }),
    ]);
    expect(second.summary).toMatchObject({ created: 0, updated: 1 });
    expect(countTrainings()).toBe(1);

    const after = harness.read((db) =>
      db.select().from(trainings).where(eq(trainings.code, 'KK-2026-101')).get(),
    );
    // Same row — the identity is preserved, only the fields moved.
    expect(after?.id).toBe(first?.id);
    expect(after?.title).toBe('Muudetud nimetus');
    expect(after?.participantCount).toBe(30);
  });

  it('refuses to overwrite a training that is already in a round [V-04]', () => {
    importRows([rawTrainingRow({ kood: 'KK-2026-101' })]);
    harness.write((ctx) => {
      ctx.tx
        .update(trainings)
        .set({ status: 'in_round' })
        .where(eq(trainings.code, 'KK-2026-101'))
        .run();
    });

    const result = importRows([
      rawTrainingRow({ kood: 'KK-2026-101', nimetus: 'Ei tohi muutuda' }),
    ]);
    expect(result.summary).toMatchObject({ created: 0, updated: 0, locked: 1 });

    const after = harness.read((db) =>
      db.select().from(trainings).where(eq(trainings.code, 'KK-2026-101')).get(),
    );
    expect(after?.title).toBe('Töötuba 1 näidisrühmale');
    expect(result.rows[0].note).toContain('juba voorus');
  });

  it('does allow overwriting a leftover training', () => {
    importRows([rawTrainingRow({ kood: 'KK-2026-101' })]);
    harness.write((ctx) => {
      ctx.tx
        .update(trainings)
        .set({ status: 'leftover' })
        .where(eq(trainings.code, 'KK-2026-101'))
        .run();
    });
    const result = importRows([rawTrainingRow({ kood: 'KK-2026-101', nimetus: 'Uus katse' })]);
    expect(result.summary).toMatchObject({ updated: 1, locked: 0 });
  });

  it('rejects a row whose lot disappeared between preview and apply', () => {
    const batchId = harness.write(
      (ctx) =>
        previewTrainingsImport(ctx, {
          fileName: 'test.csv',
          fileSize: 10,
          source: 'upload',
          rawRows: [rawTrainingRow({ hankeosa: 'OSA-4' })],
        }).batchId,
    );
    harness.write((ctx) => {
      ctx.tx.delete(lots).where(eq(lots.code, 'OSA-4')).run();
    });
    const applied = harness.write((ctx) => applyTrainingsImport(ctx, batchId));
    expect(applied.summary.created).toBe(0);
    expect(applied.rows[0].note).toContain('ei ole enam olemas');
  });

  it('marks lock state in the preview, before anything is written', () => {
    importRows([rawTrainingRow({ kood: 'KK-2026-101' })]);
    harness.write((ctx) => {
      ctx.tx
        .update(trainings)
        .set({ status: 'allocated' })
        .where(eq(trainings.code, 'KK-2026-101'))
        .run();
    });

    const preview = harness.write((ctx) =>
      previewTrainingsImport(ctx, {
        fileName: 'test.csv',
        fileSize: 10,
        source: 'upload',
        rawRows: [rawTrainingRow({ kood: 'KK-2026-101' }), rawTrainingRow({ kood: 'KK-2026-999' })],
      }),
    );
    expect(preview.summary).toMatchObject({ created: 1, updated: 0, locked: 1 });
    expect(preview.rows[0].note).toContain('juba voorus või määratud');
  });

  it('refuses to apply the same batch twice', () => {
    const preview = harness.write((ctx) =>
      previewTrainingsImport(ctx, {
        fileName: 'test.csv',
        fileSize: 10,
        source: 'upload',
        rawRows: [rawTrainingRow()],
      }),
    );
    harness.write((ctx) => applyTrainingsImport(ctx, preview.batchId));
    expect(() => harness.write((ctx) => applyTrainingsImport(ctx, preview.batchId))).toThrow(
      /juba tehtud/,
    );
  });

  it('refuses to apply a discarded batch', () => {
    const preview = harness.write((ctx) =>
      previewTrainingsImport(ctx, {
        fileName: 'test.csv',
        fileSize: 10,
        source: 'upload',
        rawRows: [rawTrainingRow()],
      }),
    );
    harness.write((ctx) => discardImport(ctx, preview.batchId));
    expect(() => harness.write((ctx) => applyTrainingsImport(ctx, preview.batchId))).toThrow(
      /kõrvale jäetud/,
    );
    expect(countTrainings()).toBe(0);
  });

  it('allocates the next free training code', () => {
    importRows([rawTrainingRow({ kood: 'KK-2026-101' }), rawTrainingRow({ kood: 'KK-2026-207' })]);
    const next = harness.write((ctx) => nextTrainingCode(ctx, 2026));
    expect(next).toBe('KK-2026-208');
  });
});

describe('trainings import — the committed sample dataset', () => {
  it('loads the real seed file through the same code path as an upload', () => {
    const content = readFileSync(join(process.cwd(), 'seed', 'naidis-koolituskalender.csv'));
    const rows = parseCsv(content.toString('utf8')).rows;
    const result = importRows(rows, 'seed');

    expect(result.summary.total).toBe(48);
    expect(result.summary.valid).toBe(48);
    expect(result.summary.created).toBe(48);
    expect(result.summary.withErrors).toBe(0);
    expect(countTrainings()).toBe(48);
  });

  it('reads the generated .xlsx twin to the same rows as the .csv', async () => {
    const csvRows = parseCsv(
      readFileSync(join(process.cwd(), 'seed', 'naidis-koolituskalender.csv')).toString('utf8'),
    ).rows;
    const xlsx = await parseXlsx(
      readFileSync(join(process.cwd(), 'seed', 'naidis-koolituskalender.xlsx')),
    );

    expect(xlsx.rows).toHaveLength(csvRows.length);
    // Import both and compare what actually landed, which is what matters.
    const fromXlsx = importRows(xlsx.rows, 'upload');
    expect(fromXlsx.summary).toMatchObject({ total: 48, valid: 48, created: 48, withErrors: 0 });

    const codes = harness.read((db) =>
      db.select({ code: trainings.code }).from(trainings).all().map((r) => r.code).sort(),
    );
    expect(codes).toEqual(csvRows.map((r) => r.kood).sort());
  });

  it('carries the Lisa B dates so the seeded scenario matches the spec', () => {
    const rows = parseCsv(
      readFileSync(join(process.cwd(), 'seed', 'naidis-koolituskalender.csv')).toString('utf8'),
    ).rows;
    importRows(rows, 'seed');

    const lisaB = harness.read((db) =>
      db
        .select({ code: trainings.code, eventDate: trainings.eventDate })
        .from(trainings)
        .all()
        .filter((r) => r.code >= 'KK-2026-201' && r.code <= 'KK-2026-206')
        .sort((a, b) => a.code.localeCompare(b.code)),
    );
    expect(lisaB.map((r) => r.eventDate)).toEqual([
      '2026-10-05',
      '2026-10-07',
      '2026-10-12',
      '2026-10-14',
      '2026-10-19',
      '2026-10-21',
    ]);
  });
});

describe('partner ranking import', () => {
  const importPartners = (
    rawRows: Array<Record<string, string>>,
    options = { deactivateMissing: false },
  ) =>
    harness.write((ctx) =>
      importPartnersFromRows(ctx, {
        fileName: 'partnerid.csv',
        fileSize: 100,
        source: 'upload',
        rawRows,
        options,
      }),
    );

  const memberships = (lotCode: string) =>
    harness.read((db) =>
      db
        .select({
          name: partners.name,
          rank: lotPartners.rank,
          isActive: lotPartners.isActive,
        })
        .from(lotPartners)
        .innerJoin(partners, eq(partners.id, lotPartners.partnerId))
        .innerJoin(lots, eq(lots.id, lotPartners.lotId))
        .where(eq(lots.code, lotCode))
        .all()
        .sort((a, b) => a.rank - b.rank),
    );

  it('creates partners and their ranked memberships', () => {
    importPartners([
      rawPartnerRow({ koht: '1' }),
      rawPartnerRow({ partner: 'AI Akadeemia OÜ', registrikood: '10000002', koht: '2' }),
    ]);
    expect(memberships('OSA-1')).toEqual([
      { name: 'Tehisaru Koolitus OÜ', rank: 1, isActive: true },
      { name: 'AI Akadeemia OÜ', rank: 2, isActive: true },
    ]);
  });

  it('reverses a ranking without tripping the unique index [E-08]', () => {
    importPartners([
      rawPartnerRow({ koht: '1' }),
      rawPartnerRow({ partner: 'AI Akadeemia OÜ', registrikood: '10000002', koht: '2' }),
    ]);
    // Swap them — a naive update would collide on (lot, rank) mid-transaction.
    importPartners([
      rawPartnerRow({ koht: '2' }),
      rawPartnerRow({ partner: 'AI Akadeemia OÜ', registrikood: '10000002', koht: '1' }),
    ]);
    expect(memberships('OSA-1')).toEqual([
      { name: 'AI Akadeemia OÜ', rank: 1, isActive: true },
      { name: 'Tehisaru Koolitus OÜ', rank: 2, isActive: true },
    ]);
  });

  it('loads the committed sample ranking file', () => {
    const rows = parseCsv(
      readFileSync(join(process.cwd(), 'seed', 'naidis-partnerid.csv')).toString('utf8'),
    ).rows;
    const result = importPartners(rows);
    expect(result.summary.valid).toBe(17);
    expect(memberships('OSA-2').map((m) => m.name)).toEqual([
      'AI Akadeemia OÜ',
      'Digioskus MTÜ',
      'Tehisaru Koolitus OÜ',
      'Targa Töö Koolitus OÜ',
    ]);
    expect(harness.read((db) => db.select().from(partners).all())).toHaveLength(6);
  });

  it('keeps partners absent from the file active by default', () => {
    importPartners([
      rawPartnerRow({ koht: '1' }),
      rawPartnerRow({ partner: 'AI Akadeemia OÜ', registrikood: '10000002', koht: '2' }),
    ]);
    importPartners([rawPartnerRow({ koht: '1' })]);

    const after = memberships('OSA-1');
    expect(after).toHaveLength(2);
    expect(after.every((m) => m.isActive)).toBe(true);
    expect(after.find((m) => m.name === 'AI Akadeemia OÜ')?.rank).toBeGreaterThan(1);
  });

  it('deactivates absent partners when asked, and says who in the preview', () => {
    importPartners([
      rawPartnerRow({ koht: '1' }),
      rawPartnerRow({ partner: 'AI Akadeemia OÜ', registrikood: '10000002', koht: '2' }),
    ]);

    const preview = harness.write((ctx) =>
      previewPartnersImport(ctx, {
        fileName: 'partnerid.csv',
        fileSize: 10,
        source: 'upload',
        rawRows: [rawPartnerRow({ koht: '1' })],
        options: { deactivateMissing: true },
      }),
    );
    expect(preview.wouldDeactivate).toEqual([
      { lotCode: 'OSA-1', partnerName: 'AI Akadeemia OÜ', rank: 2, inOpenRound: false },
    ]);

    harness.write((ctx) => applyPartnersImport(ctx, preview.batchId));
    const after = memberships('OSA-1');
    expect(after.find((m) => m.name === 'AI Akadeemia OÜ')?.isActive).toBe(false);
    expect(after.find((m) => m.name === 'Tehisaru Koolitus OÜ')?.isActive).toBe(true);
  });

  it('leaves an open round’s frozen participants untouched [V-07]', () => {
    const lotIds = harness.read((db) =>
      db.select({ id: lots.id, code: lots.code }).from(lots).all(),
    );
    const osa1 = lotIds.find((l) => l.code === 'OSA-1')!.id;

    importPartners([
      rawPartnerRow({ koht: '1' }),
      rawPartnerRow({ partner: 'AI Akadeemia OÜ', registrikood: '10000002', koht: '2' }),
    ]);
    const members = harness.read((db) =>
      db.select().from(lotPartners).where(eq(lotPartners.lotId, osa1)).all(),
    );

    // An open round with its ranking snapshot.
    const roundId = crypto.randomUUID();
    harness.write((ctx) => {
      ctx.tx
        .insert(rounds)
        .values({
          id: roundId,
          code: 'VOOR-2026-001',
          lotId: osa1,
          status: 'open',
          publishedAt: ctx.at,
          deadlineAt: ctx.at + 86_400_000,
          createdAt: ctx.at,
          createdBy: 'test',
        })
        .run();
      members.forEach((member) => {
        ctx.tx
          .insert(roundParticipants)
          .values({
            id: crypto.randomUUID(),
            roundId,
            lotPartnerId: member.id,
            rankAtPublication: member.rank,
            contactNameSnapshot: member.contactName,
            contactEmailSnapshot: member.contactEmail,
            createdAt: ctx.at,
          })
          .run();
      });
    });

    const before = harness.read((db) =>
      db
        .select({ lotPartnerId: roundParticipants.lotPartnerId, rank: roundParticipants.rankAtPublication })
        .from(roundParticipants)
        .all()
        .sort((a, b) => a.rank - b.rank),
    );

    // Reverse the ranking and deactivate one member while the round is open.
    harness.write((ctx) => {
      const preview = previewPartnersImport(ctx, {
        fileName: 'partnerid.csv',
        fileSize: 10,
        source: 'upload',
        rawRows: [rawPartnerRow({ partner: 'AI Akadeemia OÜ', registrikood: '10000002', koht: '1' })],
        options: { deactivateMissing: true },
      });
      expect(preview.wouldDeactivate[0]).toMatchObject({ inOpenRound: true });
      applyPartnersImport(ctx, preview.batchId);
    });

    const after = harness.read((db) =>
      db
        .select({ lotPartnerId: roundParticipants.lotPartnerId, rank: roundParticipants.rankAtPublication })
        .from(roundParticipants)
        .all()
        .sort((a, b) => a.rank - b.rank),
    );
    expect(after).toEqual(before);
  });
});
