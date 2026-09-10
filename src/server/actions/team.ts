'use server';

/** The buyer team's membership [R-01] — admin only. */

import { resolveIdentity } from '../auth/actor';
import { addTeamMember, setTeamMemberActive, setTeamMemberRole } from '../team';
import { adminWrite, describeError, fail, fieldText, ok, type ActionOutcome } from './helpers';

export async function addTeamMemberAction(form: FormData): Promise<ActionOutcome> {
  try {
    const role = fieldText(form, 'role') === 'admin' ? 'admin' : 'member';
    await adminWrite(
      (ctx) => addTeamMember(ctx, { name: fieldText(form, 'name'), email: fieldText(form, 'email'), role }),
      ['/tellija/meeskond'],
    );
    return ok('Kasutaja lisatud. Ta saab sisse logida oma e-posti aadressiga.');
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
    await adminWrite((ctx) => setTeamMemberActive(ctx, userId, active), ['/tellija/meeskond']);
    return ok(active ? 'Kasutaja on taas aktiivne.' : 'Kasutaja deaktiveeritud.');
  } catch (error) {
    return fail(describeError(error));
  }
}

export async function setTeamMemberRoleAction(form: FormData): Promise<ActionOutcome> {
  try {
    const userId = fieldText(form, 'userId');
    const role = fieldText(form, 'role') === 'admin' ? 'admin' : 'member';
    // Demoting yourself has the same problem as switching yourself off: the
    // next request would arrive without the right you are exercising, and if
    // you were acting as somebody else it would be their row you changed. Both
    // identities are refused.
    if (role !== 'admin') {
      const { signedIn, acting } = await resolveIdentity();
      const self =
        (signedIn?.kind === 'buyer' && signedIn.userId === userId) ||
        (acting?.kind === 'buyer' && acting.userId === userId);
      if (self) return fail('Iseenda rolli ei saa alandada — palu seda teisel adminil.');
    }
    await adminWrite((ctx) => setTeamMemberRole(ctx, userId, role), ['/tellija/meeskond']);
    return ok(role === 'admin' ? 'Kasutaja on nüüd admin.' : 'Kasutaja on nüüd hankija.');
  } catch (error) {
    return fail(describeError(error));
  }
}
