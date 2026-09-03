/**
 * The partner's marking page — the screen the whole design turns on.
 *
 * In dynamic mode each training shows one of the four states of [N-03],
 * computed by running the allocation over the ranks *above* this partner. So
 * the partner learns the **effect** of higher-ranked confirmed marks without
 * ever learning who they are, how many there are, or whether anyone else has
 * responded [N-04].
 *
 * Two things this page must make unmistakable:
 *  - everything is provisional until the deadline, because higher ranks may
 *    still revise [N-05];
 *  - only *confirmed* marks count, so an unconfirmed draft is a trap unless it
 *    is shouted about [K-03].
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { lots, orders, roundTrainings, rounds, trainings } from '@/db/schema';
import { partnerView } from '@/domain/allocate';
import { formatDateTime, formatDateTimeShort, formatEur, formatIsoDay } from '@/domain/format';
import { TARGET_GROUPS, viewStateParts, VIEW_STATE_TONES } from '@/domain/round-statuses';
import { LANGUAGE_LABELS, WORKSHOP_TYPE_LABELS } from '@/domain/statuses';
import { Countdown } from '@/components/countdown';
import { RankChip, StatusBadge } from '@/components/status-badge';
import { requirePartner } from '@/server/auth/actor';
import { readClock } from '@/server/clock';
import { projectionInput } from '@/server/rounds/allocation-input';
import { runDueJobs } from '@/server/rounds/jobs';
import {
  allConfirmations,
  latestConfirmation,
  participantForPartner,
  responseStateFor,
  workloadFor,
} from '@/server/rounds/views';
import { MarkingForm } from './marking-form';

export const dynamic = 'force-dynamic';

export default async function PartnerRoundPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePartner();
  runDueJobs();

  const db = getDb();
  const { nowMs } = readClock(db);

  const round = db
    .select({
      id: rounds.id,
      code: rounds.code,
      status: rounds.status,
      visibilityMode: rounds.visibilityMode,
      publishedAt: rounds.publishedAt,
      deadlineAt: rounds.deadlineAt,
      expectedDecisionAt: rounds.expectedDecisionAt,
      confirmedAt: rounds.confirmedAt,
      cancelReason: rounds.cancelReason,
      workloadThresholdSnapshot: rounds.workloadThresholdSnapshot,
      finalSnapshot: rounds.finalSnapshot,
      lotCode: lots.code,
      lotName: lots.name,
    })
    .from(rounds)
    .innerJoin(lots, eq(lots.id, rounds.lotId))
    .where(eq(rounds.id, id))
    .get();

  if (!round || round.status === 'draft') notFound();

  const participant = participantForPartner(db, id, actor.partnerId);
  if (!participant) notFound();

  const trainingRows = db
    .select({
      id: trainings.id,
      code: trainings.code,
      title: trainings.title,
      workshopType: trainings.workshopType,
      eventDate: trainings.eventDate,
      eventEnd: trainings.eventEnd,
      county: trainings.county,
      locationText: trainings.locationText,
      targetGroup: trainings.targetGroup,
      participantCount: trainings.participantCount,
      language: trainings.language,
      estimatedValueEur: trainings.estimatedValueEur,
      notes: trainings.notes,
      withdrawnAt: roundTrainings.withdrawnAt,
    })
    .from(roundTrainings)
    .innerJoin(trainings, eq(trainings.id, roundTrainings.trainingId))
    .where(eq(roundTrainings.roundId, id))
    .all()
    .filter((row) => row.withdrawnAt === null)
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate) || a.code.localeCompare(b.code));

  const latest = latestConfirmation(db, id, participant.lotPartnerId);
  const state = responseStateFor(latest, participant.draftMarks, participant.draftCap);
  const history = allConfirmations(db, id).filter(
    (row) => row.lotPartnerId === participant.lotPartnerId,
  );

  const isOpen = round.status === 'open' && participant.excludedAt === null;
  /** dynamic visibility [N-06]: sealed rounds show a partner only their own marks */
  const showsStates = round.visibilityMode === 'dynamic';

  /* the four display states, from the draft the partner is editing [L-11] */
  const draftView =
    isOpen && showsStates
      ? partnerView(projectionInput(db, id, nowMs), participant.lotPartnerId, {
          marks: participant.draftMarks,
          cap: participant.draftCap,
        })
      : null;
  const confirmedView =
    isOpen && showsStates && latest
      ? partnerView(projectionInput(db, id, nowMs), participant.lotPartnerId, {
          marks: latest.kind === 'confirm' ? latest.marks : [],
          cap: latest.cap,
        })
      : null;

  const stateByTraining = new Map(
    (draftView?.rows ?? []).map((row) => [row.trainingId, row] as const),
  );

  /* after confirmation: what this partner got, and what went elsewhere [N-08] */
  const finalResult = round.finalSnapshot?.result;
  const mine = new Set(
    finalResult?.allocations.find((a) => a.lotPartnerId === participant.lotPartnerId)?.trainingIds ??
      [],
  );
  // Scoped to this participant: a round has one order per partner, and the
  // others are none of this partner's business [N-04].
  const myOrder =
    round.status === 'confirmed'
      ? db
          .select({ id: orders.id, year: orders.orderYear, seq: orders.orderSeq })
          .from(orders)
          .where(
            and(eq(orders.roundId, id), eq(orders.lotPartnerId, participant.lotPartnerId)),
          )
          .get()
      : undefined;

  const workload = workloadFor(db, participant.lotPartnerId);
  const overThreshold = workload >= round.workloadThresholdSnapshot;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/partner/voorud" className="text-[13px] text-[var(--color-brand)]">
          ← Voorud
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1>{round.code}</h1>
          <RankChip rank={participant.rankAtPublication} />
          <span className="text-[13px] text-[var(--color-muted)]">
            teie koht selle hankeosa järjestuses
          </span>
        </div>
        <p className="mt-1 text-[var(--color-muted)]">
          {round.lotCode} — {round.lotName} · avaldatud{' '}
          {round.publishedAt ? formatDateTimeShort(round.publishedAt) : '—'}
        </p>
      </div>

      {/* ---------------- state banners ---------------- */}

      {participant.excludedAt !== null && (
        <div
          className="rounded-[10px] border p-4"
          style={{ borderColor: 'var(--color-danger)', background: 'var(--color-danger-soft)' }}
        >
          <h2 style={{ color: 'var(--color-danger)' }}>Teid on sellest voorust välja arvatud</h2>
          <p className="mt-1 text-[13px]">
            {participant.excludedReason || 'Teie osalus selles hankeosas on lõpetatud.'} Teie märkeid
            ei arvestata.
          </p>
        </div>
      )}

      {round.status === 'closed' && (
        <div
          className="rounded-[10px] border p-4"
          style={{ borderColor: 'var(--color-warning)', background: 'var(--color-warning-soft)' }}
        >
          <h2 style={{ color: 'var(--color-warning)' }}>Vastamistähtaeg on möödunud</h2>
          <p className="mt-1 text-[13px]">
            Tellija kinnitab jaotust
            {round.expectedDecisionAt
              ? ` eeldatavasti ${formatDateTime(round.expectedDecisionAt)}`
              : ''}
            . Teie kinnitatud valik on registreeritud; jaotus selgub kinnitamisel.
          </p>
        </div>
      )}

      {round.status === 'cancelled' && (
        <div
          className="rounded-[10px] border p-4"
          style={{ borderColor: 'var(--color-neutral)', background: 'var(--color-neutral-soft)' }}
        >
          <h2>Voor on tühistatud</h2>
          <p className="mt-1 text-[13px]">
            {round.cancelReason || 'Tellija tühistas vooru.'} Teie märkeid ei arvestata.
          </p>
        </div>
      )}

      {round.status === 'confirmed' && (
        <div
          className="rounded-[10px] border p-4"
          style={{ borderColor: 'var(--color-success)', background: 'var(--color-success-soft)' }}
        >
          <h2 style={{ color: 'var(--color-success)' }}>
            Jaotus on kinnitatud
            {round.confirmedAt ? ` ${formatDateTimeShort(round.confirmedAt)}` : ''}
          </h2>
          <p className="mt-1 text-[13px]">
            {mine.size > 0
              ? `Teile määrati ${mine.size} koolitust. Tellimuse leiate menüüst „Tellimused“.`
              : 'Teile ei määratud sellest voorust koolitusi.'}
          </p>
          {myOrder && (
            <p className="mt-2">
              <Link href={`/partner/tellimused/${myOrder.id}`} className="kh-btn kh-btn-primary">
                Ava tellimus KH-{myOrder.year}-{String(myOrder.seq).padStart(4, '0')}
              </Link>
            </p>
          )}
        </div>
      )}

      {/* [K-08] silence is a decline, so it must be said before the deadline,
          not discovered after it. */}
      {isOpen && state === 'none' && (
        <div
          data-testid="no-response-banner"
          className="rounded-[10px] border p-4"
          style={{ borderColor: 'var(--color-warning)', background: 'var(--color-warning-soft)' }}
        >
          <h2 style={{ color: 'var(--color-warning)' }}>Te ei ole veel vastanud</h2>
          <p className="mt-1 text-[13px]">
            Tähtajaks vastamata jätmine <strong>loetakse loobumiseks</strong> kõigist selle vooru
            koolitustest. Kui ükski koolitus ei sobi, võite loobumise ka kohe kinnitada —
            see ei mõjuta teie kohta raamlepingu järjestuses.
          </p>
        </div>
      )}

      {isOpen && (
        <div className="kh-card p-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div>
              <div className="text-[12px] text-[var(--color-muted)]">Vastamistähtaeg</div>
              <div className="font-semibold tabular-nums">
                {round.deadlineAt ? formatDateTime(round.deadlineAt) : '—'}
              </div>
            </div>
            <div>
              <div className="text-[12px] text-[var(--color-muted)]">Aega jäänud</div>
              <div className="font-semibold">
                {round.deadlineAt && <Countdown baseNowMs={nowMs} deadlineAt={round.deadlineAt} />}
              </div>
            </div>
            {showsStates && (
              <div>
                <div className="text-[12px] text-[var(--color-muted)]">
                  Prognoosis sinule (esialgne)
                </div>
                <div className="text-[20px] font-bold tabular-nums">
                  {draftView?.projectedCount ?? 0}
                  {confirmedView &&
                    confirmedView.projectedCount !== draftView?.projectedCount && (
                      <span
                        className="ml-2 text-[13px] font-semibold"
                        style={{ color: 'var(--color-warning)' }}
                      >
                        kinnitatud seisuga {confirmedView.projectedCount}
                      </span>
                    )}
                </div>
              </div>
            )}
            {overThreshold && (
              <div
                className="rounded-md border px-3 py-2 text-[12.5px]"
                style={{
                  borderColor: 'var(--color-warning)',
                  background: 'var(--color-warning-soft)',
                  color: 'var(--color-warning)',
                }}
              >
                Teil on {workload} käimasolevat koolitust (piir{' '}
                {round.workloadThresholdSnapshot}). Tellijal on õigus jaotust piirata.
              </div>
            )}
          </div>

          {showsStates ? (
            <p className="mt-3 text-[12.5px] text-[var(--color-muted)]">
              Prognoos on <strong>esialgne</strong> ja võib muutuda kuni tähtajani: eesõigusega
              partnerid võivad oma valikut veel muuta. Koolitused jaotatakse rangelt raamlepingu
              järjestuse alusel — vastamise kiirus eelist ei anna.
            </p>
          ) : (
            <p className="mt-3 text-[12.5px] text-[var(--color-muted)]">
              Selles voorus näete ainult oma märkeid. Jaotus selgub pärast vastamistähtaega.
            </p>
          )}
        </div>
      )}

      {/* ---------------- the marking form ---------------- */}

      <MarkingForm
        roundId={id}
        editable={isOpen}
        dynamic={showsStates}
        responseState={state}
        draftMarks={participant.draftMarks}
        draftCap={participant.draftCap}
        confirmedMarks={latest && latest.kind === 'confirm' ? latest.marks : []}
        confirmedCap={latest?.cap ?? null}
        confirmedAt={latest ? formatDateTimeShort(latest.confirmedAt) : null}
        confirmedKind={latest?.kind ?? null}
        deadlineText={round.deadlineAt ? formatDateTime(round.deadlineAt) : ''}
        finalMine={round.status === 'confirmed' ? [...mine] : null}
        trainings={trainingRows.map((row) => {
          const view = stateByTraining.get(row.id);
          const parts = view ? viewStateParts(view.state, view.reason) : null;
          return {
            id: row.id,
            code: row.code,
            title: row.title,
            workshopType: WORKSHOP_TYPE_LABELS[row.workshopType],
            eventDate: formatIsoDay(row.eventDate),
            eventEnd: row.eventEnd ? formatIsoDay(row.eventEnd) : null,
            county: row.county,
            locationText: row.locationText,
            targetGroup: TARGET_GROUPS[row.targetGroup],
            participants: row.participantCount,
            language: LANGUAGE_LABELS[row.language],
            value: formatEur(row.estimatedValueEur),
            notes: row.notes,
            stateLabel: parts?.label ?? null,
            stateReason: parts?.reason ?? null,
            stateTone: view ? VIEW_STATE_TONES[view.state] : null,
          };
        })}
      />

      {/* ---------------- confirmation history ---------------- */}

      {history.length > 0 && (
        <section className="kh-card">
          <div className="border-b border-[var(--color-border)] px-4 py-3">
            <h2>Teie kinnituste ajalugu</h2>
            <p className="mt-0.5 text-[12.5px] text-[var(--color-muted)]">
              Iga kinnitus on eraldi kanne. Siduv on viimane kinnitus enne tähtaega.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="kh-th">Aeg</th>
                  <th className="kh-th">Tüüp</th>
                  <th className="kh-th">Märkeid</th>
                  <th className="kh-th">Piirmäär</th>
                  <th className="kh-th">Siduv</th>
                </tr>
              </thead>
              <tbody>
                {[...history].reverse().map((row, index) => (
                  <tr key={row.id}>
                    <td className="kh-td whitespace-nowrap tabular-nums">
                      {formatDateTimeShort(row.confirmedAt)}
                    </td>
                    <td className="kh-td whitespace-nowrap">
                      {row.kind === 'confirm' ? 'Kinnitus' : 'Loobumine'}
                    </td>
                    <td className="kh-td tabular-nums">{row.marks.length}</td>
                    <td className="kh-td tabular-nums">{row.cap ?? '—'}</td>
                    <td className="kh-td">
                      {index === 0 && <StatusBadge label="Kehtib" tone="success" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
