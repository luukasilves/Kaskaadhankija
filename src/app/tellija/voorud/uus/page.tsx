/**
 * Create a round: pick a lot, then pick trainings from its unassigned pool.
 *
 * There is deliberately no step for choosing partners. A round goes to every
 * active member of the lot, so the only choices here are which lot and which
 * trainings [V-01].
 */

import Link from 'next/link';
import { eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { buyerCanWrite } from '@/server/auth/actor';
import { ReadOnlyNote } from '@/components/read-only-note';
import { lotPartners, lots, trainings } from '@/db/schema';
import { formatEur, formatIsoDay } from '@/domain/format';
import { TARGET_GROUPS } from '@/domain/round-statuses';
import { WORKSHOP_TYPE_LABELS } from '@/domain/statuses';
import { NewRoundForm } from './new-round-form';

export const dynamic = 'force-dynamic';

export default async function NewRoundPage({
  searchParams,
}: {
  searchParams: Promise<{ hankeosa?: string }>;
}) {
  const params = await searchParams;
  const db = getDb();

  if (!(await buyerCanWrite())) {
    return (
      <div className="space-y-4">
        <div>
          <Link href="/tellija/voorud" className="text-[13px] text-[var(--color-brand)]">
            ← Voorud
          </Link>
          <h1 className="mt-1">Uus voor</h1>
        </div>
        <ReadOnlyNote what="Uue vooru koostamine" />
      </div>
    );
  }

  const lotRows = db.select().from(lots).where(eq(lots.isActive, true)).all();
  const selectedLot =
    lotRows.find((l) => l.code === params.hankeosa) ?? lotRows[0];

  if (!selectedLot) {
    return (
      <div className="kh-card p-6">
        <h1>Uus voor</h1>
        <p className="mt-2 text-[var(--color-muted)]">
          Hankeosad puuduvad. Impordi kõigepealt raamlepingu andmed.
        </p>
      </div>
    );
  }

  const activePartners = db
    .select({ id: lotPartners.id, rank: lotPartners.rank })
    .from(lotPartners)
    .where(eq(lotPartners.lotId, selectedLot.id))
    .all()
    .filter((p) => p.rank > 0);

  const available = db
    .select()
    .from(trainings)
    .where(inArray(trainings.status, ['unassigned', 'leftover']))
    .all()
    .filter((t) => t.lotId === selectedLot.id)
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate) || a.code.localeCompare(b.code));

  return (
    <div className="space-y-4">
      <div>
        <Link href="/tellija/voorud" className="text-[13px] text-[var(--color-brand)]">
          ← Voorud
        </Link>
        <h1 className="mt-1">Uus voor</h1>
        <p className="mt-1 max-w-[80ch] text-[var(--color-muted)]">
          Voor läheb korraga <strong>kõigile</strong> valitud hankeosa aktiivsetele partneritele.
          Raamleping lubab ainult kaht mudelit — ühekaupa või kõigile korraga — seega partnerite
          valikut siin ei ole.
        </p>
      </div>

      <nav className="flex flex-wrap gap-2">
        {lotRows.map((lot) => (
          <Link
            key={lot.id}
            href={`/tellija/voorud/uus?hankeosa=${lot.code}`}
            className="kh-btn"
            style={
              lot.id === selectedLot.id
                ? { background: 'var(--color-brand)', borderColor: 'var(--color-brand)', color: '#fff' }
                : undefined
            }
          >
            {lot.code} — {lot.name}
          </Link>
        ))}
      </nav>

      <section className="kh-card flex flex-wrap items-center justify-between gap-3 p-4" data-testid="round-upload-offer">
        <div>
          <h2>Või laadi vooru skeem üles</h2>
          <p className="mt-1 max-w-[70ch] text-[13px] text-[var(--color-muted)]">
            Täida Exceli töövihik (leht „Voor“ + leht „Koolitused“) ja laadi üles: koolitused
            luuakse või uuendatakse ja voor tehakse nende peale mustandina. Avaldamine jääb siia.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/tellija/voorud/mall?hankeosa=${selectedLot.code}`} className="kh-btn">
            Laadi alla mall ({selectedLot.code})
          </a>
          <Link href={`/tellija/voorud/import?hankeosa=${selectedLot.code}`} className="kh-btn">
            Laadi skeem üles
          </Link>
        </div>
      </section>

      <NewRoundForm
        lot={{
          id: selectedLot.id,
          code: selectedLot.code,
          name: selectedLot.name,
          responseDeadlineWorkingDays: selectedLot.responseDeadlineWorkingDays,
          deadlineLocalTime: selectedLot.deadlineLocalTime,
          defaultVisibilityMode: selectedLot.defaultVisibilityMode,
          defaultCapOptions: selectedLot.defaultCapOptions,
          activePartnerCount: activePartners.length,
        }}
        trainings={available.map((t) => ({
          id: t.id,
          code: t.code,
          title: t.title,
          workshopType: WORKSHOP_TYPE_LABELS[t.workshopType],
          eventDate: formatIsoDay(t.eventDate),
          county: t.county,
          targetGroup: TARGET_GROUPS[t.targetGroup],
          participantCount: t.participantCount,
          value: formatEur(t.estimatedValueEur),
          isLeftover: t.status === 'leftover',
        }))}
      />
    </div>
  );
}
