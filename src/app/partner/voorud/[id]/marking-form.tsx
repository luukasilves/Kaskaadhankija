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
 */

import { useMemo, useState } from 'react';
import { ActionForm } from '@/components/action-form';
import { StatusBadge } from '@/components/status-badge';
import type { StatusTone } from '@/domain/round-statuses';
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
  value: string;
  notes: string;
  stateLabel: string | null;
  /** the [N-03] reason, shown under the badge rather than inside it */
  stateReason: string | null;
  stateTone: StatusTone | null;
}

export function MarkingForm({
  roundId,
  editable,
  dynamic,
  responseState,
  draftMarks,
  draftCap,
  confirmedMarks,
  confirmedCap,
  confirmedAt,
  confirmedKind,
  deadlineText,
  finalMine,
  trainings,
}: {
  roundId: string;
  editable: boolean;
  dynamic: boolean;
  responseState: string;
  draftMarks: string[];
  draftCap: number | null;
  confirmedMarks: string[];
  confirmedCap: number | null;
  confirmedAt: string | null;
  confirmedKind: 'confirm' | 'decline_all' | null;
  deadlineText: string;
  /** after confirmation: the trainings actually allocated to this partner */
  finalMine: string[] | null;
  trainings: MarkingTraining[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(draftMarks));
  const [cap, setCap] = useState<string>(draftCap === null ? '' : String(draftCap));

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
    const capValue = cap.trim() === '' ? null : Number(cap);
    const sameCap = capValue === confirmedCap;
    return !sameMarks || !sameCap;
  }, [selected, confirmedSet, cap, confirmedCap]);

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
              ? ` ${confirmedAt} kinnitatud valik (${confirmedMarks.length} koolitust).`
              : ' vastamata olek, mis loetakse loobumiseks.'}
          </p>
        </div>
      )}

      <section className="kh-card">
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--color-border)] px-4 py-3">
          <h2>Vooru koolitused ({trainings.length})</h2>
          {editable && (
            <span className="text-[13px] text-[var(--color-muted)]">
              Valitud: <strong>{selected.size}</strong>
            </span>
          )}
          {dynamic && editable && (
            <span className="ml-auto text-[12px] text-[var(--color-muted)]">
              Iga koolituse saad märkida sõltumata olekust — märge ilma prognoosita on varuvariant,
              mis hakkab kehtima, kui eesõigusega partner loobub.
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {editable && <th className="kh-th w-10">Märgi</th>}
                <th className="kh-th">Kood</th>
                <th className="kh-th">Koolitus</th>
                <th className="kh-th">Toimumine</th>
                <th className="kh-th">Asukoht</th>
                <th className="kh-th">Osalejaid</th>
                <th className="kh-th">Keel</th>
                <th className="kh-th">Maksumus</th>
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
                    <td className="kh-td whitespace-nowrap tabular-nums">{training.value}</td>
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

      {editable && (
        <section className="kh-card p-4">
          <h2>Kinnita oma valik</h2>
          <p className="mt-1 max-w-[80ch] text-[13px] text-[var(--color-muted)]">
            Kinnitatud märge on siduv: kui koolitus teile määratakse, olete kohustatud selle
            raamlepingu tingimustel läbi viima. Ülempiir kaitseb teid liigse mahu eest — piirmäära
            sees jaotatakse koolitused toimumiskuupäeva järjekorras. Valikut saab muuta ja uuesti
            kinnitada kuni {deadlineText || 'tähtajani'}.
          </p>

          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-[12.5px] font-semibold">
                Ülempiir — võtan vastu kuni N koolitust
              </span>
              <input
                type="number"
                min={0}
                max={trainings.length}
                value={cap}
                onChange={(event) => setCap(event.target.value)}
                placeholder="piirmäära ei ole"
                className="kh-input mt-1"
              />
              <span className="mt-1 block text-[12px] text-[var(--color-muted)]">
                Jäta tühjaks, kui piirangut ei ole. Piirmäära ületavad märked jäävad varuvariandiks
                ja liiguvad järjestuses allapoole.
              </span>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-start gap-3">
            <ActionForm
              action={confirmMarksAction}
              submitLabel={selected.size === 0 ? 'Kinnita — loobun kõigist' : `Kinnita valik (${selected.size})`}
              variant="primary"
              confirm={
                selected.size === 0
                  ? 'Ühtegi koolitust ei ole märgitud. Kinnitada loobumine kõigist vooru koolitustest?'
                  : undefined
              }
              hidden={{ roundId, cap }}
              testId="confirm-marks"
            >
              {hiddenMarks}
            </ActionForm>

            <ActionForm
              action={saveDraftAction}
              submitLabel="Salvesta mustand"
              hidden={{ roundId, cap }}
              testId="save-draft"
            >
              {hiddenMarks}
            </ActionForm>

            <ActionForm
              action={declineAllAction}
              submitLabel="Loobun kõigist"
              variant="danger"
              confirm="Loobuda kõigist selle vooru koolitustest? Otsust saab tähtajani muuta."
              hidden={{ roundId }}
              testId="decline-all"
            />
          </div>

          {confirmedAt && (
            <p className="mt-3 text-[13px]" style={{ color: 'var(--color-success)' }}>
              Viimane kinnitus {confirmedAt}:{' '}
              {confirmedKind === 'decline_all'
                ? 'loobusite kõigist koolitustest'
                : `${confirmedMarks.length} koolitust`}
              .
            </p>
          )}
        </section>
      )}
    </div>
  );
}
