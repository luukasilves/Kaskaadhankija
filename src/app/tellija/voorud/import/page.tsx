/**
 * One cascade round from an uploaded workbook [L-20]: preview, then a draft.
 */

import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { buyerCanWrite } from '@/server/auth/actor';
import { ReadOnlyNote } from '@/components/read-only-note';
import { importBatches, lots } from '@/db/schema';
import { formatDateTimeShort, formatIsoDay } from '@/domain/format';
import { CAP_OPTIONS_LABELS, VISIBILITY_MODE_LABELS } from '@/domain/round-statuses';
import type { RoundImportPayload } from '@/server/import/round-import';
import { ROUND_TRAINING_HEADERS } from '@/server/import/round-template';
import { RoundImportPreview, RoundImportUploadForm } from './round-import-forms';

export const dynamic = 'force-dynamic';

export default async function RoundImportPage({
  searchParams,
}: {
  searchParams: Promise<{ batch?: string; hankeosa?: string }>;
}) {
  const { batch, hankeosa } = await searchParams;
  const db = getDb();

  if (!(await buyerCanWrite())) {
    return (
      <div className="space-y-4">
        <div>
          <Link href="/tellija/voorud" className="text-[13px] text-[var(--color-brand)]">
            ← Voorud
          </Link>
          <h1 className="mt-1">Vooru skeemi import</h1>
        </div>
        <ReadOnlyNote what="Vooru skeemi import" />
      </div>
    );
  }
  const lotRows = db.select({ code: lots.code, defaultCapOptions: lots.defaultCapOptions }).from(lots).where(eq(lots.isActive, true)).all();

  const stored = batch ? db.select().from(importBatches).where(eq(importBatches.id, batch)).get() : undefined;

  if (stored && stored.kind === 'round') {
    const payload = stored.rowsJson as RoundImportPayload;
    const definition = payload.round.value;
    const canApply =
      stored.status === 'previewed' &&
      definition !== null &&
      payload.round.errors.length === 0 &&
      payload.rows.length > 0 &&
      payload.rows.every((r) => r.value !== null && r.errors.length === 0);
    const lotDefault = lotRows.find((l) => l.code === definition?.lotCode)?.defaultCapOptions;
    return (
      <div className="space-y-4">
        <div>
          <Link href="/tellija/voorud/uus" className="text-[13px] text-[var(--color-brand)]">
            ← Uus voor
          </Link>
          <h1 className="mt-1">Vooru skeemi eelvaade</h1>
          <p className="mt-1 text-[var(--color-muted)]">
            {stored.fileName} · {formatDateTimeShort(stored.createdAt)} ·{' '}
            {stored.status === 'imported' ? 'mustand on loodud' : stored.status === 'discarded' ? 'kõrvale jäetud' : 'ootab kinnitamist'}
          </p>
        </div>
        <RoundImportPreview
          batchId={stored.id}
          alreadyImported={stored.status !== 'previewed'}
          canApply={canApply}
          summary={stored.summary}
          round={
            definition || payload.round.errors.length > 0
              ? {
                  lotCode: definition?.lotCode ?? '',
                  lotName: payload.round.lotName,
                  visibility: definition ? VISIBILITY_MODE_LABELS[definition.visibilityMode] : '',
                  capOptions: definition
                    ? `${CAP_OPTIONS_LABELS[definition.capOptions ?? lotDefault ?? 'trainings']}${definition.capOptions ? '' : ' (hankeosa vaikimisi)'}`
                    : '',
                  extraWorkingDays: definition?.extraWorkingDays ?? 0,
                  note: definition?.note ?? '',
                  errors: payload.round.errors,
                }
              : null
          }
          fileErrors={payload.fileErrors}
          rows={payload.rows.map((row) => ({
            rowNumber: row.rowNumber,
            code: row.value?.code ?? '',
            title: row.value?.title ?? '',
            lotCode: row.value?.lotCode ?? '',
            eventDate: row.value ? formatIsoDay(row.value.eventDate) : '',
            participants: row.value ? String(row.value.participantCount) : '',
            errors: row.errors,
            warnings: row.warnings,
            note: row.note,
            action: row.action,
          }))}
        />
      </div>
    );
  }

  const selectedLot = lotRows.find((l) => l.code === hankeosa)?.code ?? lotRows[0]?.code ?? '';

  return (
    <div className="space-y-4">
      <div>
        <Link href="/tellija/voorud/uus" className="text-[13px] text-[var(--color-brand)]">
          ← Uus voor
        </Link>
        <h1 className="mt-1">Laadi vooru skeem üles</h1>
        <p className="mt-1 max-w-[80ch] text-[var(--color-muted)]">
          Üks töövihik kirjeldab ühe kaskaadivooru: leht „Voor“ annab hankeosa ja seaded, leht
          „Koolitused“ loetleb koolitused samade veergudega nagu koolituskalendri import. Tulemus on
          <strong> mustand</strong> — avaldamine, tähtaeg ja järjestuse külmutamine toimuvad
          rakenduses.
        </p>
      </div>

      <RoundImportUploadForm />

      <section className="kh-card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2>Mall</h2>
          <div className="flex flex-wrap gap-2">
            {lotRows.map((lot) => (
              <a
                key={lot.code}
                href={`/tellija/voorud/mall?hankeosa=${lot.code}`}
                className={`kh-btn text-xs${lot.code === selectedLot ? ' kh-btn-primary' : ''}`}
              >
                Mall: {lot.code}
              </a>
            ))}
          </div>
        </div>
        <p className="mt-2 text-[13px] text-[var(--color-muted)]">
          Mall on eeltäidetud hankeosa jaotamata koolitustega — kustuta read, mida vooru ei lähe, ja
          lisa uued. Lehe „Koolitused“ veerud: <code>{ROUND_TRAINING_HEADERS.join(', ')}</code>. Lehe
          „Voor“ väljad: hankeosa, nahtavus (dünaamiline / suletud), piirmaara_valikud (puudub /
          koolitused / osalejad / mõlemad), lisatoopaevad (0–20), markus.
        </p>
      </section>
    </div>
  );
}
