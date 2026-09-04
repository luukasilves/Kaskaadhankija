'use client';

import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { StatusBadge } from '@/components/status-badge';
import {
  confirmTrainingsImportAction,
  discardImportAction,
  previewTrainingsAction,
} from '@/server/actions/imports';
import type { ImportSummary } from '@/db/schema';

export function ImportUploadForm() {
  return (
    <ActionForm
      action={previewTrainingsAction}
      submitLabel="Loe fail ja näita eelvaadet"
      variant="primary"
      className="kh-card space-y-3 p-4"
      testId="training-import-upload"
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
      <p className="text-[12px] text-[var(--color-muted)]">
        Eelvaade näitab iga rea kohta, kas see luuakse, uuendatakse, jäetakse vahele või on vigane.
        Andmebaasi ei kirjutata enne kinnitamist.
      </p>
    </ActionForm>
  );
}

export interface PreviewRow {
  rowNumber: number;
  code: string;
  title: string;
  lotCode: string;
  eventDate: string;
  county: string;
  errors: Array<{ field?: string; message: string }>;
  warnings: Array<{ field?: string; message: string }>;
  note?: string;
  action?: 'created' | 'updated' | 'locked' | 'error';
}

const ACTION_LABELS: Record<string, { label: string; tone: 'success' | 'info' | 'neutral' | 'danger' }> = {
  created: { label: 'Loodud', tone: 'success' },
  updated: { label: 'Uuendatud', tone: 'info' },
  locked: { label: 'Vahele jäetud', tone: 'neutral' },
  error: { label: 'Viga', tone: 'danger' },
};

export function ImportPreview({
  batchId,
  alreadyImported,
  summary,
  fileErrors,
  rows,
}: {
  batchId: string;
  alreadyImported: boolean;
  summary: ImportSummary;
  fileErrors: Array<{ field?: string; message: string }>;
  rows: PreviewRow[];
}) {
  const bad = rows.filter((row) => row.errors.length > 0);
  const warned = rows.filter((row) => row.errors.length === 0 && row.warnings.length > 0);

  return (
    <div className="space-y-4">
      <section className="kh-card p-4">
        <h2>Kokkuvõte</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-5">
          {(
            [
              ['Ridu kokku', summary.total, undefined],
              ['Uut', summary.created, 'var(--color-success)'],
              ['Uuendatakse', summary.updated, 'var(--color-brand)'],
              ['Lukus', summary.locked, 'var(--color-muted)'],
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

        {!alreadyImported && (
          <div className="mt-4 flex flex-wrap gap-2">
            <ActionForm
              action={confirmTrainingsImportAction}
              submitLabel={`Impordi ${summary.valid} rida`}
              variant="primary"
              disabled={summary.valid === 0}
              hidden={{ batchId }}
              testId="confirm-import"
            />
            <ActionForm
              action={discardImportAction}
              submitLabel="Jäta kõrvale"
              hidden={{ batchId }}
            />
          </div>
        )}
        {alreadyImported && (
          <p className="mt-3">
            <Link href="/tellija/koolitused" className="kh-btn kh-btn-primary">
              Ava koolituskalender
            </Link>
          </p>
        )}
      </section>

      {bad.length > 0 && (
        <section className="kh-card">
          <div
            className="border-b px-4 py-3"
            style={{ borderColor: 'var(--color-danger)', background: 'var(--color-danger-soft)' }}
          >
            <h2 style={{ color: 'var(--color-danger)' }}>Vigased read ({bad.length})</h2>
            <p className="mt-0.5 text-[12.5px]" style={{ color: 'var(--color-danger)' }}>
              Need read jäetakse importimisel vahele. Paranda fail ja lae uuesti, või impordi
              ülejäänud read.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="kh-th">Rida</th>
                  <th className="kh-th">Kood</th>
                  <th className="kh-th">Vead</th>
                </tr>
              </thead>
              <tbody>
                {bad.map((row) => (
                  <tr key={row.rowNumber}>
                    <td className="kh-td tabular-nums">{row.rowNumber}</td>
                    <td className="kh-td font-semibold whitespace-nowrap">{row.code || '—'}</td>
                    <td className="kh-td text-[13px]">
                      <ul className="space-y-0.5">
                        {row.errors.map((error, index) => (
                          <li key={index}>
                            {error.field && (
                              <span className="font-mono text-[12px] text-[var(--color-muted)]">
                                {error.field}:{' '}
                              </span>
                            )}
                            {error.message}
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="kh-card">
        <div className="border-b border-[var(--color-border)] px-4 py-3">
          <h2>Kõik read ({rows.length})</h2>
          {warned.length > 0 && (
            <p className="mt-0.5 text-[12.5px]" style={{ color: 'var(--color-warning)' }}>
              {warned.length} real on hoiatus — need imporditakse, kuid tasub üle vaadata.
            </p>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="kh-th">Rida</th>
                <th className="kh-th">Kood</th>
                <th className="kh-th">Koolitus</th>
                <th className="kh-th">Osa</th>
                <th className="kh-th">Kuupäev</th>
                <th className="kh-th">Maakond</th>
                <th className="kh-th">Tulemus</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const action = row.action ? ACTION_LABELS[row.action] : null;
                return (
                  <tr
                    key={row.rowNumber}
                    style={row.errors.length > 0 ? { background: 'var(--color-danger-soft)' } : undefined}
                  >
                    <td className="kh-td tabular-nums">{row.rowNumber}</td>
                    <td className="kh-td font-semibold whitespace-nowrap">{row.code || '—'}</td>
                    <td className="kh-td">{row.title || '—'}</td>
                    <td className="kh-td whitespace-nowrap">{row.lotCode || '—'}</td>
                    <td className="kh-td whitespace-nowrap tabular-nums">{row.eventDate || '—'}</td>
                    <td className="kh-td text-[13px] whitespace-nowrap">{row.county || '—'}</td>
                    <td className="kh-td text-[13px]">
                      {action ? (
                        <StatusBadge label={action.label} tone={action.tone} />
                      ) : row.errors.length > 0 ? (
                        <StatusBadge label="Viga" tone="danger" />
                      ) : (
                        <StatusBadge label="Imporditakse" tone="info" />
                      )}
                      {row.note && (
                        <div className="mt-0.5 text-[12px] text-[var(--color-muted)]">{row.note}</div>
                      )}
                      {row.warnings.map((warning, index) => (
                        <div
                          key={index}
                          className="mt-0.5 text-[12px]"
                          style={{ color: 'var(--color-warning)' }}
                        >
                          {warning.message}
                        </div>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
