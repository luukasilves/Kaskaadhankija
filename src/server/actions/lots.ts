'use server';

/**
 * Lot configuration — the per-lot cascade parameters.
 *
 * These are the settings the spec insists must be configurable rather than
 * hard-coded, because the framework's exact wording still needs verifying with
 * the procurement specialists (L-01, L-05, L-07, L-10). Changing them never
 * affects an open round: each round froze its own values at publication [V-03].
 */

import { eq } from 'drizzle-orm';
import { lots } from '@/db/schema';
import { isCapOptions, type VisibilityMode } from '@/domain/round-statuses';
import { logAudit } from '../audit';
import { adminWrite, describeError, fail, fieldNumber, fieldText, ok, type ActionOutcome } from './helpers';

export async function updateLotConfigAction(form: FormData): Promise<ActionOutcome> {
  const lotId = fieldText(form, 'lotId');
  const responseDeadlineWorkingDays = fieldNumber(form, 'responseDeadlineWorkingDays');
  const deadlineLocalTime = fieldText(form, 'deadlineLocalTime') || '17:00';
  const reviewWorkingDays = fieldNumber(form, 'reviewWorkingDays');
  const workloadThreshold = fieldNumber(form, 'workloadThreshold');
  const defaultVisibilityMode = fieldText(form, 'defaultVisibilityMode') as VisibilityMode;
  const rawCapOptions = fieldText(form, 'defaultCapOptions') || 'trainings';
  if (!isCapOptions(rawCapOptions)) return fail('Tundmatu piirmäära valik.');
  const defaultCapOptions = rawCapOptions;

  if (!responseDeadlineWorkingDays || responseDeadlineWorkingDays < 1) {
    return fail('Vastamistähtaeg peab olema vähemalt üks tööpäev.');
  }
  if (!reviewWorkingDays || reviewWorkingDays < 1) {
    return fail('Ülevaatuse aeg peab olema vähemalt üks tööpäev.');
  }
  if (workloadThreshold === null || workloadThreshold < 1) {
    return fail('Töömahu piir peab olema vähemalt 1.');
  }
  if (!/^\d{2}:\d{2}$/.test(deadlineLocalTime)) {
    return fail('Kellaaeg peab olema kujul 17:00.');
  }

  try {
    await adminWrite(
      (ctx) => {
        const before = ctx.tx.select().from(lots).where(eq(lots.id, lotId)).get();
        if (!before) throw new Error('Hankeosa ei leitud.');

        ctx.tx
          .update(lots)
          .set({
            responseDeadlineWorkingDays,
            deadlineLocalTime,
            reviewWorkingDays,
            workloadThreshold,
            defaultVisibilityMode,
            defaultCapOptions,
          })
          .where(eq(lots.id, lotId))
          .run();

        logAudit(ctx, {
          eventType: 'lot.config_changed',
          summary: `${before.code} kaskaadi seaded muudetud: ${responseDeadlineWorkingDays} tööpäeva kell ${deadlineLocalTime}, töömahu piir ${workloadThreshold}, nähtavus ${defaultVisibilityMode === 'dynamic' ? 'dünaamiline' : 'suletud'}, piirmäära liigid ${defaultCapOptions}`,
          lotId,
          before: {
            responseDeadlineWorkingDays: before.responseDeadlineWorkingDays,
            deadlineLocalTime: before.deadlineLocalTime,
            reviewWorkingDays: before.reviewWorkingDays,
            workloadThreshold: before.workloadThreshold,
            defaultVisibilityMode: before.defaultVisibilityMode,
            defaultCapOptions: before.defaultCapOptions,
          },
          after: {
            responseDeadlineWorkingDays,
            deadlineLocalTime,
            reviewWorkingDays,
            workloadThreshold,
            defaultVisibilityMode,
            defaultCapOptions,
          },
        });
      },
      [`/tellija/hankeosad/${lotId}`, '/tellija/hankeosad'],
    );
    return ok('Seaded salvestatud. Käimasolevaid voore see ei muuda.');
  } catch (error) {
    return fail(describeError(error));
  }
}
