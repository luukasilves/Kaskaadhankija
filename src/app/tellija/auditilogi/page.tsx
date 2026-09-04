/**
 * Auditilogi — the append-only record [D-08].
 *
 * Primary evidence in a public procurement: order documents are derived from
 * this, never the other way round. The table cannot be edited or deleted, and
 * the database enforces that with triggers rather than trusting the code.
 */

import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { auditEvents, rounds, trainings } from '@/db/schema';
import { formatDateTimeShort } from '@/domain/format';
import { StatusBadge } from '@/components/status-badge';

export const dynamic = 'force-dynamic';

const ACTOR_TONES = {
  buyer: 'info',
  partner: 'success',
  system: 'neutral',
  tester: 'warning',
} as const;

const ACTOR_LABELS = {
  buyer: 'Tellija',
  partner: 'Partner',
  system: 'Süsteem',
  tester: 'Testija',
} as const;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ voor?: string; tyyp?: string }>;
}) {
  const params = await searchParams;
  const db = getDb();

  const all = db
    .select({
      id: auditEvents.id,
      occurredAt: auditEvents.occurredAt,
      actorType: auditEvents.actorType,
      actorLabel: auditEvents.actorLabel,
      eventType: auditEvents.eventType,
      summary: auditEvents.summary,
      roundId: auditEvents.roundId,
      trainingId: auditEvents.trainingId,
      before: auditEvents.before,
      after: auditEvents.after,
      ip: auditEvents.ip,
    })
    .from(auditEvents)
    .orderBy(desc(auditEvents.id))
    .limit(1000)
    .all();

  const roundCodes = new Map(
    db.select({ id: rounds.id, code: rounds.code }).from(rounds).all().map((r) => [r.id, r.code] as const),
  );
  const trainingCodes = new Map(
    db.select({ id: trainings.id, code: trainings.code }).from(trainings).all().map((t) => [t.id, t.code] as const),
  );

  const eventTypes = [...new Set(all.map((e) => e.eventType))].sort();
  const rows = all
    .filter((event) => !params.voor || event.roundId === params.voor)
    .filter((event) => !params.tyyp || event.eventType === params.tyyp);

  return (
    <div className="space-y-4">
      <div>
        <h1>Auditilogi</h1>
        <p className="mt-1 max-w-[80ch] text-[var(--color-muted)]">
          {all.length} kannet. Tabel on ainult lisatav — andmebaasi trigger keelab kannete muutmise
          ja kustutamise, seega logi on hanke esmane tõend.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <Link
          href="/tellija/auditilogi"
          className="kh-btn"
          style={!params.tyyp && !params.voor ? { background: 'var(--color-brand)', borderColor: 'var(--color-brand)', color: '#fff' } : undefined}
        >
          Kõik
        </Link>
        {eventTypes.map((type) => (
          <Link
            key={type}
            href={`/tellija/auditilogi?tyyp=${type}`}
            className="kh-btn font-mono text-[12px]"
            style={params.tyyp === type ? { background: 'var(--color-brand)', borderColor: 'var(--color-brand)', color: '#fff' } : undefined}
          >
            {type}
          </Link>
        ))}
      </div>

      <div className="space-y-1.5">
        {rows.map((event) => {
          const hasPayload = event.before !== null || event.after !== null;
          return (
            <details key={event.id} className="kh-card px-3 py-2">
              <summary className={hasPayload ? 'cursor-pointer' : 'cursor-default list-none'}>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-[12px] tabular-nums text-[var(--color-muted)]">
                    {formatDateTimeShort(event.occurredAt)}
                  </span>
                  <StatusBadge
                    label={ACTOR_LABELS[event.actorType]}
                    tone={ACTOR_TONES[event.actorType]}
                  />
                  <code className="text-[12px] text-[var(--color-muted)]">{event.eventType}</code>
                  {event.roundId && (
                    <Link
                      href={`/tellija/voorud/${event.roundId}`}
                      className="text-[12px] text-[var(--color-brand)]"
                    >
                      {roundCodes.get(event.roundId) ?? 'voor'}
                    </Link>
                  )}
                  {event.trainingId && (
                    <span className="text-[12px] text-[var(--color-muted)]">
                      {trainingCodes.get(event.trainingId) ?? ''}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-[13px]">{event.summary}</div>
                <div className="text-[11px] text-[var(--color-muted)]">
                  {event.actorLabel}
                  {event.ip && ` · ${event.ip}`}
                </div>
              </summary>
              {hasPayload && (
                <pre className="mt-2 overflow-x-auto rounded bg-[var(--color-surface-alt)] p-2 text-[11.5px]">
                  {JSON.stringify({ enne: event.before, parast: event.after }, null, 2)}
                </pre>
              )}
            </details>
          );
        })}
      </div>
    </div>
  );
}
