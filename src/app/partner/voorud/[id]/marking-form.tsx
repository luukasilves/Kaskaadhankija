'use client';

/**
 * Marking, capping, confirming and declining.
 *
 * Design notes that matter:
 *
 *  - Every training can be marked, whatever its state says. The display
 *    *informs*, it never restricts [K-01] — which is also what makes revision
 *    during the window safe: a partner can always mark a fallback, so a
 *    higher-ranked partner marking everything and withdrawing late achieves
 *    nothing.
 *  - The unconfirmed-changes banner is loud on purpose. Only confirmed marks
 *    count at the deadline [K-03], and a saved draft that looks committed would
 *    be the single most damaging thing this UI could imply.
 *  - Declining everything is behind a confirmation, since an empty confirmation
 *    is recorded as a decline [E-03].
 *  - The cap is an explicit choice, „Piirmäära ei ole“ or „Kuni N“ [K-06]. An
 *    empty number field used to mean "no cap", and a tester asked whether she
 *    was supposed to fill it in.
 *  - Three bulk buttons above the table — marking twelve rows one by one was
 *    the tedium the room complained about; the checkboxes stay for the rest.
 */

import { useMemo, useState } from 'react';
import { ActionForm } from '@/components/action-form';
import { StatusBadge } from '@/components/status-badge';
import type { CapKind, TrainingViewState } from '@/domain/allocate';
import { groupIndexRange, UNIT_WORDS, type RoundKind } from '@/domain/clusters';
import { HIND } from '@/domain/pricing';
import { allowedCapKinds, type CapOptions, type StatusTone } from '@/domain/round-statuses';
import {
  confirmMarksAction,
  declineAllAction,
  saveDraftAction,
} from '@/server/actions/rounds-partner';

export interface MarkingTraining {
  id: string;
  code: string;
  title: string;
  workshopType: string;
  eventDate: string;
  eventEnd: string | null;
  county: string;
  locationText: string;
  targetGroup: string;
  participants: number;
  language: string;
  /** max participants × this partner's price per participant [T-08] */
  maxPriceText: string;
  notes: string;
  stateLabel: string | null;
  /** the [N-03] reason, shown under the badge rather than inside it */
  stateReason: string | null;
  stateTone: StatusTone | null;
  /** the [N-03] state itself, for „Märgi kõik saadaval“ */
  stateKey: TrainingViewState | null;
  /** codes of this company's other commitments on the same day [N-02] */
  sameDay: string[];
}

/**
 * One cluster of a cluster round [K-10][L-28]: the partner says how many of its
 * groups they take, not which. The first n group ids are what „n rühma“ means,
 * and that is what the hidden `marks` fields carry.
 */
export interface MarkingCluster {
  clusterCode: string;
  title: string;
  workshopType: string;
  targetGroup: string;
  county: string;
  locationText: string;
  language: string;
  notes: string;
  /** „okt–dets 2026“ */
  periodText: string;
  /** „01.10.2026 – 31.12.2026“ */
  periodDaysText: string;
  /** group ids in group order */
  groupIds: string[];
  groupSize: number;
  totalParticipants: number;
  /** group size × this partner's price per participant [T-08] */
  groupPriceText: string;
  /** [N-03] as counts, from the saved draft's projection; null in a sealed round */
  held: number | null;
  free: number | null;
  projected: number | null;
  stateLabel: string | null;
  stateReason: string | null;
  stateTone: StatusTone | null;
  /** after confirmation: the group numbers allocated to this partner */
  finalIndices: number[] | null;
}

