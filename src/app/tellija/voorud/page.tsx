/** Voorud — every round, newest first. */

import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { lots, roundTrainings, rounds } from '@/db/schema';
import { formatDateTimeShort } from '@/domain/format';
import { ROUND_STATUS_LABELS, ROUND_STATUS_TONES } from '@/domain/round-statuses';
import { Countdown } from '@/components/countdown';
import { StatusBadge } from '@/components/status-badge';
import { readClock } from '@/server/clock';
import { runDueJobs } from '@/server/rounds/jobs';

export const dynamic = 'force-dynamic';

export default async function RoundsList() {
  runDueJobs();
  const db = getDb();
  const { nowMs } = readClock(db);

  const rows = db
    .select({
      id: rounds.id,
      code: rounds.code,
      status: rounds.status,
      lotCode: lots.code,
      lotName: lots.name,
      visibilityMode: rounds.visibilityMode,
      publishedAt: rounds.publishedAt,
      deadlineAt: rounds.deadlineAt,
      confirmedAt: rounds.confirmedAt,
      createdAt: rounds.createdAt,
    })
    .from(rounds)
    .innerJoin(lots, eq(lots.id, rounds.lotId))
    .orderBy(desc(rounds.createdAt))
    .all();

  const trainingCounts = new Map<string, number>();
  for (const link of db.select({ roundId: roundTrainings.roundId }).from(roundTrainings).all()) {
    trainingCounts.set(link.roundId, (trainingCounts.get(link.roundId) ?? 0) + 1);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1>Voorud</h1>
          <p className="mt-1 text-[var(--color-muted)]">
            Iga voor läheb korraga kõigile oma hankeosa aktiivsetele partneritele.
          </p>
        </div>
        <Link href="/tellija/voorud/uus" className="kh-btn kh-btn-primary">
          Uus voor
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="kh-card p-6 text-[var(--color-muted)]">Voore ei ole veel loodud.</p>
      ) : (
        <div className="kh-card overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="kh-th">Voor</th>
                <th className="kh-th">Hankeosa</th>
                <th className="kh-th">Olek</th>
                <th className="kh-th">Koolitusi</th>
                <th className="kh-th">Avaldatud</th>
                <th className="kh-th">Tähtaeg</th>
                <th className="kh-th">Nähtavus</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((round) => (
                <tr key={round.id}>
                  <td className="kh-td font-semibold whitespace-nowrap">
                    <Link
                      href={
                        round.status === 'closed'
                          ? `/tellija/voorud/${round.id}/ulevaatus`
                          : `/tellija/voorud/${round.id}`
                      }
                      className="text-[var(--color-brand)]"
                    >
                      {round.code}
                    </Link>
                  </td>
                  <td className="kh-td text-[13px] whitespace-nowrap">
                    {round.lotCode} — {round.lotName}
                  </td>
                  <td className="kh-td whitespace-nowrap">
                    <StatusBadge
                      label={ROUND_STATUS_LABELS[round.status]}
                      tone={ROUND_STATUS_TONES[round.status]}
                    />
                  </td>
                  <td className="kh-td tabular-nums">{trainingCounts.get(round.id) ?? 0}</td>
                  <td className="kh-td text-[13px] whitespace-nowrap tabular-nums">
                    {round.publishedAt ? formatDateTimeShort(round.publishedAt) : '—'}
                  </td>
                  <td className="kh-td text-[13px] whitespace-nowrap">
                    {round.deadlineAt ? (
                      <>
                        <span className="tabular-nums">{formatDateTimeShort(round.deadlineAt)}</span>
                        {round.status === 'open' && (
                          <>
                            {' · '}
                            <Countdown baseNowMs={nowMs} deadlineAt={round.deadlineAt} />
                          </>
                        )}
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="kh-td text-[13px] whitespace-nowrap">
                    {round.visibilityMode === 'dynamic' ? 'Dünaamiline' : 'Suletud'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
