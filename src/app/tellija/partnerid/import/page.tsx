/**
 * Import the framework partner ranking.
 *
 * The same table shape that carries the fictional demo partners will carry the
 * real tender results, so this is the production path for getting the ranking
 * into the system — not demo scaffolding.
 */

import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { buyerCanWrite } from '@/server/auth/actor';
import { ReadOnlyNote } from '@/components/read-only-note';
import { importBatches, lots } from '@/db/schema';
import { PARTNER_COLUMNS } from '@/domain/import-rows';
import { formatDateTimeShort } from '@/domain/format';
import type { PartnerBatchPayload } from '@/server/import/partners-import';
import { PartnerImportPreview, PartnerImportUploadForm } from './partner-import-forms';

export const dynamic = 'force-dynamic';

export default async function PartnersImportPage({
  searchParams,
}: {
  searchParams: Promise<{ batch?: string }>;
}) {
  const { batch } = await searchParams;
  const db = getDb();

  if (!(await buyerCanWrite())) {
    return (
      <div className="space-y-4">
        <div>
          <Link href="/tellija/partnerid" className="text-[13px] text-[var(--color-brand)]">
            ← Partnerid
          </Link>
          <h1 className="mt-1">Raamlepingu järjestuse import</h1>
        </div>
        <ReadOnlyNote what="Järjestuse import" />
      </div>
    );
  }
  const lotCodes = db.select({ code: lots.code }).from(lots).all().map((l) => l.code);

  const stored = batch
    ? db.select().from(importBatches).where(eq(importBatches.id, batch)).get()
    : undefined;

  if (stored && stored.kind === 'partners') {
    const payload = stored.rowsJson as PartnerBatchPayload;
    const options = (stored.options ?? {}) as { deactivateMissing?: boolean };
    return (
      <div className="space-y-4">
        <div>
          <Link href="/tellija/partnerid" className="text-[13px] text-[var(--color-brand)]">
            ← Partnerid
          </Link>
          <h1 className="mt-1">Järjestuse impordi eelvaade</h1>
          <p className="mt-1 text-[var(--color-muted)]">
            {stored.fileName} · {formatDateTimeShort(stored.createdAt)} ·{' '}
            {stored.status === 'imported' ? 'juba imporditud' : 'ootab kinnitamist'}
          </p>
        </div>
        <PartnerImportPreview
          batchId={stored.id}
          alreadyImported={stored.status !== 'previewed'}
          summary={stored.summary}
          fileErrors={payload.fileErrors}
          rows={payload.rows.map((row) => ({
            rowNumber: row.rowNumber,
            partnerName: row.value?.partnerName ?? '',
            regCode: row.value?.regCode ?? '',
            lotCode: row.value?.lotCode ?? '',
            rank: row.value?.rank ?? null,
            contactEmail: row.value?.contactEmail ?? '',
            errors: row.errors,
            warnings: row.warnings,
            note: row.note,
            action: row.action,
          }))}
          wouldDeactivate={payload.wouldDeactivate ?? []}
          openRoundCount={payload.openRoundCount ?? 0}
          deactivateMissing={Boolean(options.deactivateMissing)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <Link href="/tellija/partnerid" className="text-[13px] text-[var(--color-brand)]">
          ← Partnerid
        </Link>
        <h1 className="mt-1">Impordi partnerite järjestus</h1>
        <p className="mt-1 max-w-[80ch] text-[var(--color-muted)]">
          Lae üles hanke hindamistulemustest koostatud tabel. Import ei puuduta käimasolevaid
          voore: iga voor kasutab avaldamisel külmutatud järjestust.
        </p>
      </div>

      <PartnerImportUploadForm />

      <section className="kh-card p-4">
        <h2>Tabeli veerud</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="kh-th">Veerg</th>
                <th className="kh-th">Väärtus</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['partner', 'ettevõtte nimi, 2–120 tähemärki'],
                ['registrikood', 'täpselt 8 numbrit'],
                ['hankeosa', lotCodes.join(', ')],
                ['koht', 'järjekoht hankeosas, 1 = eesõigus; peab olema hankeosa piires unikaalne'],
                ['kontaktisik', 'nimi, 2–80 tähemärki'],
                ['e_post', 'kontaktisiku e-post, kuhu vooruteated lähevad'],
                ['uhikhind', 'raamlepingu ühikhind, nt 1450 või 1 450,00'],
              ].map(([column, note]) => (
                <tr key={column}>
                  <td className="kh-td font-mono text-[12.5px] whitespace-nowrap">{column}</td>
                  <td className="kh-td text-[13px]">{note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[12.5px] text-[var(--color-muted)]">
          Näidisfail: <code>seed/naidis-partnerid.csv</code>. Kohustuslikud veerud:{' '}
          {PARTNER_COLUMNS.join(', ')}.
        </p>
      </section>
    </div>
  );
}
