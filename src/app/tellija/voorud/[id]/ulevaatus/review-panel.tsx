'use client';

/**
 * The review table and its two permitted adjustments.
 *
 * The workload column is a warning and nothing more: the framework gives the
 * buyer the *right* to move down the ranking when a partner is overloaded, not
 * an obligation, and the tool must not decide for them [T-03]. So the flag is
 * visible on every row, the controls are available on every row, and each one
 * demands a justification before it will apply [T-02].
 */

import Link from 'next/link';
import { ActionForm, Disclosure } from '@/components/action-form';
import { RankChip, StatusBadge } from '@/components/status-badge';
import {
  applyAdjustmentAction,
  clearAdjustmentAction,
  confirmAllocationAction,
} from '@/server/actions/rounds-buyer';

export interface ReviewRow {
  lotPartnerId: string;
  rank: number;
  partnerName: string;
  outcome: string | null;
  excluded: boolean;
  markCount: number;
  cap: number | null;
  capKind: 'trainings' | 'participants';
  proposedCount: number;
  finalTrainings: Array<{ code: string; eventDate: string }>;
  finalCount: number;
  valueText: string;
  workload: number;
  overThreshold: boolean;
  adjustment: { kind: 'skip' | 'cap'; cap: number | null; justification: string } | null;
}

export interface LeftoverRef {
  id: string;
  code: string;
  title: string;
  eventDate: string;
  value: string;
}

