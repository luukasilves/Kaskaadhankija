/**
 * Esindajad — the partners' contractual representatives [R-02][D-10].
 *
 * The list the buyer uploads decides who receives a company's formal notices
 * and who may sign in for it. Shown per company, with the lot contact from the
 * framework membership alongside, since that is the fallback recipient when a
 * company has no active representative.
 */

import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { lotPartners, partnerRepresentatives, partners } from '@/db/schema';
import { formatDateTimeShort } from '@/domain/format';
import { REPRESENTATIVE_ROLE_LABELS } from '@/domain/round-statuses';
import { StatusBadge } from '@/components/status-badge';
import { RepresentativeActiveToggle } from './representative-forms';
import { buyerCanWrite } from '@/server/auth/actor';

export const dynamic = 'force-dynamic';

export default async function RepresentativesPage() {
  const db = getDb();
  const canWrite = await buyerCanWrite();
  const companies = db
    .select()
    .from(partners)
    .where(eq(partners.isActive, true))
    .all()
    .sort((a, b) => a.name.localeCompare(b.name));
  const representatives = db.select().from(partnerRepresentatives).all();
  const contacts = db
    .select({ partnerId: lotPartners.partnerId, contactName: lotPartners.contactName, contactEmail: lotPartners.contactEmail, isActive: lotPartners.isActive })
    .from(lotPartners)
    .all();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/tellija/partnerid" className="text-[13px] text-[var(--color-brand)]">
            ← Partnerid
          </Link>
          <h1 className="mt-1">Esindajad</h1>
          <p className="mt-1 max-w-[80ch] text-[var(--color-muted)]">
            Partnerite lepingulised esindajad ja nende asendajad. Nad saavad vooru formaalsed teated
            e-postiga ja saavad oma aadressiga sisse logida. Ilma esindajateta läheb post
            raamlepingu kontaktisikule.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/tellija/partnerid/esindajad/mall" className="kh-btn">
            Laadi alla mall (.xlsx)
          </a>
          {canWrite && (
            <Link href="/tellija/partnerid/esindajad/import" className="kh-btn kh-btn-primary">
              Impordi esindajad
            </Link>
          )}
        </div>
      </div>

      {companies.length === 0 ? (
        <p className="kh-card p-6 text-[var(--color-muted)]">Partnereid ei ole veel sisestatud.</p>
      ) : (
        <div className="space-y-3">
          {companies.map((company) => {
            const mine = representatives
              .filter((r) => r.partnerId === company.id)
              .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name));
            const contact = contacts.find((c) => c.partnerId === company.id && c.isActive) ?? contacts.find((c) => c.partnerId === company.id);
            const activeCount = mine.filter((r) => r.isActive).length;
            return (
              <section key={company.id} className="kh-card p-4" data-testid="representatives-company">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2>{company.name}</h2>
                  <span className="text-[12px] text-[var(--color-muted)]">
                    Registrikood {company.regCode}
                    {contact ? ` · raamlepingu kontakt: ${contact.contactName} <${contact.contactEmail}>` : ''}
                  </span>
                </div>
                {mine.length === 0 ? (
                  <p className="mt-2 text-[13px] text-[var(--color-muted)]">
                    Esindajaid ei ole laaditud — teated lähevad raamlepingu kontaktisikule.
                  </p>
                ) : (
                  <table className="mt-3 w-full">
                    <thead>
                      <tr>
                        <th className="kh-th">Nimi</th>
                        <th className="kh-th">Roll</th>
                        <th className="kh-th">E-post</th>
                        <th className="kh-th">Telefon</th>
                        <th className="kh-th">Olek</th>
                        <th className="kh-th"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {mine.map((rep) => (
                        <tr key={rep.id} style={rep.isActive ? undefined : { opacity: 0.6 }}>
                          <td className="kh-td font-semibold">{rep.name}</td>
                          <td className="kh-td text-[13px]">{REPRESENTATIVE_ROLE_LABELS[rep.role] ?? rep.role}</td>
                          <td className="kh-td font-mono text-[13px]">{rep.email}</td>
                          <td className="kh-td text-[13px]">{rep.phone || '—'}</td>
                          <td className="kh-td">
                            {rep.isActive ? (
                              <StatusBadge label="Aktiivne" tone="success" />
                            ) : (
                              <StatusBadge
                                label="Lõpetatud"
                                tone="neutral"
                                title={rep.deactivatedAt ? formatDateTimeShort(rep.deactivatedAt) : undefined}
                              />
                            )}
                          </td>
                          <td className="kh-td text-right">
                            {canWrite && (
                              <RepresentativeActiveToggle id={rep.id} active={rep.isActive} />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {mine.length > 0 && activeCount === 0 && (
                  <p className="mt-2 text-[13px] text-[var(--color-warning)]">
                    Ühtegi aktiivset esindajat ei ole — teated lähevad raamlepingu kontaktisikule.
                  </p>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
