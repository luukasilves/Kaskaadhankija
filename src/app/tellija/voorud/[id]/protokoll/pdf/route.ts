/**
 * The round protocol as a PDF download [L-22].
 *
 * Rendered on demand from the stored row, in memory, and streamed — nothing on
 * disk. Two guards: the buyer side only (a protocol names every partner's bid,
 * which no partner may see), and an integrity check, because a document whose
 * printed fingerprint does not match its own content would be worse than no
 * document at all.
 */

import { notFound } from 'next/navigation';
import { getDb } from '@/db';
import { requireBuyer } from '@/server/auth/actor';
import { buildProtocolPdf } from '@/server/documents/protocol-pdf';
import { getRoundProtocol } from '@/server/rounds/protocol';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireBuyer();
  const { id } = await params;

  const protocol = getRoundProtocol(getDb(), id);
  if (!protocol) notFound();
  if (!protocol.intact) {
    return new Response(
      'Protokolli andmed ei vasta salvestatud räsile. Dokumenti ei väljastata — võta ühendust halduriga.',
      { status: 500 },
    );
  }

  const buffer = await buildProtocolPdf(protocol.data, protocol.contentHash);
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="vooru-protokoll-${protocol.data.round.code}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
