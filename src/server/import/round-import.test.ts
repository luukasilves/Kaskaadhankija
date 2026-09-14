/**
 * One cascade round from a workbook [L-20]: a draft over trainings created or
 * updated through the calendar import's own code, and nothing at all when any
 * row is wrong.
 */

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { roundTrainings, rounds, trainings } from '@/db/schema';
import { createRound } from '../rounds/engine';
import { createHarness, rawTrainingRow, seedLots, type TestHarness } from '../test-support';
import { applyRoundImport, MIXED_KIND_MESSAGE, previewRoundImport } from './round-import';
import { templateRowsFor } from './round-template';
import { importTrainingsFromRows } from './trainings-import';

let harness: TestHarness;
let lotIds: Record<string, string>;

beforeEach(() => {
  harness = createHarness();
  lotIds = seedLots(harness);
});

afterEach(() => harness.close());

const voor = (over: Record<string, string> = {}) =>
  Object.entries({ hankeosa: 'OSA-1', nahtavus: 'dünaamiline', piirmaara_valikud: 'osalejad', lisatoopaevad: '1', markus: 'Skeemist', ...over }).map(
    ([väli, väärtus]) => ({ väli, väärtus }),
  );

const preview = (roundRows: Array<Record<string, string>>, trainingRows: Array<Record<string, string>>) =>
  harness.write((ctx) => previewRoundImport(ctx, { fileName: 'voor.xlsx', fileSize: 1, roundRows, trainingRows }));

describe('round import', () => {
  it('creates a draft over new trainings, with the sheet’s settings', () => {
    const result = preview(voor(), [
      rawTrainingRow({ kood: 'KK-2026-701', kuupaev: '12.10.2026' }),
      rawTrainingRow({ kood: 'KK-2026-702', kuupaev: '14.10.2026', osalejate_arv: '40' }),
    ]);
    expect(result.canApply).toBe(true);
    expect(result.summary).toMatchObject({ total: 2, valid: 2, created: 2, updated: 0, withErrors: 0 });

    const { roundId } = harness.write((ctx) => applyRoundImport(ctx, result.batchId));
    const round = harness.read((db) => db.select().from(rounds).where(eq(rounds.id, roundId)).get());
    expect(round).toMatchObject({
      status: 'draft',
      lotId: lotIds.OSA1 ?? lotIds['OSA-1'],
      visibilityMode: 'dynamic',
      capOptions: 'participants',
      plannedExtraWorkingDays: 1,
      note: 'Skeemist',
    });
    const inRound = harness.read((db) => db.select().from(roundTrainings).where(eq(roundTrainings.roundId, roundId)).all());
    expect(inRound).toHaveLength(2);
    expect(harness.read((db) => db.select().from(trainings).all()).every((t) => t.status === 'in_round')).toBe(true);
  });

  it('creates one draft per lot when the Voor sheet names none [L-20]', () => {
    const result = preview(voor({ hankeosa: '', lisatoopaevad: '', vastamistahtaeg: '09.10.2026' }), [
      rawTrainingRow({ kood: 'KK-2026-701', kuupaev: '12.10.2026' }),
      rawTrainingRow({ kood: 'KK-2026-702', kuupaev: '14.10.2026', hankeosa: 'OSA-2' }),
      rawTrainingRow({ kood: 'KK-2026-703', kuupaev: '15.10.2026', hankeosa: 'OSA-2' }),
    ]);
    expect(result.canApply).toBe(true);
    expect(result.round.value?.lotCode).toBeNull();
    expect(result.groups).toEqual([
      { lotCode: 'OSA-1', lotName: 'Hankeosa OSA-1', count: 1, kind: 'fixed' },
      { lotCode: 'OSA-2', lotName: 'Hankeosa OSA-2', count: 2, kind: 'fixed' },
    ]);

    const { roundIds } = harness.write((ctx) => applyRoundImport(ctx, result.batchId));
    expect(roundIds).toHaveLength(2);
    const created = harness.read((db) => db.select().from(rounds).all()).sort((a, b) => a.code.localeCompare(b.code));
    expect(created.map((r) => [r.lotId, r.status])).toEqual([
      [lotIds['OSA-1'], 'draft'],
      [lotIds['OSA-2'], 'draft'],
    ]);
    const inRound = (roundId: string) =>
      harness.read((db) => db.select().from(roundTrainings).where(eq(roundTrainings.roundId, roundId)).all()).length;
    expect(created.map((r) => inRound(r.id))).toEqual([1, 2]);
    // The bare-date deadline took each lot's own hour (both 17:00 here) and the
    // same settings went to both drafts.
    expect(created.every((r) => r.plannedDeadlineAt !== null && r.visibilityMode === 'dynamic')).toBe(true);
  });

  it('updates an existing unassigned training and takes it into the round', () => {
    harness.write((ctx) =>
      importTrainingsFromRows(ctx, { fileName: 'k.csv', fileSize: 1, source: 'upload', rawRows: [rawTrainingRow({ kood: 'KK-2026-701', nimetus: 'Vana nimi' })] }),
    );
    const result = preview(voor({ piirmaara_valikud: '' }), [rawTrainingRow({ kood: 'KK-2026-701', nimetus: 'Uus nimi skeemist' })]);
    expect(result.summary).toMatchObject({ created: 0, updated: 1 });
    const { roundId } = harness.write((ctx) => applyRoundImport(ctx, result.batchId));
    expect(harness.read((db) => db.select().from(trainings).get())?.title).toBe('Uus nimi skeemist');
    // An empty cap word means the lot's default.
    expect(harness.read((db) => db.select().from(rounds).where(eq(rounds.id, roundId)).get())?.capOptions).toBe('trainings');
  });

  it('refuses a training from another lot, and creates nothing', () => {
    const result = preview(voor(), [rawTrainingRow({ kood: 'KK-2026-701' }), rawTrainingRow({ kood: 'KK-2026-702', hankeosa: 'OSA-2' })]);
    expect(result.canApply).toBe(false);
    expect(result.rows[1]?.errors[0]?.message).toMatch(/kuulub hankeosasse OSA-2/);
    expect(() => harness.write((ctx) => applyRoundImport(ctx, result.batchId))).toThrow(/ei saa importida/);
    expect(harness.read((db) => db.select().from(trainings).all())).toHaveLength(0);
    expect(harness.read((db) => db.select().from(rounds).all())).toHaveLength(0);
  });

  it('refuses a training that already sits in a round', () => {
    harness.write((ctx) =>
      importTrainingsFromRows(ctx, { fileName: 'k.csv', fileSize: 1, source: 'upload', rawRows: [rawTrainingRow({ kood: 'KK-2026-701' })] }),
    );
    const trainingId = harness.read((db) => db.select().from(trainings).get())!.id;
    harness.write((ctx) => createRound(ctx, { lotId: lotIds['OSA-1']!, trainingIds: [trainingId] }));

    const result = preview(voor(), [rawTrainingRow({ kood: 'KK-2026-701' }), rawTrainingRow({ kood: 'KK-2026-702' })]);
    expect(result.canApply).toBe(false);
    expect(result.rows[0]?.errors[0]?.message).toMatch(/juba voorus/);
  });

  it('refuses a broken Voor sheet even when every training row is fine', () => {
    const result = preview(voor({ hankeosa: 'OSA-9' }), [rawTrainingRow({ kood: 'KK-2026-701' })]);
    expect(result.canApply).toBe(false);
    expect(result.round.value).toBeNull();
    expect(result.round.errors[0]?.message).toMatch(/tundmatu hankeosa/);
  });
});

