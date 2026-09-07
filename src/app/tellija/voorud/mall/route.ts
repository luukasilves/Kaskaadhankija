/**
 * The cascade-round workbook template for one lot, prefilled with the lot's
 * unassigned trainings in the calendar-import layout [L-20].
 */

import { eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { lots, trainings } from '@/db/schema';
import { TARGET_GROUPS } from '@/domain/round-statuses';
import { WORKSHOP_TYPE_LABELS } from '@/domain/statuses';
import { requireBuyer } from '@/server/auth/actor';
import { buildRoundTemplate } from '@/server/import/round-template';

export const dynamic = 'force-dynamic';

/** '2026-10-05' → '05.10.2026', the form the import documents. */
function dotted(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}.${m}.${y}` : iso;
}

export async function GET(request: Request): Promise<Response> {
  await requireBuyer();
  const db = getDb();
  const lotRows = db.select().from(lots).where(eq(lots.isActive, true)).all().sort((a, b) => a.code.localeCompare(b.code));
  const wanted = new URL(request.url).searchParams.get('hankeosa')?.toUpperCase();
  const lot = lotRows.find((l) => l.code === wanted) ?? lotRows[0];
  if (!lot) return new Response('Hankeosad puuduvad.', { status: 404 });

  const available = db
    .select()
    .from(trainings)
    .where(inArray(trainings.status, ['unassigned', 'leftover']))
    .all()
    .filter((t) => t.lotId === lot.id)
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate) || a.code.localeCompare(b.code));

  const buffer = await buildRoundTemplate({
    lotCodes: lotRows.map((l) => l.code),
    lotCode: lot.code,
    defaultCapOptions: lot.defaultCapOptions,
    trainingRows: available.map((t) => ({
      kood: t.code,
      hankeosa: lot.code,
      nimetus: t.title,
      formaat: WORKSHOP_TYPE_LABELS[t.workshopType],
      kuupaev: dotted(t.eventDate),
      lopp_kuupaev: dotted(t.eventEnd),
      maakond: t.county,
      asukoht: t.locationText,
      sihtruhm: TARGET_GROUPS[t.targetGroup],
      osalejate_arv: String(t.participantCount),
      keel: t.language,
      hinnanguline_maksumus: String(t.estimatedValueEur),
      markused: t.notes,
    })),
  });

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="voor-${lot.code}-mall.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