export function MarkingForm({
  roundId,
  roundKind = 'fixed',
  clusters = [],
  editable,
  dynamic,
  responseState,
  capOptions,
  draftMarks,
  draftCap,
  draftCapKind,
  confirmedMarks,
  confirmedCap,
  confirmedCapKind,
  confirmedAt,
  confirmedKind,
  deadlineText,
  unitPriceText,
  finalMine,
  trainings,
}: {
  roundId: string;
  /** [V-09] dated trainings in a table, or clusters as cards */
  roundKind?: RoundKind;
  clusters?: MarkingCluster[];
  editable: boolean;
  dynamic: boolean;
  responseState: string;
  /** which cap kinds this round offers [K-06][L-17] */
  capOptions: CapOptions;
  draftMarks: string[];
  draftCap: number | null;
  draftCapKind: CapKind;
  confirmedMarks: string[];
  confirmedCap: number | null;
  confirmedCapKind: CapKind | null;
  confirmedAt: string | null;
  confirmedKind: 'confirm' | 'decline_all' | null;
  deadlineText: string;
  /** this partner's framework price per participant in the lot, shown once [T-08] */
  unitPriceText: string;
  /** after confirmation: the trainings actually allocated to this partner */
  finalMine: string[] | null;
  trainings: MarkingTraining[];
}) {
  const allowedKinds = allowedCapKinds(capOptions);
  const unit = UNIT_WORDS[roundKind];
  const isCluster = roundKind === 'cluster';
  const [selected, setSelected] = useState<Set<string>>(new Set(draftMarks));
  const [cap, setCap] = useState<string>(draftCap === null ? '' : String(draftCap));
  /** „Kuni N“ chosen — the number counts only then [K-06] */
  const [hasCap, setHasCap] = useState<boolean>(draftCap !== null);
  const [capKind, setCapKind] = useState<CapKind>(
    allowedKinds.includes(draftCapKind) ? draftCapKind : (allowedKinds[0] ?? 'trainings'),
  );

  const confirmedSet = useMemo(() => new Set(confirmedMarks), [confirmedMarks]);
  const finalSet = useMemo(() => new Set(finalMine ?? []), [finalMine]);

  /**
   * Does the working selection differ from the binding confirmation?
   *
   * Compared against the *confirmation*, not the saved draft: the question the
   * banner answers is "would the deadline take what I see on screen?", and only
   * a confirmation can answer yes [K-03].
   */
  const dirty = useMemo(() => {
    const chosen = [...selected].sort();
    const bound = [...confirmedSet].sort();
    const sameMarks =
      chosen.length === bound.length && chosen.every((id, index) => id === bound[index]);
    const capValue = hasCap && cap.trim() !== '' ? Number(cap) : null;
    const sameCap =
      capValue === confirmedCap && (capValue === null || capKind === (confirmedCapKind ?? 'trainings'));
    return !sameMarks || !sameCap;
  }, [selected, confirmedSet, cap, hasCap, capKind, confirmedCap, confirmedCapKind]);

  /** What the forms send: the number only when „Kuni“ is chosen. */
  const capField = hasCap ? cap : '';

  /** How many of a cluster's groups the working selection asks for [K-10]. */
  const countIn = (cluster: MarkingCluster) => cluster.groupIds.filter((id) => selected.has(id)).length;

  /** Ask for n groups of a cluster: the first n ids, whichever were chosen before. */
  const setCount = (cluster: MarkingCluster, n: number) =>
    setSelected((current) => {
      const next = new Set(current);
      for (const id of cluster.groupIds) next.delete(id);
      const wanted = Math.max(0, Math.min(cluster.groupIds.length, Math.floor(n)));
      for (const id of cluster.groupIds.slice(0, wanted)) next.add(id);
      return next;
    });

  /** Not held by a higher-ranked partner — what „Märgi kõik saadaval“ marks [N-03]. */
  const markAvailable = () =>
    setSelected((current) => {
      const next = new Set(current);
      if (isCluster) {
        // In a cluster the free groups are a count, not particular rows.
        for (const cluster of clusters) {
          for (const id of cluster.groupIds) next.delete(id);
          for (const id of cluster.groupIds.slice(0, cluster.free ?? cluster.groupIds.length)) next.add(id);
        }
        return next;
      }
      for (const training of trainings) {
        if (training.stateKey === 'available' || training.stateKey === 'projected_to_you') next.add(training.id);
      }
      return next;
    });

  /** Trainees in the working selection, for the participants-kind cap. */
  const selectedParticipants = useMemo(
    () => trainings.filter((t) => selected.has(t.id)).reduce((sum, t) => sum + t.participants, 0),
    [selected, trainings],
  );

  const toggle = (id: string) => {
    if (!editable) return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const hiddenMarks = [...selected].map((id) => (
    <input key={id} type="hidden" name="marks" value={id} />
  ));

  return (
    <div className="space-y-4">
      {editable && (responseState === 'unconfirmed_changes' || dirty) && (
        <div
          data-testid="unconfirmed-banner"
          className="rounded-[10px] border-2 p-4"
          style={{ borderColor: 'var(--color-warning)', background: 'var(--color-warning-soft)' }}
        >
          <h2 style={{ color: 'var(--color-warning)' }}>Kinnitamata muudatused</h2>
          <p className="mt-1 text-[13px]">
            Tähtajal <strong>loevad ainult kinnitatud märked</strong>. Praegune valik ei ole veel
            kinnitatud — vajuta „Kinnita valik“, muidu jääb kehtima
            {confirmedAt
              ? ` ${confirmedAt} kinnitatud valik (${confirmedMarks.length} ${unit.partitive}).`
              : ' vastamata olek, mis loetakse loobumiseks.'}
          </p>
        </div>
      )}

      <section className="kh-card">
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--color-border)] px-4 py-3">
          {isCluster ? (
            <h2>Vooru klastrid ({clusters.length})</h2>
          ) : (
            <h2>Vooru koolitused ({trainings.length})</h2>
          )}
          <span className="text-[12px] text-[var(--color-muted)]">
            Teie {HIND.osalejaKohta.toLowerCase()}: <strong>{unitPriceText}</strong> — „{HIND.ruhmaTaitumisel}“ on
            see korrutatud {isCluster ? 'rühma suurusega' : 'koolituse maksimaalse osalejate arvuga'}.
          </span>
          {editable && (
            <span className="text-[13px] text-[var(--color-muted)]">
              Valitud: <strong>{selected.size}</strong>{isCluster && ` ${unit.partitive}`}
            </span>
          )}
          {editable && (
            <span className="flex flex-wrap gap-1.5" data-testid="bulk-mark">
              {dynamic && (
                <button type="button" className="kh-btn text-xs" onClick={markAvailable}>
                  Märgi kõik saadaval
                </button>
              )}
              <button
                type="button"
                className="kh-btn text-xs"
                onClick={() => setSelected(new Set(trainings.map((training) => training.id)))}
              >
                Märgi kõik
              </button>
              <button type="button" className="kh-btn text-xs" onClick={() => setSelected(new Set())}>
                Tühjenda
              </button>
            </span>
          )}
          {dynamic && editable && (
            <span className="ml-auto text-[12px] text-[var(--color-muted)]">
              {isCluster
                ? 'Rühmi saate küsida sõltumata olekust — vaba arvu ületav soov on varuvariant, mis hakkab kehtima, kui eesõigusega partner loobub.'
                : 'Iga koolituse saate märkida sõltumata olekust — märge ilma prognoosita on varuvariant, mis hakkab kehtima, kui eesõigusega partner loobub.'}
            </span>
          )}
        </div>

        {isCluster && (
          <div data-testid="cluster-cards">
            {clusters.map((cluster) => {
              const count = countIn(cluster);
              const confirmedCount = cluster.groupIds.filter((id) => confirmedSet.has(id)).length;
              const gotCount = cluster.finalIndices?.length ?? 0;
              return (
                <article
                  key={cluster.clusterCode}
                  className="border-b border-[var(--color-border)] px-4 py-3 last:border-b-0"
                  data-testid="cluster-card"
                  style={gotCount > 0 ? { background: 'var(--color-success-soft)' } : undefined}
                >
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-semibold whitespace-nowrap">{cluster.clusterCode}</span>
                    <span>{cluster.title}</span>
                    {editable && confirmedCount !== count && (
                      <span className="text-[11px]" style={{ color: 'var(--color-warning)' }} title="Erineb kinnitatud valikust">
                        muudetud
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[12.5px] text-[var(--color-muted)]">
                    {cluster.workshopType} · {cluster.targetGroup} · {cluster.county}
                    {cluster.locationText && `, ${cluster.locationText}`} · {cluster.periodText} ({cluster.periodDaysText}) ·{' '}
                    {cluster.language}
                    {cluster.notes && ` · ${cluster.notes}`}
                  </div>
                  <div className="mt-1 text-[13px]" data-testid="cluster-size">
                    <strong>{cluster.groupIds.length} rühma</strong> × kuni {cluster.groupSize} osalejat ·{' '}
                    {cluster.totalParticipants} osalejat kokku · {HIND.ruhmaTaitumisel.toLowerCase()}{' '}
                    <strong>{cluster.groupPriceText}</strong>
                  </div>

                  {dynamic && cluster.stateLabel && cluster.stateTone && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px]" data-testid="cluster-state">
                      <StatusBadge label={cluster.stateLabel} tone={cluster.stateTone} />
                      {cluster.stateReason && <span className="text-[var(--color-muted)]">{cluster.stateReason}</span>}
                      {cluster.held !== null && cluster.free !== null && (
                        <span className="text-[var(--color-muted)]">
                          eesõigusega partnerid on kinnitanud kokku {cluster.held} rühma · vaba {cluster.free}
                        </span>
                      )}
                    </div>
                  )}

                  {editable && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]" data-testid="cluster-count">
                      <label className="flex items-center gap-2">
                        <span className="font-semibold">Võtan kuni</span>
                        <input
                          type="number"
                          min={0}
                          max={cluster.groupIds.length}
                          value={count}
                          onChange={(event) => setCount(cluster, Number(event.target.value) || 0)}
                          aria-label={`Rühmi klastris ${cluster.clusterCode}`}
                          className="kh-input w-20"
                        />
                        <span className="font-semibold">rühma</span>
                      </label>
                      <span className="text-[12px] text-[var(--color-muted)]">(0–{cluster.groupIds.length})</span>
                      {dynamic && cluster.free !== null && (
                        <button type="button" className="kh-btn text-xs" onClick={() => setCount(cluster, cluster.free ?? 0)}>
                          Kõik vabad ({cluster.free})
                        </button>
                      )}
                      <button type="button" className="kh-btn text-xs" onClick={() => setCount(cluster, cluster.groupIds.length)}>
                        Kõik ({cluster.groupIds.length})
                      </button>
                      <button type="button" className="kh-btn text-xs" onClick={() => setCount(cluster, 0)}>
                        Ei võta
                      </button>
                    </div>
                  )}

                  {dynamic && cluster.projected !== null && (
                    <div className="mt-1 text-[12.5px]" data-testid="cluster-projected">
                      Prognoosis teile (esialgne): <strong>{cluster.projected} rühma</strong>
                      {editable && count !== confirmedCount && (
                        <span className="text-[var(--color-muted)]"> — salvestatud mustandi seisuga</span>
                      )}
                    </div>
                  )}

                  {cluster.finalIndices !== null && (
                    <div className="mt-1 text-[13px]" data-testid="cluster-final">
                      {gotCount > 0 ? (
                        <>
                          <StatusBadge label="Määratud teile" tone="success" />{' '}
                          <strong>{gotCount} rühma</strong> ({groupIndexRange(cluster.finalIndices)})
                        </>
                      ) : confirmedCount > 0 ? (
                        <StatusBadge label="Määrati teisele partnerile" tone="neutral" />
                      ) : (
                        <span className="text-[var(--color-muted)]">—</span>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}

        <div className="overflow-x-auto" hidden={isCluster}>
          <table className="w-full">
            <thead>
              <tr>
                {editable && <th className="kh-th w-10">Märgi</th>}
                <th className="kh-th">Kood</th>
                <th className="kh-th">Koolitus</th>
                <th className="kh-th">Toimumine</th>
                <th className="kh-th">Asukoht</th>
                <th className="kh-th">{HIND.maxOsalejaid}</th>
                <th className="kh-th">Keel</th>
                <th className="kh-th">{HIND.ruhmaTaitumisel}</th>
                {dynamic && <th className="kh-th">Olek</th>}
                {finalMine && <th className="kh-th">Tulemus</th>}
              </tr>
            </thead>
            <tbody>
              {trainings.map((training) => {
                const isSelected = selected.has(training.id);
                const wasConfirmed = confirmedSet.has(training.id);
                const gotIt = finalSet.has(training.id);
                return (
                  <tr
                    key={training.id}
                    className={editable ? 'cursor-pointer hover:bg-[var(--color-surface-alt)]' : undefined}
                    onClick={() => toggle(training.id)}
                    style={gotIt ? { background: 'var(--color-success-soft)' } : undefined}
                  >
                    {editable && (
                      <td className="kh-td">
                        <input
                          type="checkbox"
                          aria-label={`Märgi ${training.code}`}
                          checked={isSelected}
                          onChange={() => toggle(training.id)}
                          onClick={(event) => event.stopPropagation()}
                        />
                      </td>
                    )}
                    <td className="kh-td font-semibold whitespace-nowrap">
                      {training.code}
                      {editable && wasConfirmed !== isSelected && (
                        <span
                          className="ml-1 text-[11px] font-normal"
                          style={{ color: 'var(--color-warning)' }}
                          title="Erineb kinnitatud valikust"
                        >
                          muudetud
                        </span>
                      )}
                    </td>
                    <td className="kh-td">
                      <div>{training.title}</div>
                      <div className="text-[12px] text-[var(--color-muted)]">
                        {training.workshopType} · {training.targetGroup}
                        {training.notes && ` · ${training.notes}`}
                      </div>
                    </td>
                    <td className="kh-td whitespace-nowrap tabular-nums">
                      {training.eventDate}
                      {training.eventEnd && ` – ${training.eventEnd}`}
                      {training.sameDay.length > 0 && (
                        <div
                          className="text-[11.5px] font-normal"
                          style={{ color: 'var(--color-warning)' }}
                          title="Teil on sel päeval juba koolitus — määratud või teises voorus kinnitatud"
                          data-testid="same-day"
                        >
                          Samal päeval: {training.sameDay.join(', ')}
                        </div>
                      )}
                    </td>
                    <td className="kh-td text-[13px]">
                      {training.county}
                      {training.locationText && (
                        <div className="text-[12px] text-[var(--color-muted)]">
                          {training.locationText}
                        </div>
                      )}
                    </td>
                    <td className="kh-td tabular-nums">{training.participants}</td>
                    <td className="kh-td text-[13px] whitespace-nowrap">{training.language}</td>
                    <td className="kh-td whitespace-nowrap tabular-nums">{training.maxPriceText}</td>
                    {dynamic && (
                      <td className="kh-td min-w-[168px]" data-testid="state-cell">
                        {training.stateLabel && training.stateTone ? (
                          <>
                            <StatusBadge label={training.stateLabel} tone={training.stateTone} />
                            {training.stateReason && (
                              <div className="mt-0.5 text-[11.5px] text-[var(--color-muted)]">
                                {training.stateReason}
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-[var(--color-muted)]">—</span>
                        )}
                      </td>
                    )}
                    {finalMine && (
                      <td className="kh-td min-w-[150px]">
                        {gotIt ? (
                          <StatusBadge label="Määratud teile" tone="success" />
                        ) : wasConfirmed ? (
                          <StatusBadge label="Määrati teisele partnerile" tone="neutral" />
                        ) : (
                          <span className="text-[var(--color-muted)]">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* One wrapper for the confirmation half — the guide's „kinnitamine“ figure
          is a picture of exactly this. */}
      <div className="space-y-4" data-testid="confirmation-area">
      {editable && (
        <section className="kh-card p-4">
          <h2>Kinnita oma valik</h2>
          <p className="mt-1 max-w-[80ch] text-[13px] text-[var(--color-muted)]">
            Kinnitatud märge on siduv: kui koolitus teile määratakse, olete kohustatud selle
            raamlepingu tingimustel läbi viima.{' '}
            {allowedKinds.length > 0
              ? isCluster
                ? 'Ülempiir kaitseb teid liigse mahu eest — piirmäära sees jaotatakse rühmad klastri kaupa järjekorranumbri järgi.'
                : 'Ülempiir kaitseb teid liigse mahu eest — piirmäära sees jaotatakse koolitused toimumiskuupäeva järjekorras.'
              : 'Selles voorus ülempiiri ei kasutata: iga kinnitatud märge on siduv.'}{' '}
            Valikut saab muuta ja uuesti kinnitada kuni {deadlineText || 'tähtajani'}.
          </p>

          {allowedKinds.length > 0 && (
            <div className="mt-3" data-testid="cap-control">
              <span className="text-[12.5px] font-semibold">Ülempiir</span>
              <div className="mt-1 space-y-1.5 text-[13px]" role="radiogroup" aria-label="Ülempiir">
                <label className="flex items-start gap-2">
                  <input
                    type="radio"
                    name="capChoice"
                    value="none"
                    checked={!hasCap}
                    onChange={() => setHasCap(false)}
                    className="mt-0.5"
                  />
                  <span>
                    <strong>Piirmäära ei ole</strong> — võtan vastu kõik kinnitatud märked (vaikimisi).
                  </span>
                </label>
                <label className="flex flex-wrap items-center gap-2">
                  <input
                    type="radio"
                    name="capChoice"
                    value="limit"
                    checked={hasCap}
                    onChange={() => setHasCap(true)}
                  />
                  <strong>Kuni</strong>
                  <input
                    type="number"
                    min={0}
                    max={capKind === 'participants' ? undefined : trainings.length}
                    value={cap}
                    onChange={(event) => {
                      setCap(event.target.value);
                      setHasCap(true);
                    }}
                    onFocus={() => setHasCap(true)}
                    aria-label="Piirmäär"
                    className="kh-input w-24"
                    style={hasCap ? undefined : { opacity: 0.6 }}
                  />
                  {allowedKinds.length > 1 ? (
                    <span className="flex flex-wrap items-center gap-3" role="radiogroup" aria-label="Piirmäära liik">
                      {allowedKinds.map((kind) => (
                        <label key={kind} className="flex items-center gap-1.5">
                          <input
                            type="radio"
                            name="capKindChoice"
                            value={kind}
                            checked={capKind === kind}
                            onChange={() => {
                              setCapKind(kind);
                              setHasCap(true);
                            }}
                          />
                          {kind === 'participants' ? 'osalejat kokku' : unit.partitive}
                        </label>
                      ))}
                    </span>
                  ) : (
                    <span>{allowedKinds[0] === 'participants' ? 'osalejat kokku' : unit.partitive}</span>
                  )}
                </label>
              </div>
              <span className="mt-1 block max-w-[80ch] text-[12px] text-[var(--color-muted)]">
                {hasCap && cap.trim() === ''
                  ? 'Sisesta arv — muidu piirmäära ei ole.'
                  : capKind === 'participants'
                    ? `Valitud ${isCluster ? 'rühmades' : 'koolitustes'} on kokku ${selectedParticipants} osalejat. ${isCluster ? 'Rühm' : 'Koolitus'}, mis eelarvesse ei mahu, jäetakse vahele ja järgmisi proovitakse edasi; vahelejäänud märked liiguvad järjestuses allapoole.`
                    : 'Piirmäära ületavad märked jäävad varuvariandiks ja liiguvad järjestuses allapoole.'}
              </span>
            </div>
          )}

          {confirmedAt && (
            <p className="mt-3 text-[13px]" style={{ color: 'var(--color-success)' }}>
              Viimane kinnitus {confirmedAt}:{' '}
              {confirmedKind === 'decline_all'
                ? `loobusite kõigist ${isCluster ? 'rühmadest' : 'koolitustest'}`
                : `${confirmedMarks.length} ${unit.partitive}`}
              .
            </p>
          )}
        </section>
      )}

      {/* The action bar sticks to the bottom on a phone, where the table is
          long and the buttons used to scroll out of sight; on wider screens it
          sits where it always did. Each form carries its own hidden fields, so
          the bar does not need to wrap the table. */}
      {editable && (
        <div
          data-testid="action-bar"
          className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-start gap-3 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0"
        >
          <ActionForm
            action={confirmMarksAction}
            submitLabel={selected.size === 0 ? 'Kinnita — loobun kõigist' : `Kinnita valik (${selected.size})`}
            variant="primary"
            confirm={
              selected.size === 0
                ? isCluster
                  ? 'Ühtegi rühma ei ole küsitud. Kinnitada loobumine kõigist vooru klastritest?'
                  : 'Ühtegi koolitust ei ole märgitud. Kinnitada loobumine kõigist vooru koolitustest?'
                : undefined
            }
            hidden={{ roundId, cap: capField, capKind }}
            testId="confirm-marks"
          >
            {hiddenMarks}
          </ActionForm>

          <ActionForm
            action={saveDraftAction}
            submitLabel="Salvesta mustand"
            hidden={{ roundId, cap: capField, capKind }}
            testId="save-draft"
          >
            {hiddenMarks}
          </ActionForm>

          <ActionForm
            action={declineAllAction}
            submitLabel="Loobun kõigist"
            variant="danger"
            confirm={
              isCluster
                ? 'Loobuda kõigist selle vooru klastritest? Otsust saab tähtajani muuta.'
                : 'Loobuda kõigist selle vooru koolitustest? Otsust saab tähtajani muuta.'
            }
            hidden={{ roundId }}
            testId="decline-all"
          />
        </div>
      )}
      </div>
    </div>
  );
}
