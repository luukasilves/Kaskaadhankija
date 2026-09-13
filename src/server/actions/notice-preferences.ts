'use server';

/** The representative's own informational-mail switch [L-27], from Teavitused. */

import { setInformationalMail } from '../notice-preferences';
import { describeError, fail, fieldText, ok, partnerWrite, type ActionOutcome } from './helpers';

export async function setInformationalMailAction(form: FormData): Promise<ActionOutcome> {
  const on = fieldText(form, 'on') === '1';
  try {
    const result = await partnerWrite((ctx, actor) => setInformationalMail(ctx, actor, on), ['/partner/teavitused']);
    if (!result.changed) return ok('Seadistus oli juba selline.');
    return ok(
      on
        ? 'Teabekirjad tulevad nüüd ka e-postiga.'
        : 'Teabekirjad e-postiga on välja lülitatud. Need jäävad siia logisse; formaalsed teated tulevad e-postiga edasi.',
    );
  } catch (error) {
    return fail(describeError(error));
  }
}
