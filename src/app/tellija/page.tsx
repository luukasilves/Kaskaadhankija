/**
 * Töölaud — what the buyer needs to notice today.
 *
 * Ordered by urgency rather than by entity: rounds waiting for a decision come
 * first (a closed round blocks partners from knowing their outcome), then open
 * rounds with their countdowns, then the jääk that needs a [T-06] decision.
 */

import Link from 'next/link';
import { eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { lots, rounds, trainings } from '@/db/schema';
import { formatDateTimeShort, formatEur, formatIsoDay } from '@/domain/format';
import {
  ROUND_STATUS_LABELS,
  ROUND_STATUS_TONES,
  TRAINING_STATUS_LABELS,
} from '@/domain/round-statuses';
import { Countdown } from '@/components/countdown';
import { StatusBadge } from '@/components/status-badge';
import { currentTimeMs } from '@/server/clock';
import { runDueJobs } from '@/server/rounds/jobs';
import { LeftoverActions } from './leftover-actions';
import { buyerCanWrite } from '@/server/auth/actor';
import { ReadOnlyNote } from '@/components/read-only-note';

export const dynamic = 'force-dynamic';

export default async function BuyerDashboard() {
  // Lazy deadline check, so a page load can never show a round whose window
  // has quietly passed. Idempotent — see rounds/jobs.ts.
  runDueJobs();

  const db = getDb();
  const canWrite = await buyerCanWrite();
  const nowMs = currentTimeMs();

  const allRounds = db
    .select({
      id: rounds.id,
      code: rounds.code,
      status: rounds.status,
      lotCode: lots.code,
      lotName: lots.name,
      deadlineAt: rounds.deadlineAt,
      expectedDecisionAt: rounds.expectedDecisionAt,
      closedAt: rounds.closedAt,
      visibilityMode: rounds.visibilityMode,
      proposalSnapshot: rounds.proposalSnapshot,
    })
    .from(rounds)
    .innerJoin(lots, eq(lots.id, rounds.lotId))
    .where(inArray(rounds.status, ['draft', 'open', 'closed']))
    .all();

  const awaiting = allRounds.filter((r) => r.status === 'closed');
  const open = allRounds
    .filter((r) => r.status === 'open')
    .sort((a, b) => (a.deadlineAt ?? 0) - (b.deadlineAt ?? 0));
  const drafts = allRounds.filter((r) => r.status === 'draft');

  const leftovers = db
    .select({
      id: trainings.id,
      code: trainings.code,
      title: trainings.title,
      eventDate: trainings.eventDate,
      county: trainings.county,
      estimatedValueEur: trainings.estimatedValueEur,
      lotId: trainings.lotId,
      lotCode: lots.code,
    })
    .from(trainings)
    .innerJoin(lots, eq(lots.id, trainings.lotId))
    .where(eq(trainings.status, 'leftover'))
    .all()
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate));

  const counts = {
    unassigned: db
      .select({ id: trainings.id })
      .from(trainings)
      .where(eq(trainings.status, 'unassigned'))
      .all().length,
    allocated: db
      .select({ id: trainings.id })
      .from(trainings)
      .where(eq(trainings.status, 'allocated'))
      .all().length,
    completed: db
      .select({ id: trainings.id })
      .from(trainings)
      .where(eq(trainings.status, 'completed'))
      .all().length,
  };


  return (
    <div className="space-y-6">
      <div>
        <h1>Töölaud</h1>
        <p className="mt-1 text-[var(--color-muted)]">
          Raamleping „Eesti.ai koolitajate tellimine“ · riigihanke viitenumber 10567384
        </p>
      </div>

      {/* Closed rounds block partners from learning their outcome, so they lead. */}
      {awaiting.length > 0 && (
        <section
          className="rounded-[10px] border p-4"
          style={{ borderColor: 'var(--color-warning)', background: 'var(--color-warning-soft)' }}
        >
          <h2 style={{ color: 'var(--color-warning)' }}>
            {awaiting.length} voor ootab jaotuse kinnitamist
          </h2>
          <p className="mt-1 text-[13px]" style={{ color: 'var(--color-warning)' }}>
            Partnerid näevad seni ainult teadet „tellija kinnitab jaotust“.
          </p>
          <ul className="mt-3 space-y-2">
            {awaiting.map((round) => {
              const snapshot = round.proposalSnapshot?.result;
              const allocated = snapshot
                ? snapshot.allocations.reduce((sum, a) => sum + a.trainingIds.length, 0)
                : 0;
              const overdue =
                round.expectedDecisionAt !== null && nowMs > round.expectedDecisionAt;
              return (
                <li key={round.id} className="kh-card flex flex-wrap items-center gap-3 p-3">
                  <Link
                    href={`/tellija/voorud/${round.id}/ulevaatus`}
                    className="font-semibold text-[var(--color-brand)]"
                  >
                    {round.code}
                  </Link>
                  <span className="text-[13px] text-[var(--color-muted)]">
                    {round.lotCode} · sulgus {round.closedAt ? formatDateTimeShort(round.closedAt) : '—'}
                  </span>
                  <span className="text-[13px]">
                    ettepanekus {allocated} koolitust, jääk {snapshot?.leftover.length ?? 0}
                  </span>
                  {overdue && <StatusBadge label="otsus hilineb" tone="danger" />}
                  <Link
                    href={`/tellija/voorud/${round.id}/ulevaatus`}
                    className="kh-btn kh-btn-primary ml-auto"
                  >
                    Ava ülevaatus
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3">Avatud voorud</h2>
        {open.length === 0 ? (
          <p className="kh-card p-4 text-[var(--color-muted)]">
            Avatud voore ei ole.
            {canWrite && (
              <>
                {' '}
                <Link href="/tellija/voorud/uus" className="text-[var(--color-brand)]">
                  Loo uus voor
                </Link>
                .
              </>
            )}
          </p>
        ) : (
          <div className="kh-card overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="kh-th">Voor</th>
                  <th className="kh-th">Hankeosa</th>
                  <th className="kh-th">Vastamistähtaeg</th>
                  <th className="kh-th">Aega jäänud</th>
                  <th className="kh-th">Nähtavus</th>
                  <th className="kh-th" />
                </tr>
              </thead>
              <tbody>
                {open.map((round) => (
                  <tr key={round.id}>
                    <td className="kh-td font-semibold whitespace-nowrap">
                      <Link href={`/tellija/voorud/${round.id}`} className="text-[var(--color-brand)]">
                        {round.code}
                      </Link>
                    </td>
                    <td className="kh-td text-[13px] whitespace-nowrap">
                      {round.lotCode} — {round.lotName}
                    </td>
                    <td className="kh-td whitespace-nowrap tabular-nums">
                      {round.deadlineAt ? formatDateTimeShort(round.deadlineAt) : '—'}
                    </td>
                    <td className="kh-td whitespace-nowrap">
                      {round.deadlineAt && (
                        <Countdown baseNowMs={nowMs} deadlineAt={round.deadlineAt} />
                      )}
                    </td>
                    <td className="kh-td text-[13px] whitespace-nowrap">
                      {round.visibilityMode === 'dynamic' ? 'Dünaamiline' : 'Suletud'}
                    </td>
                    <td className="kh-td whitespace-nowrap">
                      <Link href={`/tellija/voorud/${round.id}`} className="kh-btn">
                        Ava maatriks
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {leftovers.length > 0 && (
        <section id="jaak">
          <h2 className="mb-1">Jääk — ootab otsust</h2>
          <p className="mb-3 text-[13px] text-[var(--color-muted)]">
            Neid koolitusi ei võtnud ükski partner vastu. Vali uus voor kõigile partneritele, või
            tühista koolitus põhjendusega.
          </p>
          {canWrite ? (
            <LeftoverActions
              leftovers={leftovers.map((l) => ({
                id: l.id,
                code: l.code,
                title: l.title,
                eventDate: formatIsoDay(l.eventDate),
                county: l.county,
                value: formatEur(l.estimatedValueEur),
                lotId: l.lotId,
                lotCode: l.lotCode,
              }))}
            />
          ) : (
            <ReadOnlyNote what="Jäägi otsused" />
          )}
        </section>
      )}

      {drafts.length > 0 && (
        <section>
          <h2 className="mb-3">Mustandid</h2>
          <ul className="space-y-2">
            {drafts.map((round) => (
              <li key={round.id} className="kh-card flex flex-wrap items-center gap-3 p-3">
                <Link href={`/tellija/voorud/${round.id}`} className="font-semibold text-[var(--color-brand)]">
                  {round.code}
                </Link>
                <span className="text-[13px] text-[var(--color-muted)]">{round.lotCode}</span>
                <StatusBadge
                  label={ROUND_STATUS_LABELS[round.status]}
                  tone={ROUND_STATUS_TONES[round.status]}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3">Koolituskalender</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {(
            [
              ['unassigned', counts.unassigned],
              ['allocated', counts.allocated],
              ['completed', counts.completed],
            ] as const
          ).map(([status, count]) => (
            <div key={status} className="kh-card p-4">
              <div className="text-[25px] font-bold tabular-nums">{count}</div>
              <div className="text-[12px] text-[var(--color-muted)]">
                {TRAINING_STATUS_LABELS[status]}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3">
          <Link href="/tellija/koolitused" className="text-[var(--color-brand)]">
            Ava koolituskalender
          </Link>
        </p>
      </section>
    </div>
  );
}
