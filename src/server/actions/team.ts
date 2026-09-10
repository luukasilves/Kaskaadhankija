'use server';

/** The buyer team's membership [R-01] — admin only. */

import { resolveIdentity } from '../auth/actor';
import { addTeamMember, setTeamMemberActive } from '../team';
import { buyerWrite, describeError, fail, fieldText, ok, type ActionOutcome } from './helpers';

export async function addTeamMemberAction(form: FormData): Promise<ActionOutcome> {
  try {
    const role = fieldText(form, 'role') === 'admin' ? 'admin' : 'member';
    await buyerWrite(
      (ctx) => addTeamMember(ctx, { name: fieldText(form, 'name'), email: fieldText(form, 'email'), role }),
      ['/tellija/meeskond'],
    );
    return ok('Liige lisatud. Ta saab sisse logida oma e-posti aadressiga.');
  } catch (error) {
    return fail(describeError(error));
  }
}

export async function setTeamMemberActiveAction(form: FormData): Promise<ActionOutcome> {
  try {
    const userId = fieldText(form, 'userId');
    const active = fieldText(form, 'active') === '1';
    // Switching yourself off would end your own session mid-request — and if
    // you were the admin acting as somebody else, the person you are acting as
    // would be the one holding the screen. Both identities are refused.
    if (!active) {
      const { signedIn, acting } = await resolveIdentity();
      const self =
        (signedIn?.kind === 'buyer' && signedIn.userId === userId) ||
        (acting?.kind === 'buyer' && acting.userId === userId);
      if (self) return fail('Iseennast ei saa deaktiveerida — palu seda teisel adminil.');
    }
    await buyerWrite((ctx) => setTeamMemberActive(ctx, userId, active), ['/tellija/meeskond']);
    return ok(active ? 'Liige on taas aktiivne.' : 'Liige deaktiveeritud.');
  } catch (error) {
    return fail(describeError(error));
  }
}
