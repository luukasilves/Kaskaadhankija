/**
 * Meeskond — the buyer team [R-01].
 *
 * The list of addresses is the access list: members sign in with a code sent
 * to their address, so adding someone here is what grants them the tellija
 * role. Changing the list is for admins; everyone on the team can see it.
 */

import { getDb } from '@/db';
import { users } from '@/db/schema';
import { formatDateTimeShort } from '@/domain/format';
import { StatusBadge } from '@/components/status-badge';
import { requireBuyer } from '@/server/auth/actor';
import { AddTeamMemberForm, TeamMemberActiveToggle } from './team-forms';

export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  const actor = await requireBuyer();
  const isAdmin = actor.role === 'admin';
  const rows = getDb()
    .select()
    .from(users)
    .all()
    .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
      <div>
        <h1>Meeskond</h1>
        <p className="mt-1 max-w-[80ch] text-[var(--color-muted)]">
          Tellimismeeskonna liikmed, kes võivad tellijana tegutseda. Liige logib sisse oma e-postile
          saadetava ühekordse koodiga; aadress ei saa samal ajal olla partneri esindaja.
          {isAdmin ? '' : ' Liikmete lisamine ja deaktiveerimine on adminile.'}
        </p>
      </div>

      {isAdmin && <AddTeamMemberForm />}

      <div className="kh-card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="kh-th">Nimi</th>
              <th className="kh-th">E-post</th>
              <th className="kh-th">Roll</th>
              <th className="kh-th">Olek</th>
              <th className="kh-th">Lisatud</th>
              {isAdmin && <th className="kh-th"></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((user) => (
              <tr key={user.id} style={user.isActive ? undefined : { opacity: 0.6 }}>
                <td className="kh-td font-semibold">
                  {user.name}
                  {user.id === actor.userId && (
                    <span className="ml-2 text-[12px] font-normal text-[var(--color-muted)]">(sina)</span>
                  )}
                </td>
                <td className="kh-td font-mono text-[13px]">{user.email}</td>
                <td className="kh-td">{user.role === 'admin' ? 'Admin' : 'Liige'}</td>
                <td className="kh-td">
                  {user.isActive ? (
                    <StatusBadge label="Aktiivne" tone="success" />
                  ) : (
                    <StatusBadge label="Deaktiveeritud" tone="neutral" />
                  )}
                </td>
                <td className="kh-td tabular-nums text-[13px]">{formatDateTimeShort(user.createdAt)}</td>
                {isAdmin && (
                  <td className="kh-td text-right">
                    {user.id !== actor.userId && (
                      <TeamMemberActiveToggle userId={user.id} active={user.isActive} />
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
