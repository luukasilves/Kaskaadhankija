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
import { BUYER_ROLE_LABELS } from '@/domain/round-statuses';
import { StatusBadge } from '@/components/status-badge';
import { requireBuyer } from '@/server/auth/actor';
import { adminAllowlist } from '@/server/auth/codes';
import {
  AddTeamMemberForm,
  TeamMemberActiveToggle,
  TeamMemberRoleToggle,
} from './team-forms';

export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  const actor = await requireBuyer();
  const isAdmin = actor.role === 'admin';
  const allowlist = adminAllowlist();
  const allowlistSize = allowlist.addresses.length + allowlist.domains.length;
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
          Kes võib tellijana tegutseda. Igaüks logib sisse oma e-postile saadetava ühekordse
          koodiga; aadress ei saa samal ajal olla partneri esindaja. <strong>Hankija</strong> teeb
          voore algusest lõpuni, <strong>admin</strong> muudab lisaks raamhanke andmeid ja seda
          loendit.
          {isAdmin ? '' : ' Kasutajate lisamine, rolli muutmine ja deaktiveerimine on admini õigus.'}
        </p>
        {allowlistSize > 0 && (
          <p
            className="mt-3 max-w-[80ch] rounded-md border px-3 py-2 text-[13px]"
            style={{ borderColor: 'var(--color-warning)', background: 'var(--color-warning-soft)' }}
            data-testid="allowlist-note"
          >
            <strong>Lubatud aadresside loend on seadistatud</strong>{' '}
            ({allowlist.addresses.length} nimeline aadress
            {allowlist.domains.length > 0 ? `, ${allowlist.domains.length} terve domeen` : ''}).
            Neilt aadressidelt saab keegi ise sisse logida ja lisatakse esimesel sisselogimisel{' '}
            <strong>adminina</strong>, ilma et keegi ta siia lisaks; loendisse ilmub ta alles siis,
            kui on koodi kasutanud. Kõik ülejäänud lisab admin siin, ja need inimesed algavad
            hankijana. Deaktiveeritud kasutajat loend tagasi ei too.
            {allowlist.domains.length > 0
              ? ' Terve domeen tähendab, et iga selle postkasti valdaja saab adminiks — päris hankes peaks loend olema nimeline.'
              : ''}
          </p>
        )}
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
                <td className="kh-td">{BUYER_ROLE_LABELS[user.role]}</td>
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
                      <span className="inline-flex flex-wrap justify-end gap-1.5">
                        {user.isActive && (
                          <TeamMemberRoleToggle userId={user.id} role={user.role} />
                        )}
                        <TeamMemberActiveToggle userId={user.id} active={user.isActive} />
                      </span>
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
