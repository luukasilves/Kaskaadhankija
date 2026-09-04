/**
 * One lot: its cascade configuration and its ranked framework partners.
 *
 * The configuration form is where the spec's open questions live in practice —
 * response deadline (L-10), the workload threshold (L-07) and the review period
 * (L-09) are all settings rather than constants, precisely because they still
 * need confirming against the framework's wording.
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { lotPartners, lots, partners, rounds } from '@/db/schema';
import { formatEur } from '@/domain/format';
import { RankChip, StatusBadge } from '@/components/status-badge';
import { workloadFor } from '@/server/rounds/views';
import { LotConfigForm, PartnerRows } from './lot-forms';

export const dynamic = 'force-dynamic';

export default async function LotDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const lot = db.select().from(lots).where(eq(lots.id, id)).get();
  if (!lot) notFound();

  const members = db
    .select({
      lotPartnerId: lotPartners.id,
      rank: lotPartners.rank,
      isActive: lotPartners.isActive,
      contactName: lotPartners.contactName,
      contactEmail: lotPartners.contactEmail,
      unitPriceEur: lotPartners.unitPriceEur,
      partnerName: partners.name,
      regCode: partners.regCode,
    })
    .from(lotPartners)
    .innerJoin(partners, eq(partners.id, lotPartners.partnerId))
    .where(eq(lotPartners.lotId, id))
    .all()
    .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.rank - b.rank);

  const openRounds = db
    .select({ id: rounds.id, code: rounds.code })
    .from(rounds)
    .where(and(eq(rounds.lotId, id), eq(rounds.status, 'open')))
    .all();

  return (
    <div className="space-y-5">
      <div>
        <Link href="/tellija/hankeosad" className="text-[13px] text-[var(--color-brand)]">
          ← Hankeosad
        </Link>
        <h1 className="mt-1">
          {lot.code} — {lot.name}
        </h1>
        <p className="mt-1 max-w-[80ch] text-[var(--color-muted)]">{lot.description}</p>
      </div>

      <LotConfigForm
        lot={{
          id: lot.id,
          code: lot.code,
          responseDeadlineWorkingDays: lot.responseDeadlineWorkingDays,
          deadlineLocalTime: lot.deadlineLocalTime,
          reviewWorkingDays: lot.reviewWorkingDays,
          workloadThreshold: lot.workloadThreshold,
          thresholdNote: lot.thresholdNote,
          defaultVisibilityMode: lot.defaultVisibilityMode,
        }}
        openRoundCodes={openRounds.map((r) => r.code)}
      />

      <section className="kh-card">
        <div className="border-b border-[var(--color-border)] px-4 py-3">
          <h2>Raamlepingu partnerid järjestuses</h2>
          <p className="mt-0.5 text-[12.5px] text-[var(--color-muted)]">
            Järjestus pärineb hanke hindamistulemustest ja imporditakse tabelina. Koht 1 tähendab
            eesõigust. Osaluse lõpetamine arvab partneri välja ka käimasolevatest voorudest.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="kh-th">Koht</th>
                <th className="kh-th">Partner</th>
                <th className="kh-th">Kontakt</th>
                <th className="kh-th">Ühikhind</th>
                <th className="kh-th">Töömaht</th>
                <th className="kh-th">Olek</th>
                <th className="kh-th" />
              </tr>
            </thead>
            <tbody>
              <PartnerRows
                lotId={id}
                threshold={lot.workloadThreshold}
                rows={members.map((member) => ({
                  ...member,
                  unitPriceText: formatEur(member.unitPriceEur),
                  workload: workloadFor(db, member.lotPartnerId),
                }))}
              />
            </tbody>
          </table>
        </div>
        <div className="border-t border-[var(--color-border)] p-3">
          <Link href="/tellija/partnerid/import" className="kh-btn">
            Impordi järjestus tabelina
          </Link>
        </div>
      </section>
    </div>
  );
}
