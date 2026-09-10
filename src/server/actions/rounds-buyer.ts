'use server';

/**
 * Buyer-side round actions.
 *
 * Thin wrappers: authorization and transaction handling live in `helpers.ts`,
 * the rules live in `engine.ts`. Each returns an `ActionOutcome` so the page can
 * show what happened rather than throwing an opaque error at the user.
 */

import { redirect } from 'next/navigation';
import {
  applyAdjustment,
  cancelLeftover,
  cancelRound,
  clearAdjustment,
  closeRound,
  confirmAllocation,
  createRound,
  deactivateLotPartner,
  extendDeadlineByWorkingDays,
  markTrainingCompleted,
  publishRound,
  recordPartnerWithdrawal,
  reissueLeftover,
  removeTrainingFromDraft,
  withdrawTraining,
  cancelOrderTraining,
} from '../rounds/engine';
import { generateProtocolForEndedRound } from '../rounds/protocol';
import { assertBuyerActor } from '../auth/actor';
import { parseEstonianInstant } from '@/domain/round-definition';
import { runDueJobs } from '../rounds/jobs';
import type { VisibilityMode } from '@/domain/round-statuses';
import { isCapOptions } from '@/domain/round-statuses';
import {
  adminWrite,
  buyerWrite,
  describeError,
  fail,
  fieldList,
  fieldNumber,
  fieldText,
  ok,
  type ActionOutcome,
} from './helpers';

const ROUNDS = '/tellija/voorud';
const DASHBOARD = '/tellija';

/** Create a draft round from selected trainings, then open its page. */
export async function createRoundAction(form: FormData): Promise<ActionOutcome> {
  const lotId = fieldText(form, 'lotId');
  const trainingIds = fieldList(form, 'trainingIds');
  const note = fieldText(form, 'note');
  const visibilityMode = (fieldText(form, 'visibilityMode') || undefined) as VisibilityMode | undefined;
  const rawCapOptions = fieldText(form, 'capOptions');
  const capOptions = rawCapOptions ? (isCapOptions(rawCapOptions) ? rawCapOptions : null) : undefined;

  if (!lotId) return fail('Vali hankeosa.');
  if (trainingIds.length === 0) return fail('Vali vähemalt üks koolitus.');
  if (capOptions === null) return fail('Tundmatu piirmäära valik.');

  let roundId: string;
  try {
    roundId = await buyerWrite(
      (ctx) => createRound(ctx, { lotId, trainingIds, note, visibilityMode, capOptions }),
      [ROUNDS, DASHBOARD, '/tellija/koolitused'],
    );
  } catch (error) {
    return fail(describeError(error));
  }
  redirect(`${ROUNDS}/${roundId}`);
}

export async function publishRoundAction(form: FormData): Promise<ActionOutcome> {
  const roundId = fieldText(form, 'roundId');
  // Working days is the unit the framework itself uses, so it stays the
  // default. An absolute instant is the alternative, because a round scheme
  // may plan one [L-20] and a test round needs a window of minutes [L-23].
  const extraWorkingDays = fieldNumber(form, 'extraWorkingDays') ?? 0;
  const visibilityMode = (fieldText(form, 'visibilityMode') || undefined) as VisibilityMode | undefined;
  const deadlineLocal = fieldText(form, 'deadlineAt');
  let deadlineAt: number | undefined;
  if (deadlineLocal) {
    // A `datetime-local` value has no zone; the person typed Tallinn time.
    const parsed = parseEstonianInstant(deadlineLocal.replace('T', ' '), '17:00');
    if (!parsed.ok) return fail(`Tähtaeg ei ole loetav: ${parsed.message}`);
    deadlineAt = parsed.value;
  }

  try {
    await buyerWrite(
      (ctx) => publishRound(ctx, roundId, { extraWorkingDays, visibilityMode, deadlineAt }),
      [ROUNDS, `${ROUNDS}/${roundId}`, DASHBOARD],
    );
    return ok('Voor on avaldatud kõigile hankeosa partneritele.');
  } catch (error) {
    return fail(describeError(error));
  }
}

export async function removeDraftTrainingAction(form: FormData): Promise<ActionOutcome> {
  const roundId = fieldText(form, 'roundId');
  const trainingId = fieldText(form, 'trainingId');
  try {
    await buyerWrite((ctx) => removeTrainingFromDraft(ctx, roundId, trainingId), [
      `${ROUNDS}/${roundId}`,
      '/tellija/koolitused',
    ]);
    return ok('Koolitus eemaldatud mustandist.');
  } catch (error) {
    return fail(describeError(error));
  }
}

