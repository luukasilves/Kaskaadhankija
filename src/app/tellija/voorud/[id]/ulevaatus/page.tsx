/**
 * Ülevaatus — the buyer's review of a closed round [T-01…T-04].
 *
 * The proposal was frozen at the deadline. Here the buyer may exercise exactly
 * the two rights the framework gives them, each requiring a justification:
 * skip a partner, or cap what they receive [T-02]. Nothing else — no handing a
 * training to a chosen partner, no reordering. The workload figure is a
 * *warning*, never an action: "see on jälle meie õigus … me ei pea seda
 * rakendama" [T-03].
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { buyerCanWrite } from '@/server/auth/actor';
import { ReadOnlyNote } from '@/components/read-only-note';
import { lots, orders, rounds, trainings } from '@/db/schema';
import { formatDateTimeShort, formatEur, formatIsoDay } from '@/domain/format';
import { PARTICIPANT_OUTCOME_LABELS, ROUND_STATUS_LABELS, ROUND_STATUS_TONES } from '@/domain/round-statuses';
import { RankChip, StatusBadge } from '@/components/status-badge';
import { effectiveAdjustmentRows } from '@/server/rounds/allocation-input';
import { previewFinalAllocation } from '@/server/rounds/engine';
import { latestConfirmation, participantsOf, workloadFor } from '@/server/rounds/views';
import { ReviewPanel } from './review-panel';

export const dynamic = 'force-dynamic';

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const canWrite = await buyerCanWrite();

  const round = db
    .select({
      id: rounds.id,
      code: rounds.code,
      status: rounds.status,
      closedAt: rounds.closedAt,
      confirmedAt: rounds.confirmedAt,
      confirmedBy: rounds.confirmedBy,
      deadlineAt: rounds.deadlineAt,
      expectedDecisionAt: rounds.expectedDecisionAt,
      workloadThresholdSnapshot: rounds.workloadThresholdSnapshot,
      proposalSnapshot: rounds.proposalSnapshot,
      finalSnapshot: rounds.finalSnapshot,
      lotId: lots.id,
      lotCode: lots.code,
      lotName: lots.name,
      lotThresholdNote: lots.thresholdNote,
    })
    .from(rounds)
    .innerJoin(lots, eq(lots.id, rounds.lotId))
    .where(eq(rounds.id, id))
    .get();

  if (!round) notFound();

  if (round.status === 'draft' || round.status === 'open') {
    return (
      <div className="kh-card p-6">
        <h1>{round.code} — ülevaatus</h1>
        <p className="mt-2 text-[var(--color-muted)]">
          Ülevaatus avaneb pärast vastamistähtaja möödumist, kui jaotusettepanek on külmutatud.
        </p>
        <p className="mt-3">
          <Link href={`/tellija/voorud/${id}`} className="text-[var(--color-brand)]">
            Ava vooru maatriks
          </Link>
        </p>
      </div>
    );
  }

  const isConfirmed = round.status === 'confirmed';
  const proposal = round.proposalSnapshot?.result;
  // Before confirmation the preview reflects any adjustments already applied.
  const current = isConfirmed ? round.finalSnapshot?.result : previewFinalAllocation(db, id);

  const adjustmentRows = effectiveAdjustmentRows(db, id);
  const participants = participantsOf(db, id);

  const trainingById = new Map(
    db.select().from(trainings).all().map((t) => [t.id, t] as const),
  );

  const rows = participants.map((participant) => {
    const latest = latestConfirmation(db, id, participant.lotPartnerId);
    const proposed =
      proposal?.allocations.find((a) => a.lotPartnerId === participant.lotPartnerId)?.trainingIds ??
      [];
    const final =
      current?.allocations.find((a) => a.lotPartnerId === participant.lotPartnerId)?.trainingIds ??
      [];
    const adjustment = adjustmentRows.find((a) => a.lotPartnerId === participant.lotPartnerId);
    const workload = workloadFor(db, participant.lotPartnerId);
    const value = final.reduce(
      (sum, trainingId) => sum + (trainingById.get(trainingId)?.estimatedValueEur ?? 0),
      0,
    );
    return {
      lotPartnerId: participant.lotPartnerId,
      rank: participant.rankAtPublication,
      partnerName: participant.partnerName,
      outcome: participant.outcomeAtClose,
      excluded: participant.excludedAt !== null,
      markCount: latest && latest.kind === 'confirm' ? latest.marks.length : 0,
      cap: latest?.cap ?? null,
      capKind: latest?.capKind ?? ('trainings' as const),
      proposedCount: proposed.length,
      finalTrainings: final.map((trainingId) => ({
        code: trainingById.get(trainingId)?.code ?? '',
        eventDate: formatIsoDay(trainingById.get(trainingId)?.eventDate ?? ''),
      })),
      finalCount: final.length,
      valueText: formatEur(value),
      workload,
      overThreshold: workload >= round.workloadThresholdSnapshot,
      adjustment: adjustment
        ? {
            kind: adjustment.kind === 'skip' ? ('skip' as const) : ('cap' as const),
            cap: adjustment.capValue,
            justification: adjustment.justification,
          }
        : null,
    };
  });

  const leftoverRows = (current?.leftover ?? []).map((trainingId) => {
    const training = trainingById.get(trainingId);
    return {
      id: trainingId,
      code: training?.code ?? '',
      title: training?.title ?? '',
      eventDate: formatIsoDay(training?.eventDate ?? ''),
      value: formatEur(training?.estimatedValueEur ?? 0),
    };
  });

  const createdOrders = isConfirmed
    ? db.select().from(orders).where(eq(orders.roundId, id)).all()
    : [];

  return (
    <div className="space-y-5">
      <div>
        <Link href={`/tellija/voorud/${id}`} className="text-[13px] text-[var(--color-brand)]">
          ← {round.code}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1>{round.code} — jaotuse ülevaatus</h1>
          <StatusBadge
            label={ROUND_STATUS_LABELS[round.status]}
            tone={ROUND_STATUS_TONES[round.status]}
          />
        </div>
        <p className="mt-1 text-[var(--color-muted)]">
          {round.lotCode} — {round.lotName} · tähtaeg möödus{' '}
          {round.deadlineAt ? formatDateTimeShort(round.deadlineAt) : '—'} · ettepanek külmutati{' '}
          {round.closedAt ? formatDateTimeShort(round.closedAt) : '—'}
        </p>
        {isConfirmed && round.confirmedAt && (
          <p className="mt-1 text-[13px]" style={{ color: 'var(--color-success)' }}>
            Jaotus kinnitatud {formatDateTimeShort(round.confirmedAt)} · {round.confirmedBy}
          </p>
        )}
      </div>

      {!canWrite && <ReadOnlyNote what="Kohandused ja jaotuse kinnitamine" />}

      <ReviewPanel
        canWrite={canWrite}
        roundId={id}
        lotId={round.lotId}
        lotCode={round.lotCode}
        confirmed={isConfirmed}
        threshold={round.workloadThresholdSnapshot}
        thresholdNote={round.lotThresholdNote}
        rows={rows}
        leftovers={leftoverRows}
        orders={createdOrders.map((order) => ({
          id: order.id,
          number: `KH-${order.orderYear}-${String(order.orderSeq).padStart(4, '0')}`,
          partnerName: order.documentSnapshot.partnerName,
          trainingCount: order.documentSnapshot.trainings.length,
          total: formatEur(order.documentSnapshot.totalEur),
        }))}
        outcomeLabels={PARTICIPANT_OUTCOME_LABELS}
      />
    </div>
  );
}
