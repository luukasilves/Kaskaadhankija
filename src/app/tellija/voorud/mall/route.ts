/**
 * The cascade-round workbook template for one lot, prefilled with the lot's
 * unassigned trainings in the calendar-import layout [L-20]; a cluster's free
 * groups as one cluster row [L-28].
 */

import { eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { lots, trainings } from '@/db/schema';
import { requireBuyer } from '@/server/auth/actor';
import { buildRoundTemplate, templateRowsFor } from '@/server/import/round-template';

export const dynamic = 'force-dynamic';

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
    .filter((t) => t.lotId === lot.id);

  const buffer = await buildRoundTemplate({
    lotCodes: lotRows.map((l) => l.code),
    lotCode: lot.code,
    defaultCapOptions: lot.defaultCapOptions,
    trainingRows: templateRowsFor(available, lot.code),
  });

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="voor-${lot.code}-mall.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
