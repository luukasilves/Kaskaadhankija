'use client';

import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { StatusBadge } from '@/components/status-badge';
import type { ImportSummary } from '@/db/schema';
import {
  confirmRoundImportAction,
  discardRoundImportAction,
  previewRoundAction,
} from '@/server/actions/imports';

export function RoundImportUploadForm() {
  return (
    <ActionForm
      action={previewRoundAction}
      submitLabel="Loe töövihik ja näita eelvaadet"
      variant="primary"
      className="kh-card space-y-3 p-4"
      testId="round-import-upload"
    >
      <label className="block">
        <span className="text-[12.5px] font-semibold">Vooru skeem (.xlsx, kuni 5 MB)</span>
        <input
          type="file"
          name="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          required
          className="kh-input mt-1"
        />
      </label>
      <p className="text-[12px] text-[var(--color-muted)]">
        Töövihikus on leht „Voor“ (vooru parameetrid) ja leht „Koolitused“ (koolituskalendri
        veerud). Eelvaade näitab, mis luuakse; midagi ei salvestata enne kinnitamist, ja vooru ei
        looda enne, kui iga rida on korras.
      </p>
    </ActionForm>
  );
}

export interface RoundPreviewTrainingRow {
  rowNumber: number;
  code: string;
  title: string;
  lotCode: string;
  eventDate: string;
  participants: string;
  errors: Array<{ field?: string; message: string }>;
  warnings: Array<{ field?: string; message: string }>;
  note?: string;
  action?: 'created' | 'updated' | 'locked' | 'error';
}

