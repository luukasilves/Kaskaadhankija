'use client';

import { ActionForm } from '@/components/action-form';
import { addTeamMemberAction, setTeamMemberActiveAction } from '@/server/actions/team';

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
            <option value="member">Liige</option>
            <option value="admin">Admin</option>
          </select>
        </label>
      </div>
      <p className="text-[12.5px] text-[var(--color-muted)]">
        Paroole ei ole: liige logib sisse oma e-postile saadetava ühekordse koodiga.
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
      confirm={active ? 'Deaktiveerida see liige? Ta ei saa enam sisse logida.' : undefined}
      hidden={{ userId, active: active ? '0' : '1' }}
      className="inline"
    />
  );
}
