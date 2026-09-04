/**
 * Import the koolituskalender.
 *
 * Two steps on purpose. Uploading only *parses* the file and shows what would
 * happen, row by row — including the rows that would be refused and why. The
 * buyer then confirms. Nothing about the procurement changes until they do.
 */

import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { importBatches, lots } from '@/db/schema';
import { TRAINING_COLUMNS, TRAINING_OPTIONAL_COLUMNS } from '@/domain/import-rows';
import { formatDateTimeShort } from '@/domain/format';
import { TARGET_GROUPS } from '@/domain/round-statuses';
import { WORKSHOP_TYPE_LABELS } from '@/domain/statuses';
import type { StoredRow } from '@/server/import/trainings-import';
import { ImportUploadForm, ImportPreview } from './import-forms';

export const dynamic = 'force-dynamic';

export default async function TrainingsImportPage({
  searchParams,
}: {
  searchParams: Promise<{ batch?: string }>;
}) {
  const { batch } = await searchParams;
  const db = getDb();
  const lotCodes = db.select({ code: lots.code }).from(lots).all().map((l) => l.code);

  const stored = batch
    ? db.select().from(importBatches).where(eq(importBatches.id, batch)).get()
    : undefined;

  if (stored && stored.kind === 'trainings') {
    const payload = stored.rowsJson as { rows: StoredRow[]; fileErrors: Array<{ field?: string; message: string }> };
    return (
      <div className="space-y-4">
        <div>
          <Link href="/tellija/koolitused" className="text-[13px] text-[var(--color-brand)]">
            ← Koolituskalender
          </Link>
          <h1 className="mt-1">Impordi eelvaade</h1>
          <p className="mt-1 text-[var(--color-muted)]">
            {stored.fileName} · {formatDateTimeShort(stored.createdAt)} ·{' '}
            {stored.status === 'imported' ? 'juba imporditud' : 'ootab kinnitamist'}
          </p>
        </div>
        <ImportPreview
          batchId={stored.id}
          alreadyImported={stored.status !== 'previewed'}
          summary={stored.summary}
          fileErrors={payload.fileErrors}
          rows={payload.rows.map((row) => ({
            rowNumber: row.rowNumber,
            code: row.value?.code ?? '',
            title: row.value?.title ?? '',
            lotCode: row.value?.lotCode ?? '',
            eventDate: row.value?.eventDate ?? '',
            county: row.value?.county ?? '',
            errors: row.errors,
            warnings: row.warnings,
            note: row.note,
            action: row.action,
          }))}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <Link href="/tellija/koolitused" className="text-[13px] text-[var(--color-brand)]">
          ← Koolituskalender
        </Link>
        <h1 className="mt-1">Impordi koolituskalender</h1>
        <p className="mt-1 max-w-[80ch] text-[var(--color-muted)]">
          Lae üles CSV- või XLSX-tabel. Fail loetakse ja kontrollitakse kohe, kuid midagi ei
          salvestata enne, kui oled eelvaate kinnitanud.
        </p>
      </div>

      <ImportUploadForm />

      <section className="kh-card p-4">
        <h2>Tabeli veerud</h2>
        <p className="mt-1 text-[13px] text-[var(--color-muted)]">
          Veerunimed loetakse täpitähtedest ja suur-väiketähtedest sõltumata, seega „Kuupäev“ ja
          „kuupaev“ on samaväärsed.
        </p>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="kh-th">Veerg</th>
                <th className="kh-th">Kohustuslik</th>
                <th className="kh-th">Väärtus</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['kood', true, 'kujul KK-2026-101; sama koodiga rida uuendab olemasolevat koolitust'],
                ['hankeosa', true, lotCodes.join(', ')],
                ['nimetus', true, '3–160 tähemärki'],
                ['formaat', true, Object.values(WORKSHOP_TYPE_LABELS).join(', ')],
                ['kuupaev', true, '07.10.2026 või 2026-10-07'],
                ['lopp_kuupaev', false, 'mitmepäevase sündmuse lõpp'],
                ['maakond', true, 'nt Harju maakond, Harjumaa, Harju, või Veebipõhine'],
                ['asukoht', false, 'täpsem asukoht või platvorm'],
                ['sihtruhm', true, Object.values(TARGET_GROUPS).join(', ')],
                ['osalejate_arv', true, '1–2000'],
                ['keel', true, 'et, ru, en'],
                ['hinnanguline_maksumus', true, 'nt 1450 või 1 450,00'],
                ['markused', false, 'kuni 600 tähemärki'],
              ].map(([column, required, note]) => (
                <tr key={String(column)}>
                  <td className="kh-td font-mono text-[12.5px] whitespace-nowrap">{String(column)}</td>
                  <td className="kh-td text-[13px] whitespace-nowrap">
                    {required ? 'jah' : 'ei'}
                  </td>
                  <td className="kh-td text-[13px]">{String(note)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-[12.5px] text-[var(--color-muted)]">
          Näidisfailid on hoidlas: <code>seed/naidis-koolituskalender.csv</code> ja sama sisuga{' '}
          <code>.xlsx</code>. Kohustuslikud veerud: {TRAINING_COLUMNS.join(', ')}. Vabatahtlikud:{' '}
          {TRAINING_OPTIONAL_COLUMNS.join(', ')}.
        </p>
      </section>

      <section className="kh-card p-4">
        <h2>Mida import teeb</h2>
        <ul className="mt-2 space-y-1 text-[13px]">
          <li>
            <strong>Uus kood</strong> — luuakse uus koolitus olekus „jaotamata“.
          </li>
          <li>
            <strong>Olemasolev kood, koolitus jaotamata või jäägis</strong> — andmed uuendatakse
            samal real, seega koolituse ajalugu ja seosed jäävad alles.
          </li>
          <li>
            <strong>Olemasolev kood, koolitus voorus või määratud</strong> — rida jäetakse vahele.
            Avaldatud vooru sisu on külmutatud, sest partneritele on need tingimused juba esitatud.
          </li>
          <li>
            <strong>Vigane rida</strong> — jäetakse vahele, ülejäänud imporditakse.
          </li>
        </ul>
      </section>
    </div>
  );
}
