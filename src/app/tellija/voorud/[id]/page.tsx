/**
 * The buyer's view of one round — everything, live [N-01].
 *
 * The matrix is the point: trainings down the side, partners across the top in
 * rank order, so the shape of the cascade is visible at a glance. Confirmed
 * marks and unconfirmed drafts are shown differently, because only confirmed
 * ones count at the deadline [K-03], and the projected holder of each training
 * is computed with the same function that will produce the proposal [J-05].
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { lots, roundTrainings, rounds, trainings } from '@/db/schema';
import { allocate } from '@/domain/allocate';
import { describeGroups, groupIndexRange, UNIT_WORDS } from '@/domain/clusters';
import { formatDateTimeShort, formatEur, formatEventWhen, formatIsoDay, formatPeriod, formatTime, tallinnLocalInput } from '@/domain/format';
import { CAP_OPTIONS_LABELS, capLabel,
  PARTICIPANT_OUTCOME_LABELS,
  RESPONSE_STATE_LABELS,
  ROUND_STATUS_LABELS,
  ROUND_STATUS_TONES,
  VISIBILITY_MODE_LABELS,
} from '@/domain/round-statuses';
import { WORKSHOP_TYPE_LABELS } from '@/domain/statuses';
import { Disclosure } from '@/components/action-form';
import { AutoRefresh } from '@/components/auto-refresh';
import { Countdown } from '@/components/countdown';
import { RankChip, StatusBadge } from '@/components/status-badge';
import { currentTimeMs } from '@/server/clock';
import { env, isDemoMode } from '@/lib/env';
import { buyerCanWrite } from '@/server/auth/actor';
import { ReadOnlyNote } from '@/components/read-only-note';
import { projectionInput } from '@/server/rounds/allocation-input';
import { runDueJobs } from '@/server/rounds/jobs';
import { getRoundProtocol } from '@/server/rounds/protocol';
import { latestConfirmation, participantsOf, responseStateFor } from '@/server/rounds/views';
import { DraftRoundPanel, OpenRoundPanel } from './round-panels';

export const dynamic = 'force-dynamic';

export default async function RoundDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  runDueJobs();

  const db = getDb();
  const canWrite = await buyerCanWrite();
  const nowMs = currentTimeMs();

  const round = db
    .select({
      id: rounds.id,
      code: rounds.code,
      status: rounds.status,
      kind: rounds.kind,
      note: rounds.note,
      visibilityMode: rounds.visibilityMode,
      capOptions: rounds.capOptions,
      plannedExtraWorkingDays: rounds.plannedExtraWorkingDays,
      plannedPublishAt: rounds.plannedPublishAt,
      plannedDeadlineAt: rounds.plannedDeadlineAt,
      publishedAt: rounds.publishedAt,
      deadlineAt: rounds.deadlineAt,
      expectedDecisionAt: rounds.expectedDecisionAt,
      closedAt: rounds.closedAt,
      confirmedAt: rounds.confirmedAt,
      confirmedBy: rounds.confirmedBy,
      cancelReason: rounds.cancelReason,
      workloadThresholdSnapshot: rounds.workloadThresholdSnapshot,
      responseWorkingDaysSnapshot: rounds.responseWorkingDaysSnapshot,
      finalSnapshot: rounds.finalSnapshot,
      lotId: lots.id,
      lotCode: lots.code,
      lotName: lots.name,
      lotDeadlineTime: lots.deadlineLocalTime,
      lotResponseDays: lots.responseDeadlineWorkingDays,
    })
    .from(rounds)
    .innerJoin(lots, eq(lots.id, rounds.lotId))
    .where(eq(rounds.id, id))
    .get();

  if (!round) notFound();

  /* trainings in the round, withdrawn ones flagged rather than hidden */
  const links = db
    .select({
      trainingId: roundTrainings.trainingId,
      withdrawnAt: roundTrainings.withdrawnAt,
      withdrawnReason: roundTrainings.withdrawnReason,
    })
    .from(roundTrainings)
    .where(eq(roundTrainings.roundId, id))
    .all();

  const trainingRows = links
    .map((link) => {
      const training = db.select().from(trainings).where(eq(trainings.id, link.trainingId)).get();
      return training ? { ...training, ...link } : null;
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate) || a.code.localeCompare(b.code));

  const participants = participantsOf(db, id);

  /* the live projection, or the confirmed result once it exists */
  const isLive = round.status === 'open';
  const projection = isLive ? allocate(projectionInput(db, id, nowMs)) : null;
  const finalResult = round.finalSnapshot?.result ?? null;
  const shown = finalResult ?? projection;

  const partnerColumns = participants.map((participant) => {
    const latest = latestConfirmation(db, id, participant.lotPartnerId);
    const state = responseStateFor(latest, participant.draftMarks, participant.draftCap, participant.draftCapKind);
    const confirmedMarks = new Set(latest && latest.kind === 'confirm' ? latest.marks : []);
    const draftMarks = new Set(participant.draftMarks);
    const projected =
      shown?.allocations.find((a) => a.lotPartnerId === participant.lotPartnerId)?.trainingIds ?? [];
    return {
      participant,
      latest,
      state,
      confirmedMarks,
      draftMarks,
      projectedCount: projected.length,
      cap: latest?.cap ?? participant.draftCap ?? null,
      capKind: latest?.capKind ?? participant.draftCapKind,
    };
  });

  // [L-22] Whether this round has a protocol at all; a round that ended before
  // protocols existed has none until an admin writes one, and the page it links
  // to says so and offers that.
  const hasProtocol =
    round.status === 'confirmed' ||
    (round.status === 'cancelled' && round.publishedAt !== null) ||
    getRoundProtocol(db, id) !== null;

  const nonResponders = partnerColumns.filter(
    (column) => column.participant.excludedAt === null && !column.latest,
  );
  const isCluster = round.kind === 'cluster';
  const unit = UNIT_WORDS[round.kind];
  // In a cluster round a mark is a count, so „unmarked“ is meaningless per
  // group; what the buyer needs is which groups the projection leaves over.
  const unmarked = isCluster
    ? []
    : trainingRows.filter(
        (training) =>
          training.withdrawnAt === null &&
          !partnerColumns.some((column) => column.confirmedMarks.has(training.id)),
      );

  /* [K-10] the matrix collapses to one row per cluster: counts per partner */
  const clusterRows = isCluster
    ? [...new Set(trainingRows.filter((t) => t.clusterCode).map((t) => t.clusterCode as string))].map((clusterCode) => {
        const groups = trainingRows
          .filter((t) => t.clusterCode === clusterCode)
          .sort((a, b) => (a.groupIndex ?? 0) - (b.groupIndex ?? 0));
        const live = groups.filter((g) => g.withdrawnAt === null);
        const likes = live.map((g) => ({ groupIndex: g.groupIndex ?? 0, participantCount: g.participantCount }));
        const holders = new Map<string, number[]>();
        for (const g of live) {
          const holder = shown?.byTraining[g.id];
          if (!holder) continue;
          holders.set(holder, [...(holders.get(holder) ?? []), g.groupIndex ?? 0]);
        }
        const leftoverIndices = live.filter((g) => shown && !shown.byTraining[g.id]).map((g) => g.groupIndex ?? 0);
        return { clusterCode, head: groups[0]!, groups, live, likes, holders, leftoverIndices };
      })
    : [];
  const leftoverGroups = clusterRows.filter((c) => c.leftoverIndices.length > 0);

  return (
    <div className="space-y-5">
      <div>
        <Link href="/tellija/voorud" className="text-[13px] text-[var(--color-brand)]">
          ← Voorud
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1>{round.code}</h1>
          <StatusBadge
            label={ROUND_STATUS_LABELS[round.status]}
            tone={ROUND_STATUS_TONES[round.status]}
          />
          {isCluster && <StatusBadge label="Klastrivoor" tone="info" />}
          {round.status === 'closed' && (
            <Link href={`/tellija/voorud/${id}/ulevaatus`} className="kh-btn kh-btn-primary">
              Ava ülevaatus
            </Link>
          )}
          {/* [L-22] An ended round has a signable record; the link is here
              because this is the page anyone looking for one opens first. */}
          {hasProtocol && (
            <Link
              href={`/tellija/voorud/${id}/protokoll`}
              className="kh-btn"
              data-testid="protocol-link"
            >
              Vooru protokoll
            </Link>
          )}
        </div>
        <p className="mt-1 text-[var(--color-muted)]">
          {round.lotCode} — {round.lotName} · {VISIBILITY_MODE_LABELS[round.visibilityMode]} · piirmäär:{' '}
          {CAP_OPTIONS_LABELS[round.capOptions].toLowerCase()}
        </p>
      </div>

      {/* [L-22] The signable record, where the buyer looks for it: the round
          page, from the moment the round has ended. The team could not find it
          during the play-through, so it is a card, not a link in a row. */}
      {hasProtocol && (
        <section
          className="rounded-[10px] border p-4"
          style={{ borderColor: 'var(--color-brand)', background: 'var(--color-brand-soft)' }}
          data-testid="protocol-card"
        >
          <div className="flex flex-wrap items-center gap-3">
            <h2 style={{ color: 'var(--color-brand)' }}>Vooru protokoll</h2>
            <span className="text-[13px] text-[var(--color-muted)]">
              otsuse alusdokument — jaotus täitjate kaupa, kinnitused, kohandused, sõrmejälg
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={`/tellija/voorud/${id}/protokoll/pdf`} className="kh-btn kh-btn-primary">
              Laadi alla PDF
            </a>
            <a href={`/tellija/voorud/${id}/protokoll/xlsx`} className="kh-btn">
              Lisa (.xlsx)
            </a>
            <Link href={`/tellija/voorud/${id}/protokoll`} className="kh-btn">
              Protokolli leht ja sõrmejälg
            </Link>
          </div>
        </section>
      )}

      {round.status === 'draft' && (round.plannedPublishAt || round.plannedDeadlineAt) && (
        <p className="text-[13px] text-[var(--color-muted)]" data-testid="planned-window">
          Skeemifailis kavandatud:{' '}
          {round.plannedPublishAt
            ? `avaldamine ${formatDateTimeShort(round.plannedPublishAt)}`
            : 'avaldamise aeg määramata'}
          {round.plannedDeadlineAt
            ? ` · vastamistähtaeg ${formatDateTimeShort(round.plannedDeadlineAt)}`
            : ''}
          . Päris ajad määrab avaldamine.
        </p>
      )}

      <div className="kh-card p-4">
        <dl className="grid gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-[auto_1fr_auto_1fr]">
          <dt className="text-[var(--color-muted)]">Avaldatud</dt>
          <dd className="font-semibold tabular-nums">
            {round.publishedAt ? formatDateTimeShort(round.publishedAt) : '—'}
          </dd>
          <dt className="text-[var(--color-muted)]">Vastamistähtaeg</dt>
          <dd className="font-semibold tabular-nums">
            {round.deadlineAt ? formatDateTimeShort(round.deadlineAt) : '—'}
            {isLive && round.deadlineAt && (
              <>
                {' · '}
                <Countdown baseNowMs={nowMs} deadlineAt={round.deadlineAt} />
              </>
            )}
          </dd>
          <dt className="text-[var(--color-muted)]">Saajad</dt>
          <dd className="font-semibold">
            {participants.filter((p) => p.excludedAt === null).length} partnerit
            {participants.some((p) => p.excludedAt !== null) &&
              ` (${participants.filter((p) => p.excludedAt !== null).length} välja arvatud)`}
          </dd>
          <dt className="text-[var(--color-muted)]">Otsust oodata</dt>
          <dd className="font-semibold tabular-nums">
            {round.expectedDecisionAt ? formatDateTimeShort(round.expectedDecisionAt) : '—'}
          </dd>
          {round.confirmedAt && (
            <>
              <dt className="text-[var(--color-muted)]">Kinnitatud</dt>
              <dd className="font-semibold tabular-nums">
                {formatDateTimeShort(round.confirmedAt)} · {round.confirmedBy}
              </dd>
            </>
          )}
          {round.cancelReason && (
            <>
              <dt className="text-[var(--color-muted)]">Tühistamise põhjus</dt>
              <dd className="font-semibold">{round.cancelReason}</dd>
            </>
          )}
          {/* [V-03] The configuration this round is frozen against. A later
              edit of the lot cannot reach it, so the figures that actually
              apply belong on the round rather than only on the lot. */}
          {round.publishedAt !== null && (
            <>
              <dt className="text-[var(--color-muted)]">Koormuse piir</dt>
              <dd className="font-semibold tabular-nums" data-testid="frozen-threshold">
                {round.workloadThresholdSnapshot} koolitust
              </dd>
              <dt className="text-[var(--color-muted)]">Vastamisaeg</dt>
              <dd className="font-semibold tabular-nums">
                {round.responseWorkingDaysSnapshot} tööpäeva
              </dd>
            </>
          )}
        </dl>
        {round.note && (
          <p className="mt-3 text-[13px]">
            <span className="text-[var(--color-muted)]">Märkus: </span>
            {round.note}
          </p>
        )}
      </div>

      {round.status === 'draft' && !canWrite && <ReadOnlyNote what="Vooru avaldamine ja muutmine" />}
      {round.status === 'open' && !canWrite && <ReadOnlyNote what="Avatud vooru muutmine" />}

      {round.status === 'draft' && canWrite && (
        <DraftRoundPanel
          roundId={id}
          lotResponseDays={round.lotResponseDays}
          lotDeadlineTime={round.lotDeadlineTime}
          visibilityMode={round.visibilityMode}
          plannedExtraWorkingDays={round.plannedExtraWorkingDays}
          plannedDeadlineLocal={
            round.plannedDeadlineAt ? tallinnLocalInput(round.plannedDeadlineAt) : null
          }
          testFloorSeconds={isDemoMode ? env.TEST_DEADLINE_FLOOR_SECONDS : undefined}
          trainings={trainingRows.map((t) => ({
            id: t.id,
            code: t.code,
            title: t.title,
            eventDate: formatEventWhen(t),
          }))}
        />
      )}

      {round.status === 'open' && canWrite && (
        <OpenRoundPanel
          roundId={id}
          trainings={trainingRows
            .filter((t) => t.withdrawnAt === null)
            .map((t) => ({ id: t.id, code: t.code, title: t.title }))}
        />
      )}

      {/* ---------------- partner summary ---------------- */}
      {isLive && <AutoRefresh />}
      <section className="kh-card">
        <div className="border-b border-[var(--color-border)] px-4 py-3">
          <h2>Partnerid järjestuses</h2>
          <p className="mt-0.5 text-[12.5px] text-[var(--color-muted)]">
            Järjestus külmutati vooru avaldamisel — hilisemad muudatused hankeosas seda ei mõjuta.
            {isLive && (
              <span data-testid="state-as-of">
                {' '}
                Seis {formatTime(nowMs)} · leht värskendab vastuseid ja prognoosi ise umbes kord minutis.
              </span>
            )}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="kh-th">Koht</th>
                <th className="kh-th">Partner</th>
                <th className="kh-th">Vastus</th>
                <th className="kh-th">Kinnitatud</th>
                <th className="kh-th">{isCluster ? 'Rühmi küsitud' : 'Märkeid'}</th>
                <th className="kh-th">Piirmäär</th>
                <th className="kh-th">{finalResult ? 'Lõplikus jaotuses' : 'Prognoosis'}</th>
              </tr>
            </thead>
            <tbody>
              {partnerColumns.map((column) => (
                <tr key={column.participant.lotPartnerId}>
                  <td className="kh-td">
                    <RankChip
                      rank={column.participant.rankAtPublication}
                      muted={column.participant.excludedAt !== null}
                    />
                  </td>
                  <td className="kh-td">
                    <div className="font-semibold">{column.participant.partnerName}</div>
                    <div className="text-[12px] text-[var(--color-muted)]">
                      {column.participant.contactName} · {column.participant.contactEmail}
                    </div>
                  </td>
                  <td className="kh-td whitespace-nowrap">
                    {column.participant.excludedAt !== null ? (
                      <StatusBadge label="Välja arvatud" tone="neutral" />
                    ) : column.participant.outcomeAtClose ? (
                      <StatusBadge
                        label={
                          PARTICIPANT_OUTCOME_LABELS[
                            column.participant.outcomeAtClose as keyof typeof PARTICIPANT_OUTCOME_LABELS
                          ]
                        }
                        tone={
                          column.participant.outcomeAtClose === 'confirmed'
                            ? 'success'
                            : column.participant.outcomeAtClose === 'no_response'
                              ? 'danger'
                              : 'warning'
                        }
                      />
                    ) : (
                      <StatusBadge
                        label={RESPONSE_STATE_LABELS[column.state]}
                        tone={
                          column.state === 'confirmed'
                            ? 'success'
                            : column.state === 'unconfirmed_changes'
                              ? 'warning'
                              : column.state === 'declined_all'
                                ? 'warning'
                                : 'neutral'
                        }
                      />
                    )}
                  </td>
                  <td className="kh-td text-[13px] whitespace-nowrap tabular-nums">
                    {column.latest ? formatDateTimeShort(column.latest.confirmedAt) : '—'}
                  </td>
                  <td className="kh-td tabular-nums">
                    {column.confirmedMarks.size}
                    {column.draftMarks.size !== column.confirmedMarks.size && (
                      <span
                        className="ml-1 text-[12px]"
                        style={{ color: 'var(--color-warning)' }}
                        title="Kinnitamata mustandis on teine arv märkeid"
                      >
                        (mustand {column.draftMarks.size})
                      </span>
                    )}
                  </td>
                  <td className="kh-td tabular-nums">
                    {isCluster && column.cap !== null && column.capKind !== 'participants'
                      ? `${column.cap} rühma`
                      : capLabel(column.cap, column.capKind)}
                  </td>
                  <td className="kh-td font-semibold tabular-nums">{column.projectedCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------- the matrix ---------------- */}
      <section className="kh-card">
        <div className="border-b border-[var(--color-border)] px-4 py-3">
          <h2>{isCluster ? 'Maatriks — klastrid × partnerid' : 'Maatriks — koolitused × partnerid'}</h2>
          <p className="mt-0.5 text-[12.5px] text-[var(--color-muted)]">
            {isCluster ? (
              <>
                Arv on partneri kinnitatud rühmade soov klastris (<strong>◌</strong> kinnitamata mustand) ·{' '}
                <strong>tume taust</strong> {finalResult ? 'lõplikud täitjad' : 'prognoositud täitjad'} rühmade arvuga.
                Rühmad on vahetatavad: iga partner saab klastrist esimesed veel jaotamata rühmad [K-10].
              </>
            ) : (
              <>
                <strong>✓</strong> kinnitatud märge · <strong>◌</strong> kinnitamata mustand ·{' '}
                <strong>tume taust</strong> {finalResult ? 'lõplik täitja' : 'prognoositud täitja'}
              </>
            )}
          </p>
        </div>
        {isCluster && (
          <div className="overflow-x-auto" data-testid="cluster-matrix">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="kh-th">Klaster</th>
                  <th className="kh-th">Periood</th>
                  {partnerColumns.map((column) => (
                    <th key={column.participant.lotPartnerId} className="kh-th text-center">
                      <div className="flex flex-col items-center gap-0.5">
                        <RankChip rank={column.participant.rankAtPublication} />
                        <span className="max-w-[9rem] truncate text-[11px] normal-case">
                          {column.participant.partnerName}
                        </span>
                      </div>
                    </th>
                  ))}
                  <th className="kh-th">{finalResult ? 'Täitjad' : 'Prognoos'}</th>
                </tr>
              </thead>
              <tbody>
                {clusterRows.map((cluster) => (
                  <tr key={cluster.clusterCode}>
                    <td className="kh-td">
                      <div className="font-semibold whitespace-nowrap">{cluster.clusterCode}</div>
                      <div className="text-[12px] text-[var(--color-muted)]">
                        {cluster.head.title} · {describeGroups(cluster.likes, cluster.likes)}
                      </div>
                      <Disclosure summary={`Rühmad (${cluster.live.length})`}>
                        <ul className="space-y-0.5 text-[12px]">
                          {cluster.groups.map((g) => {
                            const holder = partnerColumns.find(
                              (column) => column.participant.lotPartnerId === shown?.byTraining[g.id],
                            );
                            return (
                              <li key={g.id} style={g.withdrawnAt !== null ? { opacity: 0.5 } : undefined}>
                                <span className="font-semibold">{g.code}</span> · kuni {g.participantCount} osalejat ·{' '}
                                {g.withdrawnAt !== null
                                  ? `tagasi võetud: ${g.withdrawnReason}`
                                  : holder
                                    ? holder.participant.partnerName
                                    : 'jaotamata'}
                              </li>
                            );
                          })}
                        </ul>
                      </Disclosure>
                    </td>
                    <td className="kh-td text-[13px] whitespace-nowrap">
                      {formatPeriod(cluster.head.eventDate, cluster.head.eventEnd)}
                      <div className="text-[11px] text-[var(--color-muted)]">
                        {WORKSHOP_TYPE_LABELS[cluster.head.workshopType]} · {cluster.head.county}
                      </div>
                    </td>
                    {partnerColumns.map((column) => {
                      const liveIds = cluster.live.map((g) => g.id);
                      const confirmed = liveIds.filter((id) => column.confirmedMarks.has(id)).length;
                      const draft = liveIds.filter((id) => column.draftMarks.has(id)).length;
                      const got = cluster.holders.get(column.participant.lotPartnerId)?.length ?? 0;
                      return (
                        <td
                          key={column.participant.lotPartnerId}
                          className="kh-td text-center tabular-nums"
                          style={got > 0 ? { background: 'var(--color-success-soft)', fontWeight: 700 } : undefined}
                          title={
                            confirmed > 0
                              ? `Kinnitatud soov: ${confirmed} rühma`
                              : draft > 0
                                ? 'Kinnitamata mustand — tähtajal ei arvestata'
                                : undefined
                          }
                        >
                          {confirmed > 0 ? (
                            <span style={{ color: 'var(--color-success)' }}>{confirmed}</span>
                          ) : draft > 0 ? (
                            <span style={{ color: 'var(--color-warning)' }}>◌ {draft}</span>
                          ) : (
                            <span className="text-[var(--color-border-strong)]">·</span>
                          )}
                          {got > 0 && <div className="text-[11px] font-normal">saab {got}</div>}
                        </td>
                      );
                    })}
                    <td className="kh-td text-[13px]">
                      {[...cluster.holders.entries()].map(([lotPartnerId, indices]) => {
                        const column = partnerColumns.find((c) => c.participant.lotPartnerId === lotPartnerId);
                        return (
                          <div key={lotPartnerId} className="whitespace-nowrap">
                            <span className="font-semibold">koht {column?.participant.rankAtPublication ?? '?'}</span>:{' '}
                            {indices.length} rühma ({groupIndexRange(indices)})
                          </div>
                        );
                      })}
                      {cluster.leftoverIndices.length > 0 && (
                        <div style={{ color: 'var(--color-danger)' }}>
                          jaotamata {cluster.leftoverIndices.length} ({groupIndexRange(cluster.leftoverIndices)})
                        </div>
                      )}
                      {cluster.holders.size === 0 && cluster.leftoverIndices.length === 0 && (
                        <span className="text-[var(--color-muted)]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="overflow-x-auto" hidden={isCluster}>
          <table className="w-full">
            <thead>
              <tr>
                <th className="kh-th">Koolitus</th>
                <th className="kh-th">Toimumine</th>
                {partnerColumns.map((column) => (
                  <th key={column.participant.lotPartnerId} className="kh-th text-center">
                    <div className="flex flex-col items-center gap-0.5">
                      <RankChip rank={column.participant.rankAtPublication} />
                      <span className="max-w-[9rem] truncate text-[11px] normal-case">
                        {column.participant.partnerName}
                      </span>
                    </div>
                  </th>
                ))}
                <th className="kh-th">{finalResult ? 'Täitja' : 'Prognoos'}</th>
              </tr>
            </thead>
            <tbody>
              {trainingRows.map((training) => {
                const holder = shown?.byTraining[training.id];
                const holderColumn = partnerColumns.find(
                  (column) => column.participant.lotPartnerId === holder,
                );
                const withdrawn = training.withdrawnAt !== null;
                return (
                  <tr key={training.id} style={withdrawn ? { opacity: 0.5 } : undefined}>
                    <td className="kh-td">
                      <div className="font-semibold whitespace-nowrap">{training.code}</div>
                      <div className="text-[12px] text-[var(--color-muted)]">
                        {training.title}
                        {withdrawn && (
                          <span style={{ color: 'var(--color-danger)' }}>
                            {' '}
                            · tagasi võetud: {training.withdrawnReason}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="kh-td text-[13px] whitespace-nowrap tabular-nums">
                      {formatEventWhen(training)}
                      <div className="text-[11px] text-[var(--color-muted)]">
                        {WORKSHOP_TYPE_LABELS[training.workshopType]} · {training.county}
                      </div>
                    </td>
                    {partnerColumns.map((column) => {
                      const confirmed = column.confirmedMarks.has(training.id);
                      const draftOnly = !confirmed && column.draftMarks.has(training.id);
                      const isHolder = holder === column.participant.lotPartnerId;
                      return (
                        <td
                          key={column.participant.lotPartnerId}
                          className="kh-td text-center text-[15px]"
                          style={
                            isHolder
                              ? { background: 'var(--color-success-soft)', fontWeight: 700 }
                              : undefined
                          }
                          title={
                            confirmed
                              ? 'Kinnitatud märge'
                              : draftOnly
                                ? 'Kinnitamata mustand — tähtajal ei arvestata'
                                : undefined
                          }
                        >
                          {confirmed ? (
                            <span style={{ color: 'var(--color-success)' }}>✓</span>
                          ) : draftOnly ? (
                            <span style={{ color: 'var(--color-warning)' }}>◌</span>
                          ) : (
                            <span className="text-[var(--color-border-strong)]">·</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="kh-td text-[13px] whitespace-nowrap">
                      {withdrawn ? (
                        <span className="text-[var(--color-muted)]">—</span>
                      ) : holderColumn ? (
                        <span className="font-semibold">{holderColumn.participant.partnerName}</span>
                      ) : (
                        <span style={{ color: 'var(--color-danger)' }}>jaotamata</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {(unmarked.length > 0 || leftoverGroups.length > 0 || nonResponders.length > 0) && round.status !== 'confirmed' && (
        <section className="grid gap-4 sm:grid-cols-2">
          {leftoverGroups.length > 0 && (
            <div className="kh-card p-4" data-testid="leftover-groups">
              <h3 style={{ color: 'var(--color-danger)' }}>
                Prognoosis jaotamata rühmad ({leftoverGroups.reduce((sum, c) => sum + c.leftoverIndices.length, 0)})
              </h3>
              <p className="mt-1 text-[12.5px] text-[var(--color-muted)]">
                Partnerite kinnitatud soovid ei kata neid rühmi. Kui see tähtajaks ei muutu, jäävad need jäägiks.
              </p>
              <ul className="mt-2 space-y-0.5 text-[13px]">
                {leftoverGroups.map((cluster) => (
                  <li key={cluster.clusterCode}>
                    <span className="font-semibold">{cluster.clusterCode}</span> · {cluster.leftoverIndices.length}{' '}
                    {unit.partitive} ({groupIndexRange(cluster.leftoverIndices)})
                  </li>
                ))}
              </ul>
            </div>
          )}
          {unmarked.length > 0 && (
            <div className="kh-card p-4">
              <h3 style={{ color: 'var(--color-danger)' }}>
                Märkimata koolitused ({unmarked.length})
              </h3>
              <p className="mt-1 text-[12.5px] text-[var(--color-muted)]">
                Ükski partner ei ole neid kinnitanud. Kui see tähtajaks ei muutu, jäävad need
                jäägiks.
              </p>
              <ul className="mt-2 space-y-0.5 text-[13px]">
                {unmarked.map((training) => (
                  <li key={training.id}>
                    <span className="font-semibold">{training.code}</span> ·{' '}
                    {formatIsoDay(training.eventDate)} · kuni {training.participantCount} osalejat
                  </li>
                ))}
              </ul>
            </div>
          )}
          {nonResponders.length > 0 && (
            <div className="kh-card p-4">
              <h3>Vastamata partnerid ({nonResponders.length})</h3>
              <p className="mt-1 text-[12.5px] text-[var(--color-muted)]">
                Tähtajaks vastamata jätmine loetakse loobumiseks.
              </p>
              <ul className="mt-2 space-y-0.5 text-[13px]">
                {nonResponders.map((column) => (
                  <li key={column.participant.lotPartnerId}>
                    <RankChip rank={column.participant.rankAtPublication} />{' '}
                    {column.participant.partnerName}
                    {column.draftMarks.size > 0 && (
                      <span style={{ color: 'var(--color-warning)' }}>
                        {' '}
                        · mustand olemas ({column.draftMarks.size} märget), kinnitamata
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
