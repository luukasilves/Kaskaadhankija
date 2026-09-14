'use server';

/** Switch a partner representative off or back on, from the Esindajad screen. */

import { setRepresentativeActive } from '../import/representatives-import';
import { adminWrite, describeError, fail, fieldText, ok, type ActionOutcome } from './helpers';

export async function setRepresentativeActiveAction(form: FormData): Promise<ActionOutcome> {
  const id = fieldText(form, 'id');
  const active = fieldText(form, 'active') === '1';
  try {
    await adminWrite((ctx) => setRepresentativeActive(ctx, id, active), [
      '/tellija/partnerid/esindajad',
      '/tellija/partnerid',
    ]);
    return ok(active ? 'Esindaja on taas aktiivne.' : 'Esindus lõpetatud.');
  } catch (error) {
    return fail(describeError(error));
  }
}
