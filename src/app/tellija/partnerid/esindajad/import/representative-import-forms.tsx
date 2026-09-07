'use client';

import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { StatusBadge } from '@/components/status-badge';
import {
  confirmRepresentativesImportAction,
  previewRepresentativesAction,
} from '@/server/actions/imports';
import type { ImportSummary } from '@/db/schema';

export function RepresentativeImportUploadForm() {
  return (
    <ActionForm
      action={previewRepresentativesAction}
      submitLabel="Loe fail ja näita eelvaadet"
      variant="primary"
      className="kh-card space-y-3 p-4"
      testId="representative-import-upload"
    >
      <label className="block">
        <span className="text-[12.5px] font-semibold">Tabel (.csv või .xlsx, kuni 5 MB)</span>
        <input
          type="file"
          name="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          required
          className="kh-input mt-1"
        />
      </label>
      <label className="flex items-start gap-2">
        <input type="checkbox" name="deactivateMissing" className="mt-1" />
        <span className="text-[13px]">
          Lõpeta failis nimetatud partnerite nende esindajate õigus, keda failis ei ole
          <span className="mt-0.5 block text-[12px] text-[var(--color-muted)]">
            Vaikimisi väljas. Puudutab ainult partnereid, kes failis esinevad; eelvaade näitab
            täpselt, keda see tabaks.
          </span>
        </span>
      </label>
    </ActionForm>
  );
}

export interface RepresentativePreviewRow {
  rowNumber: number;
  partnerName: string;
  regCode: string;
  name: string;
  email: string;
  role: string;
  errors: Array<{ field?: string; message: string }>;
  warnings: Array<{ field?: string; message: string }>;
  note?: string;
  action?: 'created' | 'updated' | 'error';
}

export function RepresentativeImportPreview({
  batchId,
  alreadyImported,
  summary,
  fileErrors,
  wouldDeactivate,
  rows,
}: {
  batchId: string;
  alreadyImported: boolean;
  summary: ImportSummary;
  fileErrors: Array<{ field?: string; message: string }>;
  wouldDeactivate: Array<{ partnerName: string; name: string; email: string }>;
  rows: RepresentativePreviewRow[];
}) {
  return (
    <div className="space-y-4">
      <section className="kh-card p-4">
        <h2>Kokkuvõte</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          {(
            [
              ['Ridu kokku', summary.total, undefined],
              ['Uut esindajat', summary.created, 'var(--color-success)'],
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
            style={{
              borderColor: 'var(--color-warning)',
              background: 'var(--color-warning-soft)',
              color: 'var(--color-warning)',
            }}
          >
            {fileErrors.map((error, index) => (
              <li key={index}>{error.message}</li>
            ))}
          </ul>
        )}

        {wouldDeactivate.length > 0 && (
          <div
            className="mt-3 rounded-md border p-3 text-[13px]"
            style={{ borderColor: 'var(--color-warning)', background: 'var(--color-warning-soft)' }}
          >
            <strong>Esindus lõpetatakse:</strong>
            <ul className="mt-1 space-y-0.5">
              {wouldDeactivate.map((r) => (
                <li key={`${r.partnerName}-${r.email}`}>
                  {r.partnerName}: {r.name} ({r.email})
                </li>
              ))}
            </ul>
          </div>
        )}

        {!alreadyImported ? (
          <div className="mt-4">
            <ActionForm
              action={confirmRepresentativesImportAction}
              submitLabel={`Impordi ${summary.valid} rida`}
              variant="primary"
              disabled={summary.valid === 0}
              hidden={{ batchId }}
              testId="confirm-representative-import"
            />
          </div>
        ) : (
          <p className="mt-3">
            <Link href="/tellija/partnerid/esindajad" className="kh-btn kh-btn-primary">
              Ava esindajad
            </Link>
          </p>
        )}
      </section>

      <section className="kh-card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="kh-th">Rida</th>
              <th className="kh-th">Partner</th>
              <th className="kh-th">Registrikood</th>
              <th className="kh-th">Esindaja</th>
              <th className="kh-th">E-post</th>
              <th className="kh-th">Roll</th>
              <th className="kh-th">Tulemus</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.rowNumber}
                style={row.errors.length > 0 ? { background: 'var(--color-danger-soft)' } : undefined}
              >
                <td className="kh-td tabular-nums">{row.rowNumber}</td>
                <td className="kh-td">{row.partnerName || '—'}</td>
                <td className="kh-td whitespace-nowrap tabular-nums">{row.regCode || '—'}</td>
                <td className="kh-td">{row.name || '—'}</td>
                <td className="kh-td text-[13px]">{row.email || '—'}</td>
                <td className="kh-td text-[13px]">{row.role || '—'}</td>
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
                  ) : row.action === 'error' ? (
                    <StatusBadge label="Viga" tone="danger" />
                  ) : (
                    <StatusBadge label="Imporditakse" tone="info" />
                  )}
                  {row.note && (
                    <div className="mt-0.5 text-[12px] text-[var(--color-muted)]">{row.note}</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
