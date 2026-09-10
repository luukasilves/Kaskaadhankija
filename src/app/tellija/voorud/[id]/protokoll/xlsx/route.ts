/**
 * The round protocol's .xlsx annex [L-22].
 *
 * Same stored row, same guards as the PDF; this rendering additionally carries
 * the technical evidence of each confirmation, which is why it is a separate
 * download rather than part of the signed document.
 */

import { notFound } from 'next/navigation';
import { getDb } from '@/db';
import { requireBuyer } from '@/server/auth/actor';
import { buildProtocolXlsx } from '@/server/documents/protocol-xlsx';
import { getRoundProtocol } from '@/server/rounds/protocol';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireBuyer();
  const { id } = await params;

  const protocol = getRoundProtocol(getDb(), id);
  if (!protocol) notFound();
  if (!protocol.intact) {
    return new Response(
      'Protokolli andmed ei vasta salvestatud räsile. Lisa ei väljastata — võta ühendust halduriga.',
      { status: 500 },
    );
  }

  const buffer = await buildProtocolXlsx(protocol.data, protocol.contentHash);
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="vooru-protokoll-${protocol.data.round.code}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
