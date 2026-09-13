/**
 * Minu kalender — a company's trainings across rounds, by month [N-02].
 *
 * Two kinds of line: what the buyer has allocated to the company, and what the
 * company has confirmed in a round not yet decided. The second is a promise the
 * company made, not an order [L-25] — the badge says so — but it is exactly
 * what a person marking the next round needs to see: „kus mu enda aeg juba
 * bronnitud“.
 */

import Link from 'next/link';
import { getDb } from '@/db';
import { formatIsoDay, formatMonthLabel, monthKey } from '@/domain/format';
import { WORKSHOP_TYPE_LABELS } from '@/domain/statuses';
import { StatusBadge } from '@/components/status-badge';
import { requirePartner } from '@/server/auth/actor';
import { runDueJobs } from '@/server/rounds/jobs';
import { partnerCalendar, type CalendarEntry } from '@/server/rounds/views';

export const dynamic = 'force-dynamic';

const KIND_LABELS: Record<CalendarEntry['kind'], { label: string; tone: 'success' | 'info' | 'neutral' }> = {
  allocated: { label: 'Määratud teile', tone: 'success' },
  completed: { label: 'Toimunud', tone: 'neutral' },
  confirmed: { label: 'Kinnitatud, otsus ootel', tone: 'info' },
};

export default async function PartnerCalendarPage() {
  const actor = await requirePartner();
  runDueJobs();
  const entries = partnerCalendar(getDb(), actor.partnerId);

  const months = new Map<string, CalendarEntry[]>();
  for (const entry of entries) {
    const key = monthKey(entry.eventDate);
    months.set(key, [...(months.get(key) ?? []), entry]);
  }

  return (
    <div className="space-y-4" data-testid="partner-calendar">
      <div>
        <h1>Minu kalender</h1>
        <p className="mt-1 max-w-[80ch] text-[var(--color-muted)]">
          Koolitused, mis on teile määratud, ja need, mille olete avatud või tellija otsust ootavas
          voorus kinnitanud. Kinnitatud märge ei ole veel tellimus — see ütleb, mis aeg on juba
          lubatud, kui järgmist vooru märgite.
        </p>
      </div>

      {entries.length === 0 ? (
        <p className="kh-card p-6 text-[var(--color-muted)]">
          Kalendris ei ole veel midagi. Määratud ja kinnitatud koolitused ilmuvad siia ise.
        </p>
      ) : (
        [...months.entries()].map(([key, rows]) => (
          <section key={key} className="kh-card">
            <h2 className="border-b border-[var(--color-border)] px-4 py-3 capitalize">
              {formatMonthLabel(rows[0]!.eventDate)}
            </h2>
            <ul className="divide-y divide-[var(--color-border)]">
              {rows.map((entry) => {
                const kind = KIND_LABELS[entry.kind];
                return (
                  <li key={`${entry.trainingId}-${entry.kind}`} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3">
                    <span className="w-[8.5rem] font-semibold tabular-nums">
                      {formatIsoDay(entry.eventDate)}
                      {entry.eventEnd && ` – ${formatIsoDay(entry.eventEnd)}`}
                    </span>
                    <span className="min-w-[16rem] flex-1">
                      <span className="font-semibold">{entry.code}</span> — {entry.title}
                      <span className="block text-[12px] text-[var(--color-muted)]">
                        {WORKSHOP_TYPE_LABELS[entry.workshopType]} · {entry.county}
                        {entry.locationText ? `, ${entry.locationText}` : ''} · kuni {entry.participantCount} osalejat · {entry.lotCode}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <StatusBadge label={kind.label} tone={kind.tone} />
                      {entry.roundId && (
                        <Link href={`/partner/voorud/${entry.roundId}`} className="text-[13px] text-[var(--color-brand)]">
                          {entry.roundCode}
                        </Link>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
