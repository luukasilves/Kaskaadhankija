'use client';

import { ActionButton, ActionForm } from '@/components/action-form';
import { RankChip, StatusBadge } from '@/components/status-badge';
import { updateLotConfigAction } from '@/server/actions/lots';
import { deactivateLotPartnerAction } from '@/server/actions/rounds-buyer';

export function LotConfigForm({
  lot,
  openRoundCodes,
}: {
  lot: {
    id: string;
    code: string;
    responseDeadlineWorkingDays: number;
    deadlineLocalTime: string;
    reviewWorkingDays: number;
    workloadThreshold: number;
    thresholdNote: string;
    defaultVisibilityMode: 'dynamic' | 'sealed';
  };
  openRoundCodes: string[];
}) {
  return (
    <ActionForm
      action={updateLotConfigAction}
      submitLabel="Salvesta seaded"
      variant="primary"
      hidden={{ lotId: lot.id }}
      className="kh-card p-4"
    >
      <h2>Kaskaadi seaded</h2>
      {openRoundCodes.length > 0 && (
        <p
          className="mt-2 rounded-md border px-3 py-2 text-[13px]"
          style={{ borderColor: 'var(--color-brand)', background: 'var(--color-brand-soft)' }}
        >
          Käimasolevad voorud ({openRoundCodes.join(', ')}) kasutavad avaldamisel külmutatud
          seadeid — need muudatused neid ei puuduta.
        </p>
      )}

      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block">
          <span className="text-[12.5px] font-semibold">Vastamistähtaeg (tööpäevades)</span>
          <input
            type="number"
            name="responseDeadlineWorkingDays"
            min={1}
            max={20}
            required
            defaultValue={lot.responseDeadlineWorkingDays}
            className="kh-input mt-1"
          />
          <span className="mt-1 block text-[12px] text-[var(--color-muted)]">
            Avaldamise päev ei lähe arvesse. Nädalavahetused ja riigipühad jäetakse vahele.
          </span>
        </label>

        <label className="block">
          <span className="text-[12.5px] font-semibold">Tähtaja kellaaeg (Tallinna aeg)</span>
          <input
            type="time"
            name="deadlineLocalTime"
            required
            defaultValue={lot.deadlineLocalTime}
            className="kh-input mt-1"
          />
        </label>

        <label className="block">
          <span className="text-[12.5px] font-semibold">Ülevaatuse aeg (tööpäevades)</span>
          <input
            type="number"
            name="reviewWorkingDays"
            min={1}
            max={20}
            required
            defaultValue={lot.reviewWorkingDays}
            className="kh-input mt-1"
          />
          <span className="mt-1 block text-[12px] text-[var(--color-muted)]">
            Millal partneritele lubatakse jaotuse kinnitust.
          </span>
        </label>

        <label className="block">
          <span className="text-[12.5px] font-semibold">Töömahu piir (koolitusi)</span>
          <input
            type="number"
            name="workloadThreshold"
            min={1}
            max={999}
            required
            defaultValue={lot.workloadThreshold}
            className="kh-input mt-1"
          />
          <span className="mt-1 block text-[12px] text-[var(--color-muted)]">
            Ainult hoiatustase. Vahelejätmine ja piiramine on tellija õigus, mida ei pea
            rakendama.
            {lot.thresholdNote && ` ${lot.thresholdNote}`}
          </span>
        </label>

        <label className="block sm:col-span-2">
          <span className="text-[12.5px] font-semibold">Vaikimisi nähtavusrežiim</span>
          <select
            name="defaultVisibilityMode"
            defaultValue={lot.defaultVisibilityMode}
            className="kh-input mt-1"
          >
            <option value="dynamic">
              Dünaamiline — partner näeb eesõigusega märgete mõju, ilma nimesid avaldamata
            </option>
            <option value="sealed">Suletud — partner näeb ainult oma märkeid</option>
          </select>
          <span className="mt-1 block text-[12px] text-[var(--color-muted)]">
            Suletud režiim on olemas selleks, et dünaamilise nähtavuse kooskõla raamlepingu
            sõnastusega saaks lahendada ilma koodi muutmata.
          </span>
        </label>
      </div>
    </ActionForm>
  );
}

export function PartnerRows({
  lotId,
  threshold,
  rows,
}: {
  lotId: string;
  threshold: number;
  rows: Array<{
    lotPartnerId: string;
    rank: number;
    isActive: boolean;
    partnerName: string;
    regCode: string;
    contactName: string;
    contactEmail: string;
    unitPriceText: string;
    workload: number;
  }>;
}) {
  return (
    <>
      {rows.map((row) => (
        <tr key={row.lotPartnerId} style={row.isActive ? undefined : { opacity: 0.55 }}>
          <td className="kh-td">
            <RankChip rank={row.rank} muted={!row.isActive} />
          </td>
          <td className="kh-td">
            <div className="font-semibold">{row.partnerName}</div>
            <div className="text-[12px] text-[var(--color-muted)]">Registrikood {row.regCode}</div>
          </td>
          <td className="kh-td text-[13px]">
            {row.contactName}
            <div className="text-[12px] text-[var(--color-muted)]">{row.contactEmail}</div>
          </td>
          <td className="kh-td whitespace-nowrap tabular-nums">{row.unitPriceText}</td>
          <td className="kh-td whitespace-nowrap">
            <span
              className="tabular-nums"
              style={row.workload >= threshold ? { color: 'var(--color-warning)', fontWeight: 650 } : undefined}
            >
              {row.workload}
            </span>
          </td>
          <td className="kh-td whitespace-nowrap">
            {row.isActive ? (
              <StatusBadge label="Aktiivne" tone="success" />
            ) : (
              <StatusBadge label="Osalus lõpetatud" tone="neutral" />
            )}
          </td>
          <td className="kh-td">
            {row.isActive && (
              <ActionButton
                action={deactivateLotPartnerAction}
                label="Lõpeta osalus"
                variant="danger"
                confirm="Lõpetada partneri osalus selles hankeosas? Ta arvatakse välja ka käimasolevatest voorudest."
                hidden={{ lotPartnerId: row.lotPartnerId, lotId }}
                reasonLabel="Põhjendus"
                reasonRequired
              />
            )}
          </td>
        </tr>
      ))}
    </>
  );
}
