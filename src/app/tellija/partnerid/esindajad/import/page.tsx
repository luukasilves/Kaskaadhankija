/**
 * Import the partners' contractual representatives.
 *
 * The sheet the team fills in decides who receives a company's formal notices
 * and who may sign in for it, so this is the production path for access, not
 * demo scaffolding. Same preview-then-confirm shape as the other imports.
 */

import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { buyerCanWrite } from '@/server/auth/actor';
import { ReadOnlyNote } from '@/components/read-only-note';
import { importBatches, partnerRepresentatives, partners } from '@/db/schema';
import { REPRESENTATIVE_COLUMNS, REPRESENTATIVE_OPTIONAL_COLUMNS } from '@/domain/import-rows';
import { formatDateTimeShort } from '@/domain/format';
import type { StoredRepresentativeRow } from '@/server/import/representatives-import';
import {
  RepresentativeImportPreview,
  RepresentativeImportUploadForm,
} from './representative-import-forms';

export const dynamic = 'force-dynamic';

export default async function RepresentativesImportPage({
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
          <Link href="/tellija/partnerid/esindajad" className="text-[13px] text-[var(--color-brand)]">
            ← Esindajad
          </Link>
          <h1 className="mt-1">Esindajate import</h1>
        </div>
        <ReadOnlyNote what="Esindajate import" />
      </div>
    );
  }

  const stored = batch
    ? db.select().from(importBatches).where(eq(importBatches.id, batch)).get()
    : undefined;

  if (stored && stored.kind === 'representatives') {
    const payload = stored.rowsJson as {
      rows: StoredRepresentativeRow[];
      fileErrors: Array<{ field?: string; message: string }>;
    };
    const options = (stored.options ?? {}) as { deactivateMissing?: boolean };
    // Recomputed live rather than stored: the preview is a promise about the
    // state the import lands in, and that state may have moved since.
    const wouldDeactivate = options.deactivateMissing && stored.status === 'previewed'
      ? previewDeactivations(payload.rows)
      : [];
    return (
      <div className="space-y-4">
        <div>
          <Link href="/tellija/partnerid/esindajad" className="text-[13px] text-[var(--color-brand)]">
            ← Esindajad
          </Link>
          <h1 className="mt-1">Esindajate impordi eelvaade</h1>
          <p className="mt-1 text-[var(--color-muted)]">
            {stored.fileName} · {formatDateTimeShort(stored.createdAt)} ·{' '}
            {stored.status === 'imported' ? 'juba imporditud' : 'ootab kinnitamist'}
          </p>
        </div>
        <RepresentativeImportPreview
          batchId={stored.id}
          alreadyImported={stored.status !== 'previewed'}
          summary={stored.summary}
          fileErrors={payload.fileErrors}
          wouldDeactivate={wouldDeactivate}
          rows={payload.rows.map((row) => ({
            rowNumber: row.rowNumber,
            partnerName: row.partnerName,
            regCode: row.value?.regCode ?? '',
            name: row.value?.name ?? '',
            email: row.value?.email ?? '',
            role: row.value?.role ?? '',
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
        <Link href="/tellija/partnerid/esindajad" className="text-[13px] text-[var(--color-brand)]">
          ← Esindajad
        </Link>
        <h1 className="mt-1">Impordi esindajad</h1>
        <p className="mt-1 max-w-[80ch] text-[var(--color-muted)]">
          Lae üles partnerite lepinguliste esindajate loend. Sama aadress võib olla aktiivne ainult
          ühe partneri esindajana, ja tellimismeeskonna aadress ei saa olla esindaja. Uuesti
          laadimine uuendab sama (partner, e-post) paari, mitte ei tekita topelt.
        </p>
      </div>

      <RepresentativeImportUploadForm />

      <section className="kh-card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2>Tabeli veerud</h2>
          <a href="/tellija/partnerid/esindajad/mall" className="kh-btn text-xs">
            Laadi alla mall praeguste kontaktidega (.xlsx)
          </a>
        </div>
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
                ['registrikood', 'partneri registrikood, täpselt 8 numbrit; partner peab olema järjestuses'],
                ['esindaja', 'isiku nimi, 2–80 tähemärki'],
                ['e_post', 'isiklik e-posti aadress — sisselogimiseks ja teadeteks'],
                ['roll', 'esindaja (vaikimisi) või asendaja'],
                ['telefon', 'valikuline'],
                ['partner', 'valikuline abiveerg (nimi); importimisel ei kasutata'],
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
          Näidisfail: <code>seed/naidis-esindajad.csv</code>. Kohustuslikud veerud:{' '}
          {REPRESENTATIVE_COLUMNS.join(', ')}; valikulised: {REPRESENTATIVE_OPTIONAL_COLUMNS.join(', ')}.
        </p>
      </section>
    </div>
  );
}

/** The active representatives a confirmed import would switch off, from the stored rows. */
function previewDeactivations(rows: StoredRepresentativeRow[]) {
  const db = getDb();
  const listed = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row.value) continue;
    const set = listed.get(row.value.regCode) ?? new Set<string>();
    set.add(row.value.email);
    listed.set(row.value.regCode, set);
  }
  return db
    .select({
      partnerName: partners.name,
      regCode: partners.regCode,
      name: partnerRepresentatives.name,
      email: partnerRepresentatives.email,
    })
    .from(partnerRepresentatives)
    .innerJoin(partners, eq(partners.id, partnerRepresentatives.partnerId))
    .where(eq(partnerRepresentatives.isActive, true))
    .all()
    .filter((r) => listed.has(r.regCode) && !listed.get(r.regCode)!.has(r.email))
    .map(({ partnerName, name, email }) => ({ partnerName, name, email }));
}
