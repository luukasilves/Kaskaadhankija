/**
 * The framework workbook, filled in with the current state [L-21].
 *
 * Not a blank template: this is the round trip. Download, change the cell you
 * came to change, drop the file back — the file carries this system's marker,
 * so the preview treats it as the whole truth. Generated in memory and
 * streamed; nothing on disk. The data is assembled by `frameworkWorkbookData`,
 * where a test can run the same round trip without HTTP.
 */

import { getDb } from '@/db';
import { tallinnIsoDay } from '@/domain/format';
import { currentTimeMs } from '@/server/clock';
import { requireBuyer } from '@/server/auth/actor';
import { frameworkWorkbookData } from '@/server/framework';
import { buildFrameworkWorkbook } from '@/server/import/framework-template';

export const dynamic = 'force-dynamic';

export async function GET() {
  await requireBuyer();
  const buffer = await buildFrameworkWorkbook(frameworkWorkbookData(getDb()));

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="raamhanke-andmed-${tallinnIsoDay(currentTimeMs())}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
