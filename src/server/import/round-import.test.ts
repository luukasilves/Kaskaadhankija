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
import { applyRoundImport, previewRoundImport } from './round-import';
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
