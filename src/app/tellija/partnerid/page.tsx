/** Partnerid — the framework partners across all lots. */

import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { lotPartners, lots, partners } from '@/db/schema';
import { StatusBadge } from '@/components/status-badge';
import { workloadFor } from '@/server/rounds/views';

export const dynamic = 'force-dynamic';

export default async function PartnersPage() {
  const db = getDb();

  const rows = db.select().from(partners).all().sort((a, b) => a.name.localeCompare(b.name));
  const memberships = db
    .select({
      lotPartnerId: lotPartners.id,
      partnerId: lotPartners.partnerId,
      rank: lotPartners.rank,
      isActive: lotPartners.isActive,
      contactName: lotPartners.contactName,
      contactEmail: lotPartners.contactEmail,
      lotId: lots.id,
      lotCode: lots.code,
    })
    .from(lotPartners)
    .innerJoin(lots, eq(lots.id, lotPartners.lotId))
    .all();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1>Partnerid</h1>
          <p className="mt-1 max-w-[80ch] text-[var(--color-muted)]">
            Raamlepingu partnerid ja nende kohad hankeosade järjestuses. Järjestus imporditakse
            tabelina — sama kujul, nagu hanke tulemused saabuvad.
          </p>
        </div>
        <Link href="/tellija/partnerid/import" className="kh-btn kh-btn-primary">
          Impordi järjestus
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="kh-card p-6 text-[var(--color-muted)]">
          Partnereid ei ole veel sisestatud.
        </p>
      ) : (
        <div className="kh-card overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="kh-th">Partner</th>
                <th className="kh-th">Kontakt</th>
                <th className="kh-th">Hankeosad ja kohad</th>
                <th className="kh-th">Käimasolevaid koolitusi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((partner) => {
                const mine = memberships
                  .filter((m) => m.partnerId === partner.id)
                  .sort((a, b) => a.lotCode.localeCompare(b.lotCode));
                const contact = mine.find((m) => m.isActive) ?? mine[0];
                const workload = mine.reduce(
                  (sum, m) => sum + workloadFor(db, m.lotPartnerId),
                  0,
                );
                return (
                  <tr key={partner.id}>
                    <td className="kh-td">
                      <div className="font-semibold">{partner.name}</div>
                      <div className="text-[12px] text-[var(--color-muted)]">
                        Registrikood {partner.regCode}
                      </div>
                    </td>
                    <td className="kh-td text-[13px]">
                      {contact ? (
                        <>
                          {contact.contactName}
                          <div className="text-[12px] text-[var(--color-muted)]">
                            {contact.contactEmail}
                          </div>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="kh-td">
                      <div className="flex flex-wrap gap-1.5">
                        {mine.map((membership) => (
                          <Link
                            key={membership.lotPartnerId}
                            href={`/tellija/hankeosad/${membership.lotId}`}
                          >
                            <StatusBadge
                              label={`${membership.lotCode} · koht ${membership.rank}`}
                              tone={membership.isActive ? 'info' : 'neutral'}
                              title={membership.isActive ? 'Aktiivne osalus' : 'Osalus lõpetatud'}
                            />
                          </Link>
                        ))}
                        {mine.length === 0 && (
                          <span className="text-[13px] text-[var(--color-muted)]">
                            osalus puudub
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="kh-td tabular-nums">{workload}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