export function ReviewPanel({
  roundId,
  lotCode,
  confirmed,
  threshold,
  thresholdNote,
  rows,
  leftovers,
  orders,
  outcomeLabels,
}: {
  roundId: string;
  lotId: string;
  lotCode: string;
  confirmed: boolean;
  threshold: number;
  thresholdNote: string;
  rows: ReviewRow[];
  leftovers: LeftoverRef[];
  orders: Array<{ id: string; number: string; partnerName: string; trainingCount: number; total: string }>;
  outcomeLabels: Record<string, string>;
}) {
  const adjusted = rows.filter((row) => row.adjustment !== null);
  const totalAllocated = rows.reduce((sum, row) => sum + row.finalCount, 0);
  const changedByAdjustment = rows.some((row) => row.finalCount !== row.proposedCount);

  return (
    <div className="space-y-5">
      <section className="kh-card">
        <div className="border-b border-[var(--color-border)] px-4 py-3">
          <h2>{confirmed ? 'Lõplik jaotus' : 'Jaotusettepanek ja kohandused'}</h2>
          <p className="mt-0.5 text-[12.5px] text-[var(--color-muted)]">
            Töömahu piir hankeosas {lotCode} on {threshold} koolitust.
            {thresholdNote && ` ${thresholdNote}`} Piir on <strong>hoiatus</strong>, mitte
            automaatne reegel — vahelejätmine ja piiramine on tellija õigus, mida ei pea rakendama.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="kh-th">Koht</th>
                <th className="kh-th">Partner</th>
                <th className="kh-th">Vastus</th>
                <th className="kh-th">Märkeid</th>
                <th className="kh-th">Ettepanekus</th>
                <th className="kh-th">{confirmed ? 'Lõplikus' : 'Praegu'}</th>
                <th className="kh-th">Maksumus</th>
                <th className="kh-th">Töömaht</th>
                {!confirmed && <th className="kh-th">Kohandus</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.lotPartnerId}
                  data-testid={`review-row-${row.rank}`}
                  style={row.excluded ? { opacity: 0.55 } : undefined}
                >
                  <td className="kh-td">
                    <RankChip rank={row.rank} muted={row.excluded} />
                  </td>
                  <td className="kh-td font-semibold">{row.partnerName}</td>
                  <td className="kh-td whitespace-nowrap">
                    {row.outcome ? (
                      <StatusBadge
                        label={outcomeLabels[row.outcome] ?? row.outcome}
                        tone={
                          row.outcome === 'confirmed'
                            ? 'success'
                            : row.outcome === 'no_response'
                              ? 'danger'
                              : 'warning'
                        }
                      />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="kh-td tabular-nums">
                    {row.markCount}
                    {row.cap !== null && (
                      <span className="ml-1 text-[12px] text-[var(--color-muted)]">
                        (piir {row.cap} {row.capKind === 'participants' ? 'osalejat' : 'koolitust'})
                      </span>
                    )}
                  </td>
                  <td className="kh-td tabular-nums">{row.proposedCount}</td>
                  <td className="kh-td font-semibold tabular-nums">
                    {row.finalCount}
                    {row.finalCount !== row.proposedCount && (
                      <span
                        className="ml-1 text-[12px]"
                        style={{ color: 'var(--color-warning)' }}
                        title="Kohandus muutis seda arvu"
                      >
                        ({row.finalCount > row.proposedCount ? '+' : ''}
                        {row.finalCount - row.proposedCount})
                      </span>
                    )}
                    {row.finalTrainings.length > 0 && (
                      <div
                        data-testid={`final-codes-${row.rank}`}
                        className="mt-0.5 text-[11px] font-normal text-[var(--color-muted)]"
                      >
                        {row.finalTrainings.map((t) => t.code).join(', ')}
                      </div>
                    )}
                  </td>
                  <td className="kh-td whitespace-nowrap tabular-nums">{row.valueText}</td>
                  <td className="kh-td whitespace-nowrap">
                    <span
                      className="tabular-nums"
                      style={row.overThreshold ? { color: 'var(--color-warning)', fontWeight: 650 } : undefined}
                    >
                      {row.workload}
                    </span>
                    {row.overThreshold && (
                      <div className="text-[11px]" style={{ color: 'var(--color-warning)' }}>
                        piir täis
                      </div>
                    )}
                  </td>
                  {!confirmed && (
                    <td className="kh-td">
                      {row.excluded ? (
                        <span className="text-[12px] text-[var(--color-muted)]">
                          välja arvatud
                        </span>
                      ) : row.adjustment ? (
                        <div className="space-y-1.5">
                          <StatusBadge
                            label={
                              row.adjustment.kind === 'skip'
                                ? 'Jäetakse vahele'
                                : `Piiratud ${row.adjustment.cap}`
                            }
                            tone="warning"
                          />
                          {/* [T-02] the justification is mandatory, so it has to
                              be visible where the adjustment is. */}
                          <p className="max-w-[22rem] text-[12px] text-[var(--color-muted)]">
                            {row.adjustment.justification}
                          </p>
                          <ActionForm
                            action={clearAdjustmentAction}
                            submitLabel="Tühista kohandus"
                            hidden={{ roundId, lotPartnerId: row.lotPartnerId }}
                          />
                        </div>
                      ) : (
                        <AdjustmentControls roundId={roundId} row={row} />
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {leftovers.length > 0 && (
        <section
          className="rounded-[10px] border p-4"
          style={{ borderColor: 'var(--color-danger)', background: 'var(--color-danger-soft)' }}
        >
          <h2 style={{ color: 'var(--color-danger)' }}>Jääk ({leftovers.length})</h2>
          <p className="mt-1 text-[13px]" style={{ color: 'var(--color-danger)' }}>
            {confirmed
              ? 'Need koolitused ootavad otsust töölaual: uus voor kõigile partneritele või tühistamine.'
              : 'Praeguse seisuga ei saaks need koolitused täitjat. Pärast kinnitamist saab neile töölaual uue vooru luua.'}
          </p>
          <ul className="mt-2 space-y-0.5 text-[13px]">
            {leftovers.map((leftover) => (
              <li key={leftover.id}>
                <span className="font-semibold">{leftover.code}</span> · {leftover.title} ·{' '}
                {leftover.eventDate} · {leftover.value}
              </li>
            ))}
          </ul>
          {confirmed && (
            <p className="mt-2">
              <Link href="/tellija#jaak" className="kh-btn">
                Ava jäägi otsused
              </Link>
            </p>
          )}
        </section>
      )}

      {!confirmed && (
        <section
          className="rounded-[10px] border p-4"
          style={{ borderColor: 'var(--color-brand)', background: 'var(--color-brand-soft)' }}
        >
          <h2 style={{ color: 'var(--color-brand)' }}>Kinnita jaotus</h2>
          <p className="mt-1 max-w-[80ch] text-[13px]">
            Kinnitamine loob iga täitja kohta tellimuse. Raamlepingu järgi on tellimus käsitletav
            hankelepinguna, mistõttu kinnitamine on <strong>pöördumatu</strong>. Partnerid saavad
            teate oma koolitustest; need, kelle märgitud koolitus läks mujale, saavad neutraalse
            teate ilma teise partneri nime avaldamata.
          </p>
          <ul className="mt-2 text-[13px]">
            <li>
              Jaotatakse <strong>{totalAllocated}</strong> koolitust{' '}
              {rows.filter((r) => r.finalCount > 0).length} partnerile
            </li>
            {leftovers.length > 0 && (
              <li>
                Jääk: <strong>{leftovers.length}</strong> koolitust
              </li>
            )}
            {adjusted.length > 0 && (
              <li>
                Kohandusi: <strong>{adjusted.length}</strong>
                {changedByAdjustment && ' — jaotus erineb esialgsest ettepanekust'}
              </li>
            )}
          </ul>
          <div className="mt-3">
            <ActionForm
              action={confirmAllocationAction}
              submitLabel="Kinnita jaotus ja loo tellimused"
              variant="primary"
              confirm="Kinnitada jaotus? Tellimused on hankelepingud ja seda ei saa tagasi võtta."
              hidden={{ roundId }}
              testId="confirm-allocation"
            />
          </div>
        </section>
      )}

      {confirmed && orders.length > 0 && (
        <section className="kh-card">
          <div className="border-b border-[var(--color-border)] px-4 py-3">
            <h2>Loodud tellimused</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="kh-th">Tellimus</th>
                  <th className="kh-th">Partner</th>
                  <th className="kh-th">Koolitusi</th>
                  <th className="kh-th">Kogumaksumus</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td className="kh-td font-semibold whitespace-nowrap">
                      <Link
                        href={`/tellija/tellimused/${order.id}`}
                        className="text-[var(--color-brand)]"
                      >
                        {order.number}
                      </Link>
                    </td>
                    <td className="kh-td">{order.partnerName}</td>
                    <td className="kh-td tabular-nums">{order.trainingCount}</td>
                    <td className="kh-td whitespace-nowrap tabular-nums">{order.total}</td>
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

/** Skip or cap one partner — each with the justification the engine demands. */
function AdjustmentControls({ roundId, row }: { roundId: string; row: ReviewRow }) {
  return (
    <div className="min-w-[15rem] space-y-2">
      <Disclosure summary="Jäta vahele">
        <ActionForm
          action={applyAdjustmentAction}
          submitLabel="Jäta vahele"
          variant="danger"
          hidden={{ roundId, lotPartnerId: row.lotPartnerId, kind: 'skip' }}
          className="space-y-2"
        >
          <p className="text-[12px] text-[var(--color-muted)]">
            Partneri märked liiguvad järjestuses allapoole.
          </p>
          <textarea
            name="justification"
            required
            rows={2}
            maxLength={400}
            placeholder="Põhjendus — nt suur töömaht, teised koolitused võivad kannatada"
            className="kh-input"
          />
        </ActionForm>
      </Disclosure>

      <Disclosure summary="Piira jaotust">
        <ActionForm
          action={applyAdjustmentAction}
          submitLabel="Rakenda piirmäär"
          hidden={{ roundId, lotPartnerId: row.lotPartnerId, kind: 'cap' }}
          className="space-y-2"
        >
          <label className="block">
            <span className="text-[12.5px] font-semibold">Maksimaalselt koolitusi</span>
            <input
              type="number"
              name="cap"
              min={0}
              max={row.markCount}
              defaultValue={Math.max(0, row.proposedCount - 1)}
              required
              className="kh-input mt-1"
            />
          </label>
          <textarea
            name="justification"
            required
            rows={2}
            maxLength={400}
            placeholder="Põhjendus"
            className="kh-input"
          />
        </ActionForm>
      </Disclosure>
    </div>
  );
}
