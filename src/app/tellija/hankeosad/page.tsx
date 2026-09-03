/** Hankeosad — the framework lots and their cascade configuration. */

import Link from 'next/link';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { lotPartners, lots, trainings } from '@/db/schema';
import { VISIBILITY_MODE_LABELS } from '@/domain/round-statuses';

export const dynamic = 'force-dynamic';

export default async function LotsPage() {
  const db = getDb();
  const rows = db.select().from(lots).all().sort((a, b) => a.code.localeCompare(b.code));

  const partnerCounts = new Map<string, number>();
  for (const member of db
    .select({ lotId: lotPartners.lotId })
    .from(lotPartners)
    .where(eq(lotPartners.isActive, true))
    .all()) {
    partnerCounts.set(member.lotId, (partnerCounts.get(member.lotId) ?? 0) + 1);
  }

  const trainingCounts = new Map<string, number>();
  for (const training of db.select({ lotId: trainings.lotId }).from(trainings).all()) {
    trainingCounts.set(training.lotId, (trainingCounts.get(training.lotId) ?? 0) + 1);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1>Hankeosad</h1>
        <p className="mt-1 max-w-[80ch] text-[var(--color-muted)]">
          Kaskaadi tingimused on hankeosa kaupa seadistatavad, sest raamlepingu täpne sõnastus tuleb
          spetsialistidega üle käia. Muudatused ei mõjuta käimasolevaid voore — iga voor kasutab
          avaldamisel külmutatud seadeid.
        </p>
      </div>

      <div className="kh-card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="kh-th">Kood</th>
              <th className="kh-th">Nimetus</th>
              <th className="kh-th">Partnereid</th>
              <th className="kh-th">Koolitusi</th>
              <th className="kh-th">Vastamistähtaeg</th>
              <th className="kh-th">Töömahu piir</th>
              <th className="kh-th">Vaikimisi nähtavus</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((lot) => (
              <tr key={lot.id}>
                <td className="kh-td font-semibold whitespace-nowrap">
                  <Link href={`/tellija/hankeosad/${lot.id}`} className="text-[var(--color-brand)]">
                    {lot.code}
                  </Link>
                </td>
                <td className="kh-td">{lot.name}</td>
                <td className="kh-td tabular-nums">{partnerCounts.get(lot.id) ?? 0}</td>
                <td className="kh-td tabular-nums">{trainingCounts.get(lot.id) ?? 0}</td>
                <td className="kh-td text-[13px] whitespace-nowrap">
                  {lot.responseDeadlineWorkingDays} tööpäeva, kell {lot.deadlineLocalTime}
                </td>
                <td className="kh-td text-[13px] whitespace-nowrap">
                  {lot.workloadThreshold}
                  {lot.thresholdNote && (
                    <span className="ml-1" style={{ color: 'var(--color-warning)' }} title={lot.thresholdNote}>
                      *
                    </span>
                  )}
                </td>
                <td className="kh-td text-[13px]">
                  {lot.defaultVisibilityMode === 'dynamic' ? 'Dünaamiline' : 'Suletud'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[12px] text-[var(--color-muted)]">
        * {rows.find((l) => l.thresholdNote)?.thresholdNote}
      </p>
    </div>
  );
}
