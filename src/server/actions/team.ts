'use server';

/** The buyer team's membership [R-01] — admin only. */

import { requireAdmin } from '../auth/actor';
import { addTeamMember, setTeamMemberActive } from '../team';
import { buyerWrite, describeError, fail, fieldText, ok, type ActionOutcome } from './helpers';

export async function addTeamMemberAction(form: FormData): Promise<ActionOutcome> {
  try {
    await requireAdmin();
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
    await requireAdmin();
    const userId = fieldText(form, 'userId');
    const active = fieldText(form, 'active') === '1';
    await buyerWrite((ctx) => setTeamMemberActive(ctx, userId, active), ['/tellija/meeskond']);
    return ok(active ? 'Liige on taas aktiivne.' : 'Liige deaktiveeritud.');
  } catch (error) {
    return fail(describeError(error));
  }
}
