'use server';

/**
 * Partner-side round actions.
 *
 * Each takes only a `roundId`. The acting lot membership is resolved from the
 * authenticated company inside the engine, so a partner cannot mark, confirm or
 * decline on behalf of anyone else — the client never supplies that identity.
 */

import type { CapKind } from '@/domain/allocate';
import { confirmMarks, declineAll, saveDraftMarks, type MarksInput } from '../rounds/engine';
import { buyerWrite, describeError, fail, fieldList, fieldNumber, fieldText, ok, partnerWrite, type ActionOutcome } from './helpers';

const ROUNDS = '/partner/voorud';

/**
 * A cap of 0 is meaningful ("nothing this round"); an empty field is "no cap".
 * The kind says what it counts [K-06]; the engine checks it against the round.
 */
function readCap(form: FormData): Pick<MarksInput, 'cap' | 'capKind'> {
  const capKind: CapKind = fieldText(form, 'capKind') === 'participants' ? 'participants' : 'trainings';
  const raw = fieldText(form, 'cap');
  if (!raw) return { cap: null, capKind };
  const value = fieldNumber(form, 'cap');
  if (value === null || value < 0) return { cap: null, capKind };
  return { cap: Math.floor(value), capKind };
}

/** [K-02] Save the working draft. Binds nothing. */
export async function saveDraftAction(form: FormData): Promise<ActionOutcome<number>> {
  const roundId = fieldText(form, 'roundId');
  const marks = fieldList(form, 'marks');
  const { cap, capKind } = readCap(form);

  try {
    const result = await partnerWrite(
      (ctx, actor) => saveDraftMarks(ctx, roundId, actor.partnerId, { marks, cap, capKind }),
      [`${ROUNDS}/${roundId}`, ROUNDS],
    );
    if (!result.ok) return fail(result.message);
    return ok(
      `Mustand salvestatud. Kinnitamata muudatused ei loe tähtajal — vajuta „Kinnita valik“.`,
      result.projectedCount,
    );
  } catch (error) {
    return fail(describeError(error));
  }
}

/** [K-02][K-05] Confirm — the partner's binding answer. */
export async function confirmMarksAction(form: FormData): Promise<ActionOutcome<number>> {
  const roundId = fieldText(form, 'roundId');
  const marks = fieldList(form, 'marks');
  const { cap, capKind } = readCap(form);

  try {
    const result = await partnerWrite(
      (ctx, actor) => confirmMarks(ctx, roundId, actor.partnerId, { marks, cap, capKind }),
      [`${ROUNDS}/${roundId}`, ROUNDS, '/partner/teavitused'],
    );
    if (!result.ok) return fail(result.message);
    return ok(
      marks.length === 0
        ? 'Registreerisime, et loobute vooru koolitustest.'
        : `Valik kinnitatud: ${marks.length} koolitust. Praeguse seisuga prognoosis ${result.projectedCount}.`,
      result.projectedCount,
    );
  } catch (error) {
    return fail(describeError(error));
  }
}

/** [K-07] An explicit decline, recorded distinctly from silence. */
export async function declineAllAction(form: FormData): Promise<ActionOutcome<number>> {
  const roundId = fieldText(form, 'roundId');
  try {
    const result = await partnerWrite((ctx, actor) => declineAll(ctx, roundId, actor.partnerId), [
      `${ROUNDS}/${roundId}`,
      ROUNDS,
      '/partner/teavitused',
    ]);
    if (!result.ok) return fail(result.message);
    return ok('Loobumine registreeritud. Saate otsust muuta kuni tähtajani.');
  } catch (error) {
    return fail(describeError(error));
  }
}

/** Mark a notification read — available to both sides. */
export async function markNotificationReadAction(form: FormData): Promise<ActionOutcome> {
  const notificationId = fieldText(form, 'notificationId');
  const asBuyer = fieldText(form, 'as') === 'buyer';
  const { notifications } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');

  const write = asBuyer ? buyerWrite : partnerWrite;
  try {
    await write(
      (ctx) => {
        ctx.tx
          .update(notifications)
          .set({ readAt: ctx.at })
          .where(eq(notifications.id, notificationId))
          .run();
      },
      [asBuyer ? '/tellija/teavitused' : '/partner/teavitused'],
    );
    return ok('Märgitud loetuks.');
  } catch (error) {
    return fail(describeError(error));
  }
}