export function RoundImportPreview({
  batchId,
  alreadyImported,
  canApply,
  summary,
  round,
  fileErrors,
  rows,
}: {
  batchId: string;
  alreadyImported: boolean;
  canApply: boolean;
  summary: ImportSummary;
  round: {
    lotCode: string;
    lotName: string;
    visibility: string;
    capOptions: string;
    extraWorkingDays: number;
    note: string;
    errors: Array<{ field?: string; message: string }>;
  } | null;
  fileErrors: Array<{ field?: string; message: string }>;
  rows: RoundPreviewTrainingRow[];
}) {
  return (
    <div className="space-y-4">
      <section className="kh-card p-4" data-testid="round-import-summary">
        <h2>Voor</h2>
        {round ? (
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
            <dt className="text-[var(--color-muted)]">Hankeosa</dt>
            <dd className="font-semibold">
              {round.lotCode}
              {round.lotName ? ` — ${round.lotName}` : ''}
            </dd>
            <dt className="text-[var(--color-muted)]">Nähtavus</dt>
            <dd>{round.visibility}</dd>
            <dt className="text-[var(--color-muted)]">Piirmäära liigid</dt>
            <dd>{round.capOptions}</dd>
            <dt className="text-[var(--color-muted)]">Lisatööpäevad</dt>
            <dd>{round.extraWorkingDays > 0 ? `+${round.extraWorkingDays} tööpäeva vaikimisi tähtajale (pakutakse avaldamisel ette)` : 'hankeosa vaikimisi tähtaeg'}</dd>
            {round.note && (
              <>
                <dt className="text-[var(--color-muted)]">Märkus</dt>
                <dd>{round.note}</dd>
              </>
            )}
          </dl>
        ) : (
          <p className="mt-2 text-[13px] text-[var(--color-danger)]">Lehe „Voor“ andmeid ei õnnestunud lugeda.</p>
        )}
        {round && round.errors.length > 0 && (
          <ul
            className="mt-3 space-y-1 rounded-md border p-3 text-[13px]"
            style={{ borderColor: 'var(--color-danger)', background: 'var(--color-danger-soft)', color: 'var(--color-danger)' }}
          >
            {round.errors.map((error, index) => (
              <li key={index}>
                {error.field ? `${error.field}: ` : ''}
                {error.message}
              </li>
            ))}
          </ul>
        )}

        <h2 className="mt-5">Koolitused</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          {(
            [
              ['Ridu kokku', summary.total, undefined],
              ['Uut koolitust', summary.created, 'var(--color-success)'],
              ['Uuendatakse', summary.updated, 'var(--color-brand)'],
              ['Veaga', summary.withErrors, 'var(--color-danger)'],
            ] as const
          ).map(([label, value, color]) => (
            <div key={label}>
              <div className="text-[22px] font-bold tabular-nums" style={color ? { color } : undefined}>
                {value}
              </div>
              <div className="text-[12px] text-[var(--color-muted)]">{label}</div>
            </div>
          ))}
        </div>

        {fileErrors.length > 0 && (
          <ul
            className="mt-3 space-y-1 rounded-md border p-3 text-[13px]"
            style={{ borderColor: 'var(--color-warning)', background: 'var(--color-warning-soft)', color: 'var(--color-warning)' }}
          >
            {fileErrors.map((error, index) => (
              <li key={index}>{error.message}</li>
            ))}
          </ul>
        )}

        {alreadyImported ? (
          <p className="mt-4">
            <Link href="/tellija/voorud" className="kh-btn kh-btn-primary">
              Ava voorud
            </Link>
          </p>
        ) : (
          <div className="mt-4 flex flex-wrap items-start gap-3">
            <ActionForm
              action={confirmRoundImportAction}
              submitLabel={canApply ? `Loo mustand (${summary.valid} koolitust)` : 'Paranda vead ja laadi uuesti'}
              variant="primary"
              disabled={!canApply}
              hidden={{ batchId }}
              testId="confirm-round-import"
            />
            <ActionForm action={discardRoundImportAction} submitLabel="Jäta kõrvale" hidden={{ batchId }} />
            {!canApply && (
              <p className="text-[13px] text-[var(--color-muted)]" data-testid="round-import-blocked">
                Voor luuakse ainult tervikuna: iga rida peab olema korras ja samas hankeosas, ja
                ükski koolitus ei tohi juba voorus olla.
              </p>
            )}
          </div>
        )}
      </section>

      <section className="kh-card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="kh-th">Rida</th>
              <th className="kh-th">Kood</th>
              <th className="kh-th">Koolitus</th>
              <th className="kh-th">Osa</th>
              <th className="kh-th">Toimumine</th>
              <th className="kh-th">Osalejaid</th>
              <th className="kh-th">Tulemus</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.rowNumber} style={row.errors.length > 0 ? { background: 'var(--color-danger-soft)' } : undefined}>
                <td className="kh-td tabular-nums">{row.rowNumber}</td>
                <td className="kh-td whitespace-nowrap font-semibold">{row.code || '—'}</td>
                <td className="kh-td">{row.title || '—'}</td>
                <td className="kh-td whitespace-nowrap">{row.lotCode || '—'}</td>
                <td className="kh-td whitespace-nowrap tabular-nums">{row.eventDate || '—'}</td>
                <td className="kh-td tabular-nums">{row.participants || '—'}</td>
                <td className="kh-td text-[13px]">
                  {row.errors.length > 0 ? (
                    <>
                      <StatusBadge label="Viga" tone="danger" />
                      <ul className="mt-1 space-y-0.5">
                        {row.errors.map((error, index) => (
                          <li key={index}>{error.message}</li>
                        ))}
                      </ul>
                    </>
                  ) : row.action === 'created' ? (
                    <StatusBadge label="Loodud" tone="success" />
                  ) : row.action === 'updated' ? (
                    <StatusBadge label="Uuendatud" tone="info" />
                  ) : (
                    <StatusBadge label="Läheb vooru" tone="info" />
                  )}
                  {row.warnings.map((warning, index) => (
                    <div key={index} className="mt-0.5 text-[12px] text-[var(--color-warning)]">
                      {warning.message}
                    </div>
                  ))}
                  {row.note && <div className="mt-0.5 text-[12px] text-[var(--color-muted)]">{row.note}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
