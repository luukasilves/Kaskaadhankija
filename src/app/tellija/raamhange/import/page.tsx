/**
 * What the uploaded framework workbook would do [L-21].
 *
 * Nothing is written until this page is confirmed, and the file is uploaded
 * once. Four sections, in the order the apply runs them, and every refusal
 * named — including the two that are easy to miss: a partner who would lose
 * their place, and a contact address that cannot become a sign-in.
 */

import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { importBatches } from '@/db/schema';
import { buyerIsAdmin } from '@/server/auth/actor';
import { formatDateTimeShort, formatEur, formatIsoDay } from '@/domain/format';
import { CAP_OPTIONS_SHEET_WORDS, VISIBILITY_SHEET_WORDS } from '@/domain/round-definition';
import type { FrameworkImportPayload } from '@/server/import/framework-import';
import { ReadOnlyNote } from '@/components/read-only-note';
import { StatusBadge } from '@/components/status-badge';
import { FrameworkImportActions, FrameworkUploadForm } from '../framework-forms';

export const dynamic = 'force-dynamic';

function Diagnostics({ items }: { items: Array<{ field?: string; message: string }> }) {
  if (items.length === 0) return null;
  return (
    <ul className="space-y-0.5 text-[12px]" style={{ color: 'var(--color-danger)' }}>
      {items.map((item, index) => (
        <li key={index}>
          {item.field ? `${item.field}: ` : ''}
          {item.message}
        </li>
      ))}
    </ul>
  );
}

