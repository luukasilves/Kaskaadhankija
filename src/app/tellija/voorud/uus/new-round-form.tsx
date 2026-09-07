'use client';

import { useMemo, useState } from 'react';
import { ActionForm } from '@/components/action-form';
import { CAP_OPTIONS_LABELS, CAP_OPTIONS_VALUES, type CapOptions } from '@/domain/round-statuses';
import { createRoundAction } from '@/server/actions/rounds-buyer';

export interface TrainingOption {
  id: string;
  code: string;
  title: string;
  workshopType: string;
  eventDate: string;
  county: string;
  targetGroup: string;
  participantCount: number;
  value: string;
  isLeftover: boolean;
}

export interface LotInfo {
  id: string;
  code: string;
  name: string;
  responseDeadlineWorkingDays: number;
  deadlineLocalTime: string;
  defaultVisibilityMode: 'dynamic' | 'sealed';
  defaultCapOptions: CapOptions;
  activePartnerCount: number;
}

export function NewRoundForm({
  lot,
  trainings,
}: {
  lot: LotInfo;
  trainings: TrainingOption[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return trainings;
    return trainings.filter((t) =>
      [t.code, t.title, t.county, t.targetGroup].some((field) =>
        field.toLowerCase().includes(needle),
      ),
    );
  }, [filter, trainings]);

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allVisibleSelected = visible.length > 0 && visible.every((t) => selected.has(t.id));

  return (
    <ActionForm
      action={createRoundAction}
      submitLabel={`Loo mustand (${selected.size} koolitust)`}
      variant="primary"
      disabled={selected.size === 0 || lot.activePartnerCount === 0}
      hidden={{ lotId: lot.id }}
      className="space-y-4"
    >
      {[...selected].map((id) => (
        <input key={id} type="hidden" name="trainingIds" value={id} />
      ))}

      <div className="kh-card p-4">
        <h2>Vooru seaded</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-[12.5px] font-semibold">Nähtavusrežiim</span>
            <select name="visibilityMode" defaultValue={lot.defaultVisibilityMode} className="kh-input mt-1">
              <option value="dynamic">
                Dünaamiline — partner näeb eesõigusega märgete mõju
              </option>
              <option value="sealed">Suletud — partner näeb ainult oma märkeid</option>
            </select>
            <span className="mt-1 block text-[12px] text-[var(--color-muted)]">
              Dünaamiline režiim näitab partnerile, kas koolituse on juba märkinud eesõigusega
              partner — ilma nime avaldamata. Suletud režiim on olemas juhuks, kui see ei sobi
              raamlepingu sõnastusega.
            </span>
          </label>
          <label className="block">
            <span className="text-[12.5px] font-semibold">Piirmäära liigid partneritele</span>
            <select name="capOptions" defaultValue={lot.defaultCapOptions} className="kh-input mt-1" data-testid="cap-options">
              {CAP_OPTIONS_VALUES.map((value) => (
                <option key={value} value={value}>
                  {CAP_OPTIONS_LABELS[value]}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[12px] text-[var(--color-muted)]">
              Partner võib oma kinnitatud märkeid piirata koolituste arvuga või määratavate koolituste
              osalejate koguarvuga. Osalejate eelarve puhul jäetakse mittemahtuv koolitus vahele ja
              järgmisi proovitakse edasi. Vaikeväärtus tuleb hankeosa seadetest.
            </span>
          </label>
          <label className="block">
            <span className="text-[12.5px] font-semibold">Märkus (ainult tellijale)</span>
            <textarea name="note" rows={2} maxLength={400} className="kh-input mt-1" />
          </label>
        </div>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
          <dt className="text-[var(--color-muted)]">Hankeosa</dt>
          <dd className="font-semibold">
            {lot.code} — {lot.name}
          </dd>
          <dt className="text-[var(--color-muted)]">Saajad</dt>
          <dd className="font-semibold">
            kõik {lot.activePartnerCount} aktiivset partnerit
            {lot.activePartnerCount === 0 && ' — hankeosal ei ole partnereid, vooru ei saa avaldada'}
          </dd>
          <dt className="text-[var(--color-muted)]">Vastamistähtaeg</dt>
          <dd className="font-semibold">
            {lot.responseDeadlineWorkingDays} tööpäeva, kell {lot.deadlineLocalTime} — määratakse
            avaldamisel
          </dd>
        </dl>
      </div>

      <div className="kh-card">
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--color-border)] px-4 py-3">
          <h2>Vali koolitused</h2>
          <span className="text-[13px] text-[var(--color-muted)]">
            {trainings.length} jaotamata koolitust hankeosas {lot.code}
          </span>
          <input
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Otsi koodi, nimetuse, maakonna või sihtrühma järgi"
            className="kh-input ml-auto max-w-[24rem]"
          />
        </div>

        {trainings.length === 0 ? (
          <p className="p-6 text-[var(--color-muted)]">
            Selles hankeosas ei ole jaotamata koolitusi. Impordi koolituskalender või vali teine
            hankeosa.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="kh-th w-8">
                    <input
                      type="checkbox"
                      aria-label="Vali kõik nähtavad"
                      checked={allVisibleSelected}
                      onChange={() =>
                        setSelected((current) => {
                          const next = new Set(current);
                          if (allVisibleSelected) visible.forEach((t) => next.delete(t.id));
                          else visible.forEach((t) => next.add(t.id));
                          return next;
                        })
                      }
                    />
                  </th>
                  <th className="kh-th">Kood</th>
                  <th className="kh-th">Koolitus</th>
                  <th className="kh-th">Formaat</th>
                  <th className="kh-th">Toimumine</th>
                  <th className="kh-th">Maakond</th>
                  <th className="kh-th">Sihtrühm</th>
                  <th className="kh-th">Osalejaid</th>
                  <th className="kh-th">Maksumus</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((training) => (
                  <tr
                    key={training.id}
                    className="cursor-pointer hover:bg-[var(--color-surface-alt)]"
                    onClick={() => toggle(training.id)}
                  >
                    <td className="kh-td">
                      <input
                        type="checkbox"
                        aria-label={`Vali ${training.code}`}
                        checked={selected.has(training.id)}
                        onChange={() => toggle(training.id)}
                        onClick={(event) => event.stopPropagation()}
                      />
                    </td>
                    <td className="kh-td font-semibold whitespace-nowrap">
                      {training.code}
                      {training.isLeftover && (
                        <span className="ml-1.5 text-[11px] font-normal text-[var(--color-danger)]">
                          jääk
                        </span>
                      )}
                    </td>
                    <td className="kh-td">{training.title}</td>
                    <td className="kh-td text-[13px] whitespace-nowrap">{training.workshopType}</td>
                    <td className="kh-td whitespace-nowrap tabular-nums">{training.eventDate}</td>
                    <td className="kh-td text-[13px] whitespace-nowrap">{training.county}</td>
                    <td className="kh-td text-[13px] whitespace-nowrap">{training.targetGroup}</td>
                    <td className="kh-td tabular-nums">{training.participantCount}</td>
                    <td className="kh-td whitespace-nowrap tabular-nums">{training.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ActionForm>
  );
}
