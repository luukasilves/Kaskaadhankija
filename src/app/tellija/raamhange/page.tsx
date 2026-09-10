/**
 * „Raamhange“ — the framework's own data [L-21].
 *
 * One screen for everything that describes the procurement rather than a round:
 * which agreement this is, its lots and their cascade settings, each lot's
 * ranking with the official contacts, and the extra representatives. Editable
 * two ways — a workbook in, or a field at a time — because both are what the
 * team actually does, and both go through the same writers.
 *
 * The change log sits at the bottom rather than on a separate page: these edits
 * decide who gets offered work and who can sign in, so seeing them accumulate
 * where they are made is the point.
 */

import Link from 'next/link';
import { getDb } from '@/db';
import { partners } from '@/db/schema';
import { CAP_OPTIONS_LABELS } from '@/domain/round-statuses';
import { formatDateTimeShort, formatEur, formatIsoDay } from '@/domain/format';
import { frameworkSubtitle } from '@/domain/framework';
import { buyerCanWrite } from '@/server/auth/actor';
import { frameworkChangeLog, frameworkIdentity, frameworkLots, representativesOf } from '@/server/framework';
import { ReadOnlyNote } from '@/components/read-only-note';
import { StatusBadge } from '@/components/status-badge';
import {
  AddLotPartnerForm,
  DeactivateLotButton,
  EditRepresentativeForm,
  FrameworkIdentityForm,
  FrameworkUploadForm,
  MemberRowForms,
  RepresentativeForms,
} from './framework-forms';

export const dynamic = 'force-dynamic';

const SAMPLE_FILES = [
  { file: 'naidis-raamhange.xlsx', label: 'Näidis: raamhanke andmed' },
  { file: 'naidis-koolituskalender.xlsx', label: 'Näidis: koolituskalender' },
  { file: 'naidis-voor.xlsx', label: 'Näidis: ühe vooru skeem' },
];

