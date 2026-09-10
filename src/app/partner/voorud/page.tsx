/**
 * A partner's rounds.
 *
 * Only rounds of lots this company belongs to, and only from publication
 * onwards — a draft round does not exist as far as a partner is concerned.
 */

import Link from 'next/link';
import { getDb } from '@/db';
import { frameworkIdentity } from '@/server/framework';
import { frameworkClause } from '@/domain/framework';
import { formatDateTimeShort } from '@/domain/format';
import { RESPONSE_STATE_LABELS, ROUND_STATUS_LABELS, ROUND_STATUS_TONES } from '@/domain/round-statuses';
import { Countdown } from '@/components/countdown';
import { RankChip, StatusBadge } from '@/components/status-badge';
import { requirePartner } from '@/server/auth/actor';
import { currentTimeMs } from '@/server/clock';
import { runDueJobs } from '@/server/rounds/jobs';
import {
  latestConfirmation,
  participantForPartner,
  responseStateFor,
  roundsForPartner,
} from '@/server/rounds/views';

export const dynamic = 'force-dynamic';

export default async function PartnerRoundsPage() {
  const actor = await requirePartner();
  // Lazy check, so a partner never sees an open round whose window has passed.
  runDueJobs();

  const db = getDb();
  const nowMs = currentTimeMs();
  const rounds = roundsForPartner(db, actor.partnerId);

  const rows = rounds.map((round) => {
    const participant = participantForPartner(db, round.id, actor.partnerId);
    const latest = participant
      ? latestConfirmation(db, round.id, participant.lotPartnerId)
      : undefined;
    const state = participant
      ? responseStateFor(latest, participant.draftMarks, participant.draftCap, participant.draftCapKind)
      : 'none';
    return { round, participant, latest, state };
  });

  const open = rows.filter((row) => row.round.status === 'open');
  const closed = rows.filter((row) => row.round.status === 'closed');
  const confirmed = rows.filter((row) => row.round.status === 'confirmed');

  return (
    <div className="space-y-6">
      <div>
        <h1>Voorud</h1>
        <p className="mt-1 max-w-[80ch] text-[var(--color-muted)]">
          Koolitustellimused, mille alus on {frameworkClause(frameworkIdentity(db))}. Iga voor
          läheb korraga kõigile hankeosa partneritele ja jaotatakse rangelt raamlepingu järjestuse
          alusel — vastamise kiirus eelist ei anna.
        </p>
      </div>

      <section>
        <h2 className="mb-3">Ootavad vastust</h2>
        {open.length === 0 ? (
          <p className="kh-card p-4 text-[var(--color-muted)]">
            Praegu ei oota ükski voor teie vastust.
          </p>
        ) : (
          <ul className="space-y-3">
            {open.map(({ round, participant, latest, state }) => {
              const urgent = round.deadlineAt !== null && round.deadlineAt - nowMs <= 86_400_000;
              const needsAttention = state === 'none' || state === 'unconfirmed_changes' || state === 'draft_only';
              return (
                <li
                  key={round.id}
                  className="kh-card p-4"
                  style={
                    needsAttention
                      ? { borderColor: 'var(--color-warning)', borderWidth: 2 }
                      : undefined
                  }
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <Link
                      href={`/partner/voorud/${round.id}`}
                      className="text-[15px] font-bold text-[var(--color-brand)]"
                    >
                      {round.code}
                    </Link>
                    {participant && <RankChip rank={participant.rankAtPublication} />}
                    <StatusBadge
                      label={RESPONSE_STATE_LABELS[state]}
                      tone={
                        state === 'confirmed'
                          ? 'success'
                          : state === 'declined_all'
                            ? 'neutral'
                            : 'warning'
                      }
                    />
                    <span className="text-[13px] text-[var(--color-muted)]">
                      {round.lotCode} — {round.lotName}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
                    <span>
                      <span className="text-[var(--color-muted)]">Vastamistähtaeg: </span>
                      <span className="font-semibold tabular-nums">
                        {round.deadlineAt ? formatDateTimeShort(round.deadlineAt) : '—'}
                      </span>
                    </span>
                    {round.deadlineAt && (
                      <Countdown baseNowMs={nowMs} deadlineAt={round.deadlineAt} />
                    )}
                    {latest && (
                      <span className="text-[var(--color-muted)]">
                        viimane kinnitus {formatDateTimeShort(latest.confirmedAt)}
                      </span>
                    )}
                  </div>

                  {state === 'unconfirmed_changes' && (
                    <p
                      className="mt-2 rounded-md border px-3 py-2 text-[13px] font-semibold"
                      style={{
                        borderColor: 'var(--color-warning)',
                        background: 'var(--color-warning-soft)',
                        color: 'var(--color-warning)',
                      }}
                    >
                      Teil on kinnitamata muudatused. Tähtajal loevad ainult kinnitatud märked.
                    </p>
                  )}
                  {state === 'none' && (
                    <p className="mt-2 text-[13px]" style={{ color: 'var(--color-warning)' }}>
                      Te ei ole veel vastanud. Tähtajaks vastamata jätmine loetakse loobumiseks.
                    </p>
                  )}

                  <p className="mt-3">
                    <Link
                      href={`/partner/voorud/${round.id}`}
                      className={urgent || needsAttention ? 'kh-btn kh-btn-primary' : 'kh-btn'}
                    >
                      {state === 'none' ? 'Ava ja märgi koolitused' : 'Ava voor'}
                    </Link>
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {closed.length > 0 && (
        <section>
          <h2 className="mb-3">Ootavad tellija otsust</h2>
          <ul className="space-y-2">
            {closed.map(({ round, participant }) => (
              <li key={round.id} className="kh-card flex flex-wrap items-center gap-3 p-3">
                <Link href={`/partner/voorud/${round.id}`} className="font-semibold text-[var(--color-brand)]">
                  {round.code}
                </Link>
                {participant && <RankChip rank={participant.rankAtPublication} />}
                <span className="text-[13px] text-[var(--color-muted)]">{round.lotCode}</span>
                <span className="text-[13px]">
                  Vastamistähtaeg möödus. Tellija kinnitab jaotust
                  {round.expectedDecisionAt
                    ? ` eeldatavasti ${formatDateTimeShort(round.expectedDecisionAt)}`
                    : ''}
                  .
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {confirmed.length > 0 && (
        <section>
          <h2 className="mb-3">Lõpetatud voorud</h2>
          <ul className="space-y-2">
            {confirmed.map(({ round }) => (
              <li key={round.id} className="kh-card flex flex-wrap items-center gap-3 p-3">
                <Link href={`/partner/voorud/${round.id}`} className="font-semibold text-[var(--color-brand)]">
                  {round.code}
                </Link>
                <span className="text-[13px] text-[var(--color-muted)]">
                  {round.lotCode} · kinnitatud{' '}
                  {round.confirmedAt ? formatDateTimeShort(round.confirmedAt) : '—'}
                </span>
                <StatusBadge
                  label={ROUND_STATUS_LABELS[round.status]}
                  tone={ROUND_STATUS_TONES[round.status]}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
