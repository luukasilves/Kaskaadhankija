/**
 * The committed sample workbooks, served for download.
 *
 * The test environment starts seeded from these, so a tester who wants to try
 * the upload path can take the same file, put their own address on a partner,
 * and drop it back — which is also how the browser suite exercises it.
 *
 * The names are an allow-list, not a path: nothing outside `seed/` can be
 * reached even if the segment is crafted.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { requireBuyer } from '@/server/auth/actor';

export const dynamic = 'force-dynamic';

const ALLOWED = new Set([
  'naidis-raamhange.xlsx',
  'naidis-koolituskalender.xlsx',
  'naidis-koolituskalender.csv',
  'naidis-voor.xlsx',
  'naidis-partnerid.csv',
  'naidis-esindajad.csv',
]);

export async function GET(_request: Request, { params }: { params: Promise<{ fail: string }> }) {
  await requireBuyer();
  const { fail } = await params;
  if (!ALLOWED.has(fail)) {
    return new Response('Sellist näidisfaili ei ole.', { status: 404 });
  }

  let content: Buffer;
  try {
    content = readFileSync(join(process.cwd(), 'seed', fail));
  } catch {
    return new Response(
      'Näidisfail ei ole veel koostatud — käivita `pnpm datasets:build`.',
      { status: 404 },
    );
  }

  return new Response(new Uint8Array(content), {
    headers: {
      'Content-Type': fail.endsWith('.csv')
        ? 'text/csv; charset=utf-8'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fail}"`,
      'Cache-Control': 'no-store',
    },
  });
}