export default async function FrameworkPage() {
  const db = getDb();
  const canWrite = await buyerCanWrite();
  const identity = frameworkIdentity(db);
  const lots = frameworkLots(db);
  const log = frameworkChangeLog(db, 40);

  const partnerRows = db.select().from(partners).all();

  return (
    <div className="space-y-6">
      <div>
        <h1>Raamhanke andmed</h1>
        <p className="mt-1 max-w-[85ch] text-[var(--color-muted)]">
          {frameworkSubtitle(identity)} · {lots.filter((lot) => lot.isActive).length} hankeosa.
          Siin on kõik, mis kirjeldab raamhanget ennast: hankeosad, partnerite järjestus ja
          raamlepingu kontaktisikud. <strong>Kontaktisiku aadress on ühtaegu partneri
          sisselogimine</strong> — teated lähevad sellele ja sellega saab ta vooru vastata.
        </p>
      </div>

      {!canWrite && <ReadOnlyNote what="Raamhanke andmete muutmine" />}

      {canWrite ? (
        <FrameworkIdentityForm
          identity={{
            title: identity.title,
            procurementReference: identity.procurementReference,
            agreementReference: identity.agreementReference,
            buyerName: identity.buyerName,
            validUntil: identity.validUntil ?? '',
          }}
        />
      ) : (
        <section className="kh-card p-4">
          <h2>Raamhange</h2>
          <dl className="mt-2 grid gap-2 text-[13px] sm:grid-cols-2">
            <div>
              <dt className="text-[var(--color-muted)]">Nimetus</dt>
              <dd className="font-semibold">{identity.title}</dd>
            </div>
            <div>
              <dt className="text-[var(--color-muted)]">Riigihanke viitenumber</dt>
              <dd className="font-semibold">{identity.procurementReference}</dd>
            </div>
            <div>
              <dt className="text-[var(--color-muted)]">Tellija</dt>
              <dd className="font-semibold">{identity.buyerName}</dd>
            </div>
            <div>
              <dt className="text-[var(--color-muted)]">Kehtib kuni</dt>
              <dd className="font-semibold">
                {identity.validUntil ? formatIsoDay(identity.validUntil) : 'tähtajatu'}
              </dd>
            </div>
          </dl>
        </section>
      )}

      {/* ---------------- the workbook ---------------- */}
      <section className="grid gap-3 lg:grid-cols-2">
        <div className="kh-card p-4">
          <h2>Failid</h2>
          <p className="mt-1 text-[13px] text-[var(--color-muted)]">
            Lae praegused andmed alla, muuda ja laadi tagasi — see on turvaline tee, sest tühi
            lahter tähendab „jäta muutmata“.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href="/tellija/raamhange/mall" className="kh-btn kh-btn-primary" data-testid="download-framework">
              Laadi alla praegused andmed (.xlsx)
            </a>
            <Link href="/tellija/voorud/import" className="kh-btn">
              Vooru skeem
            </Link>
            <Link href="/tellija/koolitused/import" className="kh-btn">
              Koolituskalender
            </Link>
          </div>
          <p className="mt-4 text-[12.5px] font-semibold">Näidisfailid</p>
          <ul className="mt-1 space-y-1 text-[13px]">
            {SAMPLE_FILES.map((sample) => (
              <li key={sample.file}>
                <a
                  href={`/tellija/raamhange/naidis/${sample.file}`}
                  className="text-[var(--color-brand)]"
                >
                  {sample.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        {canWrite && <FrameworkUploadForm />}
      </section>

      {/* ---------------- lots and their ranking ---------------- */}
      {lots.map((lot) => (
        <section key={lot.id} id={`lot-${lot.code}`} className="kh-card">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3">
            <div>
              <h2>
                <Link href={`/tellija/hankeosad/${lot.id}`} className="text-[var(--color-brand)]">
                  {lot.code}
                </Link>{' '}
                — {lot.name}
                {!lot.isActive && (
                  <span className="ml-2">
                    <StatusBadge label="raamhankest väljas" tone="neutral" />
                  </span>
                )}
              </h2>
              {lot.description && (
                <p className="mt-1 max-w-[80ch] text-[12.5px] text-[var(--color-muted)]">
                  {lot.description}
                </p>
              )}
            </div>
            {canWrite && lot.isActive && <DeactivateLotButton lotId={lot.id} blockers={lot.blockers} />}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="kh-th">Koht</th>
                  <th className="kh-th">Partner</th>
                  <th className="kh-th">Raamlepingu kontaktisik</th>
                  <th className="kh-th">Sisselogimine</th>
                  <th className="kh-th">Ühikhind</th>
                  {canWrite && <th className="kh-th" />}
                </tr>
              </thead>
              <tbody>
                {lot.members.length === 0 && (
                  <tr>
                    <td className="kh-td text-[var(--color-muted)]" colSpan={canWrite ? 6 : 5}>
                      Selles hankeosas ei ole veel partnereid.
                    </td>
                  </tr>
                )}
                {lot.members.map((member) => {
                  const activeMembers = lot.members.filter((m) => m.isActive);
                  const position = activeMembers.findIndex((m) => m.lotPartnerId === member.lotPartnerId);
                  return (
                    <tr key={member.lotPartnerId} style={member.isActive ? undefined : { opacity: 0.55 }}>
                      <td className="kh-td tabular-nums">{member.rank}</td>
                      <td className="kh-td">
                        <div className="font-semibold">{member.partnerName}</div>
                        <div className="text-[12px] text-[var(--color-muted)]">
                          Registrikood {member.regCode}
                        </div>
                      </td>
                      <td className="kh-td text-[13px]">
                        {member.contactName}
                        <div className="text-[12px] text-[var(--color-muted)]">{member.contactEmail}</div>
                      </td>
                      <td className="kh-td">
                        {member.signIn.active ? (
                          <StatusBadge label="aktiivne" tone="success" />
                        ) : (
                          <StatusBadge label="puudub" tone="warning" title={member.signIn.reason} />
                        )}
                      </td>
                      <td className="kh-td whitespace-nowrap tabular-nums">
                        {formatEur(member.unitPriceEur)}
                      </td>
                      {canWrite && (
                        <td className="kh-td">
                          <MemberRowForms
                            member={member}
                            isFirst={position === 0}
                            isLast={position === activeMembers.length - 1}
                          />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {canWrite && lot.isActive && (
            <div className="border-t border-[var(--color-border)] p-3">
              <AddLotPartnerForm lotId={lot.id} lotCode={lot.code} />
            </div>
          )}
        </section>
      ))}

      {/* ---------------- representatives ---------------- */}
      <section className="kh-card">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3">
          <div>
            <h2>Esindajad</h2>
            <p className="mt-0.5 max-w-[80ch] text-[12.5px] text-[var(--color-muted)]">
              Raamlepingu kontaktisikud on siin automaatselt — neid hallatakse ülal järjestuse
              ridadel. Siia saab lisada asendajaid ja teisi, kes tohivad ettevõtte eest vastata.
            </p>
          </div>
          <Link href="/tellija/partnerid/esindajad" className="kh-btn">
            Kogu loend
          </Link>
        </div>
        <div className="divide-y divide-[var(--color-border)]">
          {partnerRows
            .filter((partner) => partner.isActive)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((partner) => {
              const people = representativesOf(db, partner.id);
              return (
                <div key={partner.id} className="space-y-2 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{partner.name}</span>
                    {canWrite && (
                      <RepresentativeForms partnerId={partner.id} partnerName={partner.name} />
                    )}
                  </div>
                  {people.length === 0 ? (
                    <p className="text-[12.5px] text-[var(--color-muted)]">
                      Ühtki esindajat ei ole — teated lähevad raamlepingu kontaktisikule.
                    </p>
                  ) : (
                    <ul className="space-y-1 text-[13px]">
                      {people.map((person) => (
                        <li
                          key={person.id}
                          className="flex flex-wrap items-center gap-2"
                          style={person.isActive ? undefined : { opacity: 0.55 }}
                        >
                          <span className="font-semibold">{person.name}</span>
                          <span className="text-[var(--color-muted)]">{person.email}</span>
                          <StatusBadge
                            label={person.role === 'esindaja' ? 'Esindaja' : 'Asendaja'}
                            tone="neutral"
                          />
                          {person.source === 'framework' && (
                            <StatusBadge label="raamlepingu kontakt" tone="info" />
                          )}
                          {!person.isActive && <StatusBadge label="lõpetatud" tone="neutral" />}
                          {canWrite && person.isActive && (
                            <EditRepresentativeForm
                              representative={{
                                id: person.id,
                                name: person.name,
                                email: person.email,
                                role: person.role,
                                phone: person.phone,
                                isActive: person.isActive,
                                source: person.source,
                              }}
                            />
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
        </div>
      </section>

      {/* ---------------- the change log ---------------- */}
      <section className="kh-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3">
          <div>
            <h2>Muudatuste logi</h2>
            <p className="mt-0.5 text-[12.5px] text-[var(--color-muted)]">
              Iga raamhanke andmete muudatus — nii failist kui käsitsi — koos tegijaga. Sama kanne
              on ka auditijäljes.
            </p>
          </div>
          <Link href="/tellija/auditilogi" className="kh-btn">
            Kogu auditijälg
          </Link>
        </div>
        {log.length === 0 ? (
          <p className="p-4 text-[13px] text-[var(--color-muted)]">Muudatusi ei ole veel tehtud.</p>
        ) : (
          <ul className="divide-y divide-[var(--color-border)]" data-testid="framework-change-log">
            {log.map((event) => (
              <li key={event.id} className="px-4 py-2.5">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-[12px] text-[var(--color-muted)] tabular-nums">
                    {formatDateTimeShort(event.occurredAt)}
                  </span>
                  <code className="text-[11.5px] text-[var(--color-muted)]">{event.eventType}</code>
                </div>
                <div className="text-[13px]">{event.summary}</div>
                <div className="text-[11.5px] text-[var(--color-muted)]">
                  {event.actorLabel}
                  {event.viaLabel && ` · testkeskkonnas tegutses: ${event.viaLabel}`}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-[12px] text-[var(--color-muted)]">
        Hankeosa kaskaadiseaded — vastamisaken, ülevaatuse aeg, koormuse künnis, vaikimisi
        nähtavus ja piirmäära valikud — on iga hankeosa enda lehel. Piirmäära valikud:{' '}
        {Object.values(CAP_OPTIONS_LABELS).join(', ')}.
      </p>
    </div>
  );
}
