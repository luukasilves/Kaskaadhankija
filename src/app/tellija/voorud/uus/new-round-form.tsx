'use client';

import { HIND } from '@/domain/pricing';

import { useMemo, useState } from 'react';
import { ActionForm } from '@/components/action-form';
import { describeGroups, type DateKind } from '@/domain/clusters';
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
  /** [L-28] a cluster's group: chosen as a whole cluster, never singly */
  dateKind: DateKind;
  clusterCode: string | null;
  groupIndex: number | null;
}

/** A row of the picker: a dated training, or a whole cluster of groups. */
type PickerItem =
  | { kind: 'training'; training: TrainingOption }
  | { kind: 'cluster'; clusterCode: string; head: TrainingOption; groups: TrainingOption[] };

function itemsOf(trainings: readonly TrainingOption[]): PickerItem[] {
  const items: PickerItem[] = [];
  const seen = new Set<string>();
  for (const training of trainings) {
    if (training.dateKind === 'period' && training.clusterCode) {
      if (seen.has(training.clusterCode)) continue;
      seen.add(training.clusterCode);
      const groups = trainings
        .filter((t) => t.clusterCode === training.clusterCode)
        .sort((a, b) => (a.groupIndex ?? 0) - (b.groupIndex ?? 0));
      items.push({ kind: 'cluster', clusterCode: training.clusterCode, head: groups[0]!, groups });
    } else {
      items.push({ kind: 'training', training });
    }
  }
  return items;
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

  const items = useMemo(() => itemsOf(trainings), [trainings]);
  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => {
      const t = item.kind === 'training' ? item.training : item.head;
      return [t.code, t.title, t.county, t.targetGroup, item.kind === 'cluster' ? item.clusterCode : ''].some((field) =>
        field.toLowerCase().includes(needle),
      );
    });
  }, [filter, items]);

  const idsOf = (item: PickerItem) => (item.kind === 'training' ? [item.training.id] : item.groups.map((g) => g.id));
  const isChosen = (item: PickerItem) => idsOf(item).every((id) => selected.has(id));

  const toggleItem = (item: PickerItem) =>
    setSelected((current) => {
      const next = new Set(current);
      const chosen = isChosen(item);
      for (const id of idsOf(item)) {
        if (chosen) next.delete(id);
        else next.add(id);
      }
      return next;
    });

  const allVisibleSelected = visible.length > 0 && visible.every((item) => isChosen(item));

  // [V-09] a round is of one kind; say so here rather than after the submit.
  const chosenKinds = new Set(trainings.filter((t) => selected.has(t.id)).map((t) => t.dateKind));
  const mixed = chosenKinds.size > 1;
  const isClusterChoice = chosenKinds.size === 1 && chosenKinds.has('period');

  return (
    <ActionForm
      action={createRoundAction}
      submitLabel={`Loo mustand (${selected.size} ${isClusterChoice ? 'rühma' : 'koolitust'})`}
      variant="primary"
      disabled={selected.size === 0 || lot.activePartnerCount === 0 || mixed}
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
            {items.some((item) => item.kind === 'cluster') && ' — klaster valitakse tervikuna'}
          </span>
          {mixed && (
            <span className="text-[12.5px] font-semibold" style={{ color: 'var(--color-danger)' }} data-testid="mixed-kind-warning">
              Voor on ühte liiki: vali kas kindla kuupäevaga koolitused või klastrid, mitte mõlemad [V-09].
            </span>
          )}
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
                          for (const item of visible) {
                            for (const id of idsOf(item)) {
                              if (allVisibleSelected) next.delete(id);
                              else next.add(id);
                            }
                          }
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
                  <th className="kh-th">{HIND.maxOsalejaid}</th>
                  <th className="kh-th">{HIND.tellijaHinnang}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => {
                  const training = item.kind === 'training' ? item.training : item.head;
                  const code = item.kind === 'cluster' ? item.clusterCode : training.code;
                  const chosen = isChosen(item);
                  return (
                    <tr
                      key={code}
                      className="cursor-pointer hover:bg-[var(--color-surface-alt)]"
                      onClick={() => toggleItem(item)}
                      data-testid={item.kind === 'cluster' ? 'cluster-option' : undefined}
                    >
                      <td className="kh-td">
                        <input
                          type="checkbox"
                          aria-label={`Vali ${code}`}
                          checked={chosen}
                          onChange={() => toggleItem(item)}
                          onClick={(event) => event.stopPropagation()}
                        />
                      </td>
                      <td className="kh-td font-semibold whitespace-nowrap">
                        {code}
                        {item.kind === 'cluster' && (
                          <span className="ml-1.5 text-[11px] font-normal text-[var(--color-muted)]">klaster</span>
                        )}
                        {training.isLeftover && (
                          <span className="ml-1.5 text-[11px] font-normal text-[var(--color-danger)]">
                            jääk
                          </span>
                        )}
                      </td>
                      <td className="kh-td">
                        {training.title}
                        {item.kind === 'cluster' && (
                          <div className="text-[12px] text-[var(--color-muted)]">
                            {describeGroups(
                              item.groups.map((g) => ({ groupIndex: g.groupIndex ?? 0, participantCount: g.participantCount })),
                              [],
                            )}
                          </div>
                        )}
                      </td>
                      <td className="kh-td text-[13px] whitespace-nowrap">{training.workshopType}</td>
                      <td className="kh-td whitespace-nowrap tabular-nums">{training.eventDate}</td>
                      <td className="kh-td text-[13px] whitespace-nowrap">{training.county}</td>
                      <td className="kh-td text-[13px] whitespace-nowrap">{training.targetGroup}</td>
                      <td className="kh-td tabular-nums">
                        {item.kind === 'cluster'
                          ? item.groups.reduce((sum, g) => sum + g.participantCount, 0)
                          : training.participantCount}
                      </td>
                      <td className="kh-td whitespace-nowrap tabular-nums">{training.value}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ActionForm>
  );
}
