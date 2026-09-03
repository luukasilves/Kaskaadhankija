'use client';

/**
 * The jääk decision [T-06].
 *
 * A leftover training can go into a new round for **all** partners of its lot,
 * or be cancelled with a justification. Re-issuing is grouped by lot because a
 * round belongs to exactly one lot [V-01], and the same training row is reused
 * so its history survives [E-09].
 */

import { useState } from 'react';
import { ActionButton, ActionForm } from '@/components/action-form';
import { cancelLeftoverAction, reissueLeftoverAction } from '@/server/actions/rounds-buyer';

export interface LeftoverRow {
  id: string;
  code: string;
  title: string;
  eventDate: string;
  county: string;
  value: string;
  lotId: string;
  lotCode: string;
}

export function LeftoverActions({ leftovers }: { leftovers: LeftoverRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const byLot = new Map<string, LeftoverRow[]>();
  for (const row of leftovers) {
    byLot.set(row.lotCode, [...(byLot.get(row.lotCode) ?? []), row]);
  }

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-4">
      {[...byLot.entries()].map(([lotCode, rows]) => {
        const lotId = rows[0].lotId;
        const chosen = rows.filter((r) => selected.has(r.id));
        return (
          <div key={lotCode} className="kh-card">
            <div className="border-b border-[var(--color-border)] px-4 py-2.5 font-semibold">
              {lotCode}
              <span className="ml-2 font-normal text-[var(--color-muted)]">
                {rows.length} koolitust jäägis
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="kh-th w-8" />
                    <th className="kh-th">Kood</th>
                    <th className="kh-th">Koolitus</th>
                    <th className="kh-th">Toimumine</th>
                    <th className="kh-th">Maakond</th>
                    <th className="kh-th">Maksumus</th>
                    <th className="kh-th">Tühista</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td className="kh-td">
                        <input
                          type="checkbox"
                          aria-label={`Vali ${row.code}`}
                          checked={selected.has(row.id)}
                          onChange={() => toggle(row.id)}
                        />
                      </td>
                      <td className="kh-td font-semibold whitespace-nowrap">{row.code}</td>
                      <td className="kh-td">{row.title}</td>
                      <td className="kh-td whitespace-nowrap tabular-nums">{row.eventDate}</td>
                      <td className="kh-td whitespace-nowrap">{row.county}</td>
                      <td className="kh-td whitespace-nowrap tabular-nums">{row.value}</td>
                      <td className="kh-td">
                        <ActionButton
                          action={cancelLeftoverAction}
                          label="Tühista koolitus"
                          variant="danger"
                          hidden={{ trainingId: row.id }}
                          reasonLabel="Tühistamise põhjendus"
                          reasonRequired
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-[var(--color-border)] p-3">
              <ActionForm
                action={reissueLeftoverAction}
                submitLabel={`Loo uus voor (${chosen.length} koolitust)`}
                variant="primary"
                disabled={chosen.length === 0}
                hidden={{ lotId }}
              >
                {chosen.map((row) => (
                  <input key={row.id} type="hidden" name="trainingIds" value={row.id} />
                ))}
                <p className="mb-2 text-[12.5px] text-[var(--color-muted)]">
                  Uus voor läheb kõigile hankeosa {lotCode} aktiivsetele partneritele. Koolituste
                  andmeid saab enne avaldamist mustandis muuta.
                </p>
              </ActionForm>
            </div>
          </div>
        );
      })}
    </div>
  );
}
