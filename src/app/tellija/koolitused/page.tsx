/**
 * Koolituskalender — the procurement's trainings.
 *
 * This is where the synthetic dataset lands and where a buyer brings their own
 * table. Both paths run the same import code, so "load from database" and
 * "upload a table" cannot diverge.
 */

import { Fragment } from 'react';
import Link from 'next/link';
import { HIND } from '@/domain/pricing';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { buyerCanWrite } from '@/server/auth/actor';
import { lots, partners, lotPartners, trainings } from '@/db/schema';
import { describeGroups } from '@/domain/clusters';
import { formatEur, formatEventWhen, formatMonthLabel, formatPeriod, monthKey } from '@/domain/format';
import {
  TARGET_GROUPS,
  TRAINING_STATUS_LABELS,
  TRAINING_STATUS_TONES,
  type TrainingStatus,
} from '@/domain/round-statuses';
import { LANGUAGE_LABELS, WORKSHOP_TYPE_LABELS } from '@/domain/statuses';
import { StatusBadge } from '@/components/status-badge';

export const dynamic = 'force-dynamic';

const STATUS_ORDER: TrainingStatus[] = [
  'unassigned',
  'leftover',
  'in_round',
  'allocated',
  'completed',
  'cancelled',
];

export default async function TrainingsPage({
  searchParams,
}: {
  searchParams: Promise<{ olek?: string; hankeosa?: string; taitja?: string }>;
}) {
  const params = await searchParams;
  const db = getDb();
  const canWrite = await buyerCanWrite();

  const rows = db
    .select({
      id: trainings.id,
      code: trainings.code,
      title: trainings.title,
      workshopType: trainings.workshopType,
      eventDate: trainings.eventDate,
      eventEnd: trainings.eventEnd,
      dateKind: trainings.dateKind,
      clusterCode: trainings.clusterCode,
      groupIndex: trainings.groupIndex,
      county: trainings.county,
      targetGroup: trainings.targetGroup,
      participantCount: trainings.participantCount,
      language: trainings.language,
      estimatedValueEur: trainings.estimatedValueEur,
      status: trainings.status,
      allocatedLotPartnerId: trainings.allocatedLotPartnerId,
      lotCode: lots.code,
    })
    .from(trainings)
    .innerJoin(lots, eq(lots.id, trainings.lotId))
    .all();

  const holders = db
    .select({ lotPartnerId: lotPartners.id, partnerId: partners.id, name: partners.name })
    .from(lotPartners)
    .innerJoin(partners, eq(partners.id, lotPartners.partnerId))
    .all();
  const holderNames = new Map(holders.map((r) => [r.lotPartnerId, r.name] as const));
  const holderPartner = new Map(holders.map((r) => [r.lotPartnerId, r.partnerId] as const));

  const filtered = rows
    .filter((row) => !params.olek || row.status === params.olek)
    .filter((row) => !params.hankeosa || row.lotCode === params.hankeosa)
    .filter(
      (row) =>
        !params.taitja ||
        (row.allocatedLotPartnerId !== null && holderPartner.get(row.allocatedLotPartnerId) === params.taitja),
    )
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate) || a.code.localeCompare(b.code));

  // The partners who hold anything, for the „Täitja“ filter [N-01].
  const holdingPartners = [
    ...new Map(
      rows
        .filter((row) => row.allocatedLotPartnerId !== null)
        .map((row) => {
          const partnerId = holderPartner.get(row.allocatedLotPartnerId!) ?? '';
          return [partnerId, holderNames.get(row.allocatedLotPartnerId!) ?? ''] as const;
        }),
    ).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1]));

  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
  const lotCodes = [...new Set(rows.map((r) => r.lotCode))].sort();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1>Koolituskalender</h1>
          <p className="mt-1 text-[var(--color-muted)]">
            {rows.length} koolitust. Voorud koostatakse jaotamata ja jäägis olevatest koolitustest.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canWrite && (
            <Link href="/tellija/koolitused/import" className="kh-btn kh-btn-primary">
              Impordi tabel
            </Link>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <Link href="/tellija/koolitused" className="kh-btn" style={!params.olek && !params.hankeosa ? { background: 'var(--color-brand)', borderColor: 'var(--color-brand)', color: '#fff' } : undefined}>
          Kõik ({rows.length})
        </Link>
        {STATUS_ORDER.filter((status) => counts.get(status)).map((status) => (
          <Link
            key={status}
            href={`/tellija/koolitused?olek=${status}`}
            className="kh-btn"
            style={params.olek === status ? { background: 'var(--color-brand)', borderColor: 'var(--color-brand)', color: '#fff' } : undefined}
          >
            {TRAINING_STATUS_LABELS[status]} ({counts.get(status)})
          </Link>
        ))}
        <span className="mx-1 text-[var(--color-muted)]">·</span>
        {lotCodes.map((code) => (
          <Link
            key={code}
            href={`/tellija/koolitused?hankeosa=${code}`}
            className="kh-btn"
            style={params.hankeosa === code ? { background: 'var(--color-brand)', borderColor: 'var(--color-brand)', color: '#fff' } : undefined}
          >
            {code}
          </Link>
        ))}
        {holdingPartners.length > 0 && (
          <>
            <span className="mx-1 text-[var(--color-muted)]">· Täitja:</span>
            {holdingPartners.map(([partnerId, name]) => (
              <Link
                key={partnerId}
                href={`/tellija/koolitused?taitja=${partnerId}`}
                className="kh-btn"
                style={params.taitja === partnerId ? { background: 'var(--color-brand)', borderColor: 'var(--color-brand)', color: '#fff' } : undefined}
              >
                {name}
              </Link>
            ))}
          </>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="kh-card p-6 text-[var(--color-muted)]">
          Selle filtriga koolitusi ei ole.{' '}
          <Link href="/tellija/koolitused/import" className="text-[var(--color-brand)]">
            Impordi koolituskalender
          </Link>
          .
        </p>
      ) : (
        <div className="kh-card overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="kh-th">Kood</th>
                <th className="kh-th">Koolitus</th>
                <th className="kh-th">Osa</th>
                <th className="kh-th">Formaat</th>
                <th className="kh-th">Toimumine</th>
                <th className="kh-th">Maakond</th>
                <th className="kh-th">Sihtrühm</th>
                <th className="kh-th">{HIND.maxOsalejaid}</th>
                <th className="kh-th">Keel</th>
                <th className="kh-th">{HIND.tellijaHinnang}</th>
                <th className="kh-th">Olek</th>
                <th className="kh-th">Täitja</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, index) => (
                <Fragment key={row.id}>
                  {(index === 0 || monthKey(filtered[index - 1]!.eventDate) !== monthKey(row.eventDate)) && (
                    <tr>
                      <td
                        colSpan={12}
                        className="kh-td bg-[var(--color-surface-alt)] text-[12px] font-semibold uppercase tracking-wide text-[var(--color-muted)]"
                      >
                        {formatMonthLabel(row.eventDate)}
                      </td>
                    </tr>
                  )}
                  {/* [L-28] a cluster's groups sit under one header row */}
                  {row.clusterCode && (index === 0 || filtered[index - 1]!.clusterCode !== row.clusterCode) && (
                    <tr data-testid="cluster-header">
                      <td colSpan={12} className="kh-td text-[12.5px] font-semibold">
                        Klaster {row.clusterCode} · {row.title} · {formatPeriod(row.eventDate, row.eventEnd)} ·{' '}
                        {describeGroups(
                          filtered
                            .filter((r) => r.clusterCode === row.clusterCode)
                            .map((r) => ({ groupIndex: r.groupIndex ?? 0, participantCount: r.participantCount })),
                          [],
                        )}
                      </td>
                    </tr>
                  )}
                <tr>
                  <td className="kh-td font-semibold whitespace-nowrap">{row.code}</td>
                  <td className="kh-td">{row.title}</td>
                  <td className="kh-td whitespace-nowrap">{row.lotCode}</td>
                  <td className="kh-td text-[13px] whitespace-nowrap">
                    {WORKSHOP_TYPE_LABELS[row.workshopType]}
                  </td>
                  <td className="kh-td whitespace-nowrap tabular-nums">
                    {formatEventWhen(row)}
                  </td>
                  <td className="kh-td text-[13px] whitespace-nowrap">{row.county}</td>
                  <td className="kh-td text-[13px] whitespace-nowrap">
                    {TARGET_GROUPS[row.targetGroup]}
                  </td>
                  <td className="kh-td tabular-nums">{row.participantCount}</td>
                  <td className="kh-td text-[13px] whitespace-nowrap">
                    {LANGUAGE_LABELS[row.language]}
                  </td>
                  <td className="kh-td whitespace-nowrap tabular-nums">
                    {row.estimatedValueEur > 0 ? formatEur(row.estimatedValueEur) : '—'}
                  </td>
                  <td className="kh-td whitespace-nowrap">
                    <StatusBadge
                      label={TRAINING_STATUS_LABELS[row.status]}
                      tone={TRAINING_STATUS_TONES[row.status]}
                    />
                  </td>
                  <td className="kh-td text-[13px]">
                    {row.allocatedLotPartnerId
                      ? holderNames.get(row.allocatedLotPartnerId) ?? '—'
                      : '—'}
                  </td>
                </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