export default async function FrameworkImportPage({
  searchParams,
}: {
  searchParams: Promise<{ batch?: string }>;
}) {
  const { batch } = await searchParams;
  const db = getDb();

  if (!(await buyerIsAdmin())) {
    return (
      <div className="space-y-4">
        <div>
          <Link href="/tellija/raamhange" className="text-[13px] text-[var(--color-brand)]">
            ← Raamhange
          </Link>
          <h1 className="mt-1">Raamhanke andmete import</h1>
        </div>
        <ReadOnlyNote what="Raamhanke andmete import" />
      </div>
    );
  }

  const stored = batch
    ? db.select().from(importBatches).where(eq(importBatches.id, batch)).get()
    : undefined;

  if (!stored || stored.kind !== 'framework') {
    return (
      <div className="space-y-4">
        <div>
          <Link href="/tellija/raamhange" className="text-[13px] text-[var(--color-brand)]">
            ← Raamhange
          </Link>
          <h1 className="mt-1">Raamhanke andmete import</h1>
          <p className="mt-1 text-[var(--color-muted)]">
            Vali töövihik või kleebi read; eelvaade näitab, mis muutuks.
          </p>
        </div>
        <FrameworkUploadForm />
      </div>
    );
  }

  const payload = stored.rowsJson as FrameworkImportPayload;
  const canApply =
    stored.status === 'previewed' &&
    !(payload.framework.present && !payload.framework.value) &&
    !payload.lots.rows.some((row) => row.value === null) &&
    payload.lots.fileErrors.length === 0 &&
    payload.partners.rows.length > 0 &&
    !payload.partners.rows.some((row) => row.value === null) &&
    !payload.representatives.rows.some((row) => row.value === null);

  const identityChanges = payload.framework.value
    ? (
        [
          ['Nimetus', payload.framework.current.title, payload.framework.value.title],
          ['Viitenumber', payload.framework.current.procurementReference, payload.framework.value.procurementReference],
          ['Raamlepingu number', payload.framework.current.agreementReference, payload.framework.value.agreementReference],
          ['Tellija', payload.framework.current.buyerName, payload.framework.value.buyerName],
          [
            'Kehtib kuni',
            payload.framework.current.validUntil ? formatIsoDay(payload.framework.current.validUntil) : '—',
            payload.framework.value.validUntil ? formatIsoDay(payload.framework.value.validUntil) : '—',
          ],
        ] as const
      ).filter(([, before, after]) => before !== after)
    : [];

  return (
    <div className="space-y-5">
      <div>
        <Link href="/tellija/raamhange" className="text-[13px] text-[var(--color-brand)]">
          ← Raamhange
        </Link>
        <h1 className="mt-1">Raamhanke andmete import</h1>
        <p className="mt-1 text-[var(--color-muted)]">
          {stored.fileName} · {formatDateTimeShort(stored.createdAt)} ·{' '}
          {stored.status === 'previewed' ? 'ootab kinnitust' : stored.status === 'imported' ? 'imporditud' : 'kõrvale jäetud'}
        </p>
      </div>

      {!canApply && stored.status === 'previewed' && (
        <p
          className="rounded-md border px-3 py-2 text-[13px] font-semibold"
          style={{
            borderColor: 'var(--color-danger)',
            background: 'var(--color-danger-soft)',
            color: 'var(--color-danger)',
          }}
          data-testid="framework-import-blocked"
        >
          Faili ei saa importida enne, kui kõik read on korras — raamhanke andmed lähevad sisse
          tervikuna või mitte üldse.
        </p>
      )}

      {/* 1. identity */}
      <section className="kh-card p-4">
        <h2>Raamleping</h2>
        {!payload.framework.present ? (
          <p className="mt-1 text-[13px] text-[var(--color-muted)]">
            Lehte „Raamleping“ failis ei olnud — praegused andmed jäävad muutmata.
          </p>
        ) : payload.framework.errors.length > 0 ? (
          <div className="mt-2">
            <Diagnostics items={payload.framework.errors} />
          </div>
        ) : identityChanges.length === 0 ? (
          <p className="mt-1 text-[13px] text-[var(--color-muted)]">Midagi ei muutu.</p>
        ) : (
          <table className="mt-2 w-full">
            <thead>
              <tr>
                <th className="kh-th">Väli</th>
                <th className="kh-th">Praegu</th>
                <th className="kh-th">Failis</th>
              </tr>
            </thead>
            <tbody>
              {identityChanges.map(([field, before, after]) => (
                <tr key={field}>
                  <td className="kh-td">{field}</td>
                  <td className="kh-td text-[var(--color-muted)]">{before || '—'}</td>
                  <td className="kh-td font-semibold">{after || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* 2. lots */}
      <section className="kh-card p-4">
        <h2>Hankeosad</h2>
        {!payload.lots.present ? (
          <p className="mt-1 text-[13px] text-[var(--color-muted)]">
            Lehte „Hankeosad“ failis ei olnud — hankeosad jäävad muutmata.
          </p>
        ) : (
          <>
            <Diagnostics items={payload.lots.fileErrors} />
            <div className="mt-2 overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="kh-th">Rida</th>
                    <th className="kh-th">Kood</th>
                    <th className="kh-th">Nimetus</th>
                    <th className="kh-th">Vastamisaken</th>
                    <th className="kh-th">Künnis</th>
                    <th className="kh-th">Nähtavus</th>
                    <th className="kh-th">Piirmäär</th>
                    <th className="kh-th">Mis juhtub</th>
                  </tr>
                </thead>
                <tbody>
                  {payload.lots.rows.map((row) => (
                    <tr key={row.rowNumber}>
                      <td className="kh-td tabular-nums">{row.rowNumber}</td>
                      <td className="kh-td font-semibold">{row.value?.code ?? '—'}</td>
                      <td className="kh-td">{row.value?.name ?? '—'}</td>
                      <td className="kh-td tabular-nums">
                        {row.value?.responseDeadlineWorkingDays ?? '·'}{' '}
                        {row.value?.deadlineLocalTime ? `· ${row.value.deadlineLocalTime}` : ''}
                      </td>
                      <td className="kh-td tabular-nums">{row.value?.workloadThreshold ?? '·'}</td>
                      <td className="kh-td">
                        {row.value?.defaultVisibilityMode
                          ? VISIBILITY_SHEET_WORDS[row.value.defaultVisibilityMode]
                          : '·'}
                      </td>
                      <td className="kh-td">
                        {row.value?.defaultCapOptions
                          ? CAP_OPTIONS_SHEET_WORDS[row.value.defaultCapOptions]
                          : '·'}
                      </td>
                      <td className="kh-td">
                        {row.errors.length > 0 ? (
                          <Diagnostics items={row.errors} />
                        ) : row.action === 'created' ? (
                          <StatusBadge label="uus" tone="success" />
                        ) : (
                          <StatusBadge label="uuendatakse" tone="info" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[12px] text-[var(--color-muted)]">
              Punkt tähendab tühja lahtrit: see seade jääb muutmata.
            </p>
            {payload.lots.toDeactivate.length > 0 && (
              <div className="mt-3">
                <p className="text-[13px] font-semibold">Failist puuduvad hankeosad</p>
                <ul className="mt-1 space-y-0.5 text-[13px]">
                  {payload.lots.toDeactivate.map((lot) => (
                    <li key={lot.code}>
                      {lot.code} — {lot.name}:{' '}
                      {lot.blockedBy.length > 0 ? (
                        <span style={{ color: 'var(--color-warning)' }}>
                          jääb alles, voorud {lot.blockedBy.join(', ')}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-danger)' }}>arvatakse raamhankest välja</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>

      {/* 3. the ranking */}
      <section className="kh-card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2>Partnerid järjestuses</h2>
          <p className="text-[13px] text-[var(--color-muted)]">
            {payload.partners.created} uut · {payload.partners.updated} uuendatakse
            {payload.partners.openRoundCount > 0 && ` · ${payload.partners.openRoundCount} avatud voor ei muutu`}
          </p>
        </div>
        <Diagnostics items={payload.partners.fileErrors} />
        <div className="mt-2 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="kh-th">Rida</th>
                <th className="kh-th">Hankeosa</th>
                <th className="kh-th">Koht</th>
                <th className="kh-th">Partner</th>
                <th className="kh-th">Kontaktisik</th>
                <th className="kh-th">Ühikhind</th>
                <th className="kh-th">Mis juhtub</th>
              </tr>
            </thead>
            <tbody>
              {payload.partners.rows.map((row) => (
                <tr key={row.rowNumber}>
                  <td className="kh-td tabular-nums">{row.rowNumber}</td>
                  <td className="kh-td">{row.value?.lotCode ?? '—'}</td>
                  <td className="kh-td tabular-nums">{row.value?.rank ?? '—'}</td>
                  <td className="kh-td">
                    {row.value?.partnerName ?? '—'}
                    {row.value && (
                      <div className="text-[12px] text-[var(--color-muted)]">{row.value.regCode}</div>
                    )}
                  </td>
                  <td className="kh-td text-[13px]">
                    {row.value?.contactName ?? '—'}
                    {row.value && (
                      <div className="text-[12px] text-[var(--color-muted)]">{row.value.contactEmail}</div>
                    )}
                  </td>
                  <td className="kh-td whitespace-nowrap tabular-nums">
                    {row.value ? formatEur(row.value.unitPriceEur) : '—'}
                  </td>
                  <td className="kh-td">
                    {row.errors.length > 0 ? (
                      <Diagnostics items={row.errors} />
                    ) : (
                      <StatusBadge label={row.action ?? 'salvestatakse'} tone="info" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {payload.partners.wouldDeactivate.length > 0 && (
          <div className="mt-3">
            <p className="text-[13px] font-semibold">Failist puuduvad partnerid</p>
            <ul className="mt-1 space-y-0.5 text-[13px]">
              {payload.partners.wouldDeactivate.map((member) => (
                <li key={`${member.lotCode}-${member.partnerName}`}>
                  {member.lotCode} · {member.partnerName} (koht {member.rank})
                  {member.inOpenRound && (
                    <span style={{ color: 'var(--color-warning)' }}> — osaleb avatud voorus</span>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[12px] text-[var(--color-muted)]">
              „Lõpeta puuduvad“ oli valitud: nende osalus lõpetatakse. Avatud voorud kasutavad
              avaldamisel külmutatud järjestust, seega need ei muutu.
            </p>
          </div>
        )}
      </section>

      {/* 4. extra representatives */}
      <section className="kh-card p-4">
        <h2>Esindajad</h2>
        {!payload.representatives.present ? (
          <p className="mt-1 text-[13px] text-[var(--color-muted)]">
            Lehte „Esindajad“ failis ei olnud — esindajad jäävad muutmata. Raamlepingu
            kontaktisikud tekivad järjestusest automaatselt.
          </p>
        ) : (
          <>
            <Diagnostics items={payload.representatives.fileErrors} />
            <table className="mt-2 w-full">
              <thead>
                <tr>
                  <th className="kh-th">Rida</th>
                  <th className="kh-th">Partner</th>
                  <th className="kh-th">Nimi</th>
                  <th className="kh-th">E-post</th>
                  <th className="kh-th">Roll</th>
                  <th className="kh-th">Mis juhtub</th>
                </tr>
              </thead>
              <tbody>
                {payload.representatives.rows.map((row) => (
                  <tr key={row.rowNumber}>
                    <td className="kh-td tabular-nums">{row.rowNumber}</td>
                    <td className="kh-td">{row.partnerName || row.value?.regCode || '—'}</td>
                    <td className="kh-td">{row.value?.name ?? '—'}</td>
                    <td className="kh-td text-[13px]">{row.value?.email ?? '—'}</td>
                    <td className="kh-td">{row.value?.role ?? '—'}</td>
                    <td className="kh-td">
                      {row.errors.length > 0 ? (
                        <Diagnostics items={row.errors} />
                      ) : (
                        <StatusBadge label="salvestatakse" tone="info" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      {stored.status === 'previewed' && (
        <FrameworkImportActions batchId={stored.id} canApply={canApply} />
      )}
    </div>
  );
}