export async function extendDeadlineAction(form: FormData): Promise<ActionOutcome> {
  const roundId = fieldText(form, 'roundId');
  const addDays = fieldNumber(form, 'addWorkingDays') ?? 0;
  const reason = fieldText(form, 'reason');

  if (addDays <= 0) return fail('Vali, mitu päeva juurde anda.');

  try {
    await buyerWrite((ctx) => extendDeadlineByWorkingDays(ctx, roundId, addDays, reason), [
      `${ROUNDS}/${roundId}`,
      ROUNDS,
    ]);
    return ok('Tähtaeg on pikendatud ja partnereid teavitatud.');
  } catch (error) {
    return fail(describeError(error));
  }
}

export async function withdrawTrainingAction(form: FormData): Promise<ActionOutcome> {
  const roundId = fieldText(form, 'roundId');
  const trainingId = fieldText(form, 'trainingId');
  const reason = fieldText(form, 'reason');
  try {
    await buyerWrite((ctx) => withdrawTraining(ctx, roundId, trainingId, reason), [
      `${ROUNDS}/${roundId}`,
      '/tellija/koolitused',
    ]);
    return ok('Koolitus on voorust tagasi võetud ja partnereid teavitatud.');
  } catch (error) {
    return fail(describeError(error));
  }
}

export async function cancelRoundAction(form: FormData): Promise<ActionOutcome> {
  const roundId = fieldText(form, 'roundId');
  const reason = fieldText(form, 'reason');
  try {
    await buyerWrite((ctx) => cancelRound(ctx, roundId, reason), [
      ROUNDS,
      `${ROUNDS}/${roundId}`,
      DASHBOARD,
      '/tellija/koolitused',
    ]);
    return ok('Voor on tühistatud.');
  } catch (error) {
    return fail(describeError(error));
  }
}

/**
 * Write the protocol of a round that ended before protocols existed [L-22].
 *
 * The only way a protocol is ever created by hand: a new round gets one
 * automatically, inside the transaction that ends it. This exists for the
 * rounds already in the database when the feature arrived, and it refuses a
 * round that already has one, so a signed document cannot be replaced.
 */
export async function generateProtocolAction(form: FormData): Promise<ActionOutcome> {
  const roundId = fieldText(form, 'roundId');
  try {
    const written = await buyerWrite((ctx) => generateProtocolForEndedRound(ctx, roundId), [
      `${ROUNDS}/${roundId}`,
      `${ROUNDS}/${roundId}/protokoll`,
      '/tellija/auditilogi',
    ]);
    return ok(`Protokoll on koostatud (sõrmejälg ${written.hash.slice(0, 16)}).`);
  } catch (error) {
    return fail(describeError(error));
  }
}

/** Close a round early is not offered; this only forces the due check. */
export async function runDeadlineJobsAction(): Promise<ActionOutcome> {
  try {
    // Procurement housekeeping: forcing the sweep only closes rounds whose
    // deadline has already passed, which is a purchaser's business.
    await assertBuyerActor();
    const report = runDueJobs();
    return ok(
      report.closed.length > 0
        ? `Suletud: ${report.closed.join(', ')}.`
        : 'Ükski voor ei olnud tähtaja ületanud.',
    );
  } catch (error) {
    return fail(describeError(error));
  }
}

export async function applyAdjustmentAction(form: FormData): Promise<ActionOutcome> {
  const roundId = fieldText(form, 'roundId');
  const lotPartnerId = fieldText(form, 'lotPartnerId');
  const kind = fieldText(form, 'kind') as 'skip' | 'cap';
  const cap = fieldNumber(form, 'cap');
  const justification = fieldText(form, 'justification');

  try {
    await buyerWrite(
      (ctx) =>
        applyAdjustment(ctx, roundId, {
          lotPartnerId,
          kind,
          cap: cap ?? undefined,
          justification,
        }),
      [`${ROUNDS}/${roundId}/ulevaatus`],
    );
    return ok(kind === 'skip' ? 'Partner jäetakse selles voorus vahele.' : 'Piirmäär rakendatud.');
  } catch (error) {
    return fail(describeError(error));
  }
}

export async function clearAdjustmentAction(form: FormData): Promise<ActionOutcome> {
  const roundId = fieldText(form, 'roundId');
  const lotPartnerId = fieldText(form, 'lotPartnerId');
  try {
    await buyerWrite((ctx) => clearAdjustment(ctx, roundId, lotPartnerId), [
      `${ROUNDS}/${roundId}/ulevaatus`,
    ]);
    return ok('Kohandus tühistatud.');
  } catch (error) {
    return fail(describeError(error));
  }
}

