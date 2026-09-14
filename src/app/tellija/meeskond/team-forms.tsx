'use client';

import { BUYER_ROLE_LABELS } from '@/domain/round-statuses';
import { ActionForm } from '@/components/action-form';
import {
  addTeamMemberAction,
  setTeamMemberActiveAction,
  setTeamMemberRoleAction,
} from '@/server/actions/team';

export function AddTeamMemberForm() {
  return (
    <ActionForm
      action={addTeamMemberAction}
      submitLabel="Lisa liige"
      variant="primary"
      className="kh-card space-y-3 p-4"
      testId="add-team-member"
    >
      <h2>Lisa tellimismeeskonna liige</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="text-[12.5px] font-semibold">Nimi</span>
          <input name="name" required minLength={2} maxLength={80} className="kh-input mt-1 w-full" />
        </label>
        <label className="block">
          <span className="text-[12.5px] font-semibold">E-post</span>
          <input name="email" type="email" required className="kh-input mt-1 w-full" />
        </label>
        <label className="block">
          <span className="text-[12.5px] font-semibold">Roll</span>
          <select name="role" className="kh-input mt-1 w-full" defaultValue="member">
            <option value="member">{BUYER_ROLE_LABELS.member}</option>
            <option value="admin">{BUYER_ROLE_LABELS.admin}</option>
          </select>
        </label>
      </div>
      <p className="text-[12.5px] text-[var(--color-muted)]">
        Paroole ei ole: inimene logib sisse oma e-postile saadetava ühekordse koodiga.
        Hankija teeb voore algusest lõpuni; raamhanke andmete ja meeskonna muutmine on
        admini õigus.
      </p>
    </ActionForm>
  );
}

export function TeamMemberActiveToggle({ userId, active }: { userId: string; active: boolean }) {
  return (
    <ActionForm
      action={setTeamMemberActiveAction}
      submitLabel={active ? 'Deaktiveeri' : 'Taasta'}
      variant={active ? 'default' : 'success'}
      confirm={active ? 'Deaktiveerida see kasutaja? Ta ei saa enam sisse logida.' : undefined}
      hidden={{ userId, active: active ? '0' : '1' }}
      className="inline"
    />
  );
}

/**
 * Move somebody between the roles.
 *
 * A one-button form rather than a `<select>`: there are two roles, so the
 * useful control is "make this person the other thing", and the confirmation
 * spells out what that means.
 */
export function TeamMemberRoleToggle({ userId, role }: { userId: string; role: 'admin' | 'member' }) {
  const next = role === 'admin' ? 'member' : 'admin';
  return (
    <ActionForm
      action={setTeamMemberRoleAction}
      submitLabel={next === 'admin' ? 'Tee adminiks' : 'Tee hankijaks'}
      variant="default"
      confirm={
        next === 'admin'
          ? 'Anda sellele kasutajale admini õigused? Ta saab siis muuta raamhanke andmeid ja meeskonda.'
          : 'Võtta admini õigused ära? Voore saab ta edasi teha, raamlepingu andmeid enam mitte.'
      }
      hidden={{ userId, role: next }}
      className="inline"
    />
  );
}