/* ------------------------------------------------------------------ *
 * [V-09][L-28] clusters through the workbook
 * ------------------------------------------------------------------ */

const clusterRaw = (over: Record<string, string> = {}) =>
  rawTrainingRow({
    kood: 'KL-2026-001',
    hankeosa: 'OSA-2',
    nimetus: 'Töötuba 1 Harjumaa väikeettevõtjatele',
    kuupaev: '',
    periood_algus: '01.10.2026',
    periood_lopp: '31.12.2026',
    osalejate_arv: '500',
    ruhma_suurus: '50',
    hinnanguline_maksumus: '20000',
    ...over,
  });

const groupCodes = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `KL-2026-001-${String(from + i).padStart(2, '0')}`);

describe('[V-09][L-28] a cluster round from a workbook', () => {
  it('turns one cluster row into a draft of ten groups, and the round is a cluster round', () => {
    const result = preview(voor({ hankeosa: 'OSA-2', piirmaara_valikud: '' }), [clusterRaw()]);
    expect(result.canApply).toBe(true);
    expect(result.summary).toMatchObject({ total: 10, valid: 10, created: 10 });
    expect(result.groups).toEqual([{ lotCode: 'OSA-2', lotName: 'Hankeosa OSA-2', count: 10, kind: 'cluster' }]);
    expect(result.rows.every((r) => r.rowNumber === 2)).toBe(true);

    const { roundId } = harness.write((ctx) => applyRoundImport(ctx, result.batchId));
    expect(harness.read((db) => db.select().from(rounds).where(eq(rounds.id, roundId)).get())?.kind).toBe('cluster');
    const groups = harness.read((db) => db.select().from(trainings).all()).sort((a, b) => a.code.localeCompare(b.code));
    expect(groups.map((g) => g.code)).toEqual(groupCodes(1, 10));
    expect(groups.every((g) => g.dateKind === 'period' && g.clusterCode === 'KL-2026-001' && g.participantCount === 50)).toBe(true);
    expect(groups.map((g) => g.groupIndex)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(groups.every((g) => g.eventDate === '2026-10-01' && g.eventEnd === '2026-12-31' && g.status === 'in_round')).toBe(true);
    expect(harness.read((db) => db.select().from(roundTrainings).all())).toHaveLength(10);
  });

  it('refuses a lot whose rows mix a dated training and a cluster, and creates nothing', () => {
    const result = preview(voor({ hankeosa: 'OSA-2' }), [rawTrainingRow({ kood: 'KK-2026-701', hankeosa: 'OSA-2' }), clusterRaw()]);
    expect(result.canApply).toBe(false);
    expect(result.rows.every((r) => r.errors.some((e) => e.message === MIXED_KIND_MESSAGE))).toBe(true);
    expect(() => harness.write((ctx) => applyRoundImport(ctx, result.batchId))).toThrow(/ei saa importida/);
    expect(harness.read((db) => db.select().from(trainings).all())).toHaveLength(0);
    expect(harness.read((db) => db.select().from(rounds).all())).toHaveLength(0);
  });

  it('with no lot named, a dated lot and a cluster lot become two drafts of their own kinds [L-20]', () => {
    const result = preview(voor({ hankeosa: '', piirmaara_valikud: '' }), [rawTrainingRow({ kood: 'KK-2026-701', hankeosa: 'OSA-1' }), clusterRaw()]);
    expect(result.canApply).toBe(true);
    expect(result.groups).toEqual([
      { lotCode: 'OSA-1', lotName: 'Hankeosa OSA-1', count: 1, kind: 'fixed' },
      { lotCode: 'OSA-2', lotName: 'Hankeosa OSA-2', count: 10, kind: 'cluster' },
    ]);
    const { roundIds } = harness.write((ctx) => applyRoundImport(ctx, result.batchId));
    const kinds = harness.read((db) => db.select({ id: rounds.id, kind: rounds.kind }).from(rounds).all());
    expect(roundIds.map((id) => kinds.find((k) => k.id === id)?.kind)).toEqual(['fixed', 'cluster']);
  });

  it('the downloaded template writes a cluster back as one row, and that row re-imports as the same groups', () => {
    harness.write((ctx) => importTrainingsFromRows(ctx, { fileName: 'k.csv', fileSize: 1, source: 'upload', rawRows: [clusterRaw()] }));
    const available = harness.read((db) => db.select().from(trainings).all());
    const rows = templateRowsFor(available, 'OSA-2');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kood: 'KL-2026-001',
      kuupaev: '',
      periood_algus: '01.10.2026',
      periood_lopp: '31.12.2026',
      osalejate_arv: '500',
      ruhma_suurus: '50',
      ruhmi: '10',
      hinnanguline_maksumus: '20000',
    });

    const result = preview(voor({ hankeosa: 'OSA-2', piirmaara_valikud: '' }), rows);
    expect(result.canApply).toBe(true);
    expect(result.summary).toMatchObject({ created: 0, updated: 10 });
    // A different group count is a new cluster, not an edit of this one.
    const changed = preview(voor({ hankeosa: 'OSA-2' }), [{ ...rows[0]!, ruhmi: '12', ruhma_suurus: '' }]);
    expect(changed.canApply).toBe(false);
    expect(changed.rows[0]?.errors[0]?.message).toMatch(/rühmade arvu ei saa faili kaudu muuta/);
  });

  it('once some groups are committed, the template names only the free ones and the file re-issues exactly those', () => {
    harness.write((ctx) => importTrainingsFromRows(ctx, { fileName: 'k.csv', fileSize: 1, source: 'upload', rawRows: [clusterRaw()] }));
    const all = harness.read((db) => db.select().from(trainings).all()).sort((a, b) => a.code.localeCompare(b.code));
    harness.write((ctx) => createRound(ctx, { lotId: lotIds['OSA-2']!, trainingIds: all.slice(0, 7).map((g) => g.id) }));

    const free = harness.read((db) => db.select().from(trainings).all()).filter((g) => g.status === 'unassigned');
    const rows = templateRowsFor(free, 'OSA-2');
    expect(rows[0]).toMatchObject({ kood: 'KL-2026-001', ruhmi: '3', osalejate_arv: '150', ruhma_suurus: '50' });

    // The whole cluster's count no longer describes what is importable.
    const stale = preview(voor({ hankeosa: 'OSA-2' }), [clusterRaw()]);
    expect(stale.canApply).toBe(false);
    expect(stale.rows[0]?.errors[0]?.message).toMatch(/neist vabu 3 \(08–10\); failis 10/);

    const result = preview(voor({ hankeosa: 'OSA-2', piirmaara_valikud: '' }), rows);
    expect(result.canApply).toBe(true);
    expect(result.rows.map((r) => r.value?.code)).toEqual(groupCodes(8, 10));
    expect(result.rows[0]?.warnings[0]?.message).toMatch(/rühmad 01–07 on juba voorus/);
    const { roundId } = harness.write((ctx) => applyRoundImport(ctx, result.batchId));
    expect(harness.read((db) => db.select().from(roundTrainings).where(eq(roundTrainings.roundId, roundId)).all())).toHaveLength(3);

    // Now nothing of the cluster is free, and the row says so.
    const spent = preview(voor({ hankeosa: 'OSA-2' }), [clusterRaw()]);
    expect(spent.rows[0]?.errors[0]?.message).toMatch(/kõik 10 rühma on juba voorus või määratud/);
  });
});