export async function confirmAllocationAction(form: FormData): Promise<ActionOutcome> {
  const roundId = fieldText(form, 'roundId');
  try {
    const result = await buyerWrite((ctx) => confirmAllocation(ctx, roundId), [
      ROUNDS,
      `${ROUNDS}/${roundId}`,
      `${ROUNDS}/${roundId}/ulevaatus`,
      DASHBOARD,
      '/tellija/tellimused',
      '/tellija/koolitused',
    ]);
    return ok(
      `Jaotus kinnitatud: ${result.orderIds.length} tellimus(t) loodud${
        result.leftover.length > 0 ? `, jääk ${result.leftover.length} koolitust` : ''
      }.`,
    );
  } catch (error) {
    return fail(describeError(error));
  }
}

/* ---------------- jääk [T-06] ---------------- */

export async function reissueLeftoverAction(form: FormData): Promise<ActionOutcome> {
  const trainingIds = fieldList(form, 'trainingIds');
  const lotId = fieldText(form, 'lotId');
  if (trainingIds.length === 0) return fail('Vali vähemalt üks koolitus.');

  let roundId: string;
  try {
    roundId = await buyerWrite(
      (ctx) => {
        const id = createRound(ctx, { lotId, trainingIds: [] });
        for (const trainingId of trainingIds) reissueLeftover(ctx, trainingId, id);
        return id;
      },
      [DASHBOARD, ROUNDS, '/tellija/koolitused'],
    );
  } catch (error) {
    return fail(describeError(error));
  }
  redirect(`${ROUNDS}/${roundId}`);
}

export async function cancelLeftoverAction(form: FormData): Promise<ActionOutcome> {
  const trainingId = fieldText(form, 'trainingId');
  const reason = fieldText(form, 'reason');
  try {
    await buyerWrite((ctx) => cancelLeftover(ctx, trainingId, reason), [
      DASHBOARD,
      '/tellija/koolitused',
    ]);
    return ok('Koolitus tühistatud.');
  } catch (error) {
    return fail(describeError(error));
  }
}

/* ---------------- orders and memberships ---------------- */

export async function markTrainingCompletedAction(form: FormData): Promise<ActionOutcome> {
  const trainingId = fieldText(form, 'trainingId');
  try {
    await buyerWrite((ctx) => markTrainingCompleted(ctx, trainingId), [
      '/tellija/koolitused',
      '/tellija/tellimused',
    ]);
    return ok('Koolitus märgitud läbiviiduks.');
  } catch (error) {
    return fail(describeError(error));
  }
}

export async function cancelOrderTrainingAction(form: FormData): Promise<ActionOutcome> {
  const orderId = fieldText(form, 'orderId');
  const trainingId = fieldText(form, 'trainingId');
  const reason = fieldText(form, 'reason');
  try {
    await buyerWrite((ctx) => cancelOrderTraining(ctx, orderId, trainingId, reason), [
      `/tellija/tellimused/${orderId}`,
      '/tellija/tellimused',
    ]);
    return ok('Koolitus tellimusest tühistatud.');
  } catch (error) {
    return fail(describeError(error));
  }
}

export async function recordPartnerWithdrawalAction(form: FormData): Promise<ActionOutcome> {
  const orderId = fieldText(form, 'orderId');
  const trainingId = fieldText(form, 'trainingId');
  const note = fieldText(form, 'note');
  try {
    await buyerWrite((ctx) => recordPartnerWithdrawal(ctx, orderId, trainingId, note), [
      `/tellija/tellimused/${orderId}`,
      DASHBOARD,
    ]);
    return ok('Partneri loobumine on registreeritud ja märgitud järelmenetluseks.');
  } catch (error) {
    return fail(describeError(error));
  }
}

export async function deactivateLotPartnerAction(form: FormData): Promise<ActionOutcome> {
  const lotPartnerId = fieldText(form, 'lotPartnerId');
  const lotId = fieldText(form, 'lotId');
  const reason = fieldText(form, 'reason');
  try {
    // Administration, not procurement: this ends a framework participation, so
    // it also removes the partner from every future round [L-21]. A purchaser
    // who needs it mid-round asks an admin — the honest fix, if that bites,
    // would be a round-scoped exclusion rather than widening this.
    await adminWrite((ctx) => deactivateLotPartner(ctx, lotPartnerId, reason), [
      `/tellija/hankeosad/${lotId}`,
      '/tellija/partnerid',
    ]);
    return ok('Partneri osalus hankeosas on lõpetatud.');
  } catch (error) {
    return fail(describeError(error));
  }
}

/** Force a due-check from the buyer UI, mirroring what the timer does. */
export async function closeRoundIfDueAction(form: FormData): Promise<ActionOutcome> {
  const roundId = fieldText(form, 'roundId');
  try {
    const result = await buyerWrite((ctx) => closeRound(ctx, roundId), [
      `${ROUNDS}/${roundId}`,
      ROUNDS,
    ]);
    return result.closed
      ? ok(`Voor ${result.code} suletud, jaotusettepanek külmutatud.`)
      : ok('Voor ei olnud avatud.');
  } catch (error) {
    return fail(describeError(error));
  }
}
