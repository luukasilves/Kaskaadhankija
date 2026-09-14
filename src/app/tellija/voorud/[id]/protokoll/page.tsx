/**
 * The round protocol [L-22].
 *
 * The page is a receipt, not a viewer: it says what the protocol asserts in
 * figures, prints the fingerprint so it can be compared against the PDF footer
 * and the audit row, and hands over the two files. The document itself is the
 * PDF — that is what gets signed, outside this system.
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { auditEvents, rounds } from '@/db/schema';
import { formatDateTime, formatDateTimeShort } from '@/domain/format';
import { frameworkTitleLine } from '@/domain/framework';
import {
  PROTOCOL_KIND_LABELS,
  fingerprint,
  protocolHeadline,
  respondingPartnerCount,
} from '@/domain/round-protocol';
import { ROUND_STATUS_LABELS, ROUND_STATUS_TONES } from '@/domain/round-statuses';
import { StatusBadge } from '@/components/status-badge';
import { ReadOnlyNote } from '@/components/read-only-note';
import { buyerCanWrite, requireBuyer } from '@/server/auth/actor';
import { getRoundProtocol } from '@/server/rounds/protocol';
import { GenerateProtocolForm } from './generate-form';

export const dynamic = 'force-dynamic';

export default async function ProtocolPage({ params }: { params: Promise<{ id: string }> }) {
  await requireBuyer();
  const { id } = await params;
  const db = getDb();
  const canWrite = await buyerCanWrite();

  const round = db
    .select({ id: rounds.id, code: rounds.code, status: rounds.status, publishedAt: rounds.publishedAt })
    .from(rounds)
    .where(eq(rounds.id, id))
    .get();
  if (!round) notFound();

  const back = (
    <Link href={`/tellija/voorud/${id}`} className="text-[13px] text-[var(--color-brand)]">
      ← {round.code}
    </Link>
  );

  const protocol = getRoundProtocol(db, id);

  /* No protocol: either the round has not ended, or it ended before the
     feature existed and an admin can write one now. */
  if (!protocol) {
    const eligible =
      round.status === 'confirmed' || (round.status === 'cancelled' && round.publishedAt !== null);
    return (
      <div className="space-y-4">
        <div>
          {back}
          <h1 className="mt-1">Vooru protokoll</h1>
          <p className="mt-1 text-[var(--color-muted)]">
            {round.code} · {ROUND_STATUS_LABELS[round.status]}
          </p>
        </div>
        {!eligible ? (
          <p className="kh-card p-4 text-[13px]" data-testid="protocol-not-yet">
            Protokoll koostatakse siis, kui voor lõpeb: jaotuse kinnitamisel või avaldatud vooru
            tühistamisel. Selle vooru kohta seda veel ei ole.
          </p>
        ) : !canWrite ? (
          <ReadOnlyNote what="Protokolli koostamine" />
        ) : (
          <div className="kh-card space-y-3 p-4" data-testid="protocol-missing">
            <p className="text-[13px]">
              See voor lõppes enne protokollide kasutuselevõttu, seega automaatset kannet ei ole.
              Protokolli saab koostada samadest salvestatud andmetest — jaotus, kinnitused,
              tellimused ja auditijälg on olemas. Koostamise hetk märgitakse dokumendile.
            </p>
            <GenerateProtocolForm roundId={id} />
          </div>
        )}
      </div>
    );
  }

  const data = protocol.data;
  const auditRow = db
    .select({ id: auditEvents.id, occurredAt: auditEvents.occurredAt, after: auditEvents.after })
    .from(auditEvents)
    .where(eq(auditEvents.roundId, id))
    .all()
    .find((row) => (row.after as { contentHash?: string } | null)?.contentHash === protocol.contentHash);

  const counts: Array<[string, string | number]> = [
    ['Koolitusi', data.trainings.filter((t) => t.withdrawnAt === null).length],
    ['Osalejaid', data.participants.length],
    ['Kinnitusi', data.bids.length],
    ['Vastanud partnereid', respondingPartnerCount(data)],
    ['Kohandusi', data.adjustments.filter((a) => a.effective).length],
    ['Tellimusi', data.orders.length],
    ['Jääk', data.allocation.leftover.length],
    ['Teateid', data.notices.length],
  ];

  return (
    <div className="space-y-5">
      <div>
        {back}
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1>{PROTOCOL_KIND_LABELS[data.kind]}</h1>
          <StatusBadge
            label={ROUND_STATUS_LABELS[round.status]}
            tone={ROUND_STATUS_TONES[round.status]}
          />
        </div>
        <p className="mt-1 text-[var(--color-muted)]">
          {data.round.code} · {data.lot.code} — {data.lot.name}
        </p>
        <p className="mt-1 text-[12.5px] text-[var(--color-muted)]">
          {frameworkTitleLine(data.framework)}
        </p>
      </div>

      {!protocol.intact && (
        <p
          className="rounded-md border px-3 py-2 text-[13px] font-semibold"
          style={{
            borderColor: 'var(--color-danger)',
            background: 'var(--color-danger-soft)',
            color: 'var(--color-danger)',
          }}
          data-testid="protocol-tampered"
        >
          Salvestatud andmed ei vasta oma räsile. Dokumente ei väljastata enne, kui see on
          selgitatud.
        </p>
      )}

      <section className="kh-card p-4">
        <p className="font-semibold" data-testid="protocol-headline">
          {protocolHeadline(data)}
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          {counts.map(([label, value]) => (
            <div key={label}>
              <div className="text-[22px] font-bold tabular-nums">{value}</div>
              <div className="text-[12px] text-[var(--color-muted)]">{label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="kh-card p-4">
        <h2>Allalaadimine</h2>
        <p className="mt-1 max-w-[80ch] text-[13px] text-[var(--color-muted)]">
          PDF on allkirjastatav dokument. .xlsx lisa sisaldab sama sisu tabelitena ning lisaks
          kinnituste tehnilisi tõendeid (IP-aadress, brauser), mida trükitud dokumendis ei ole.
          Kinnitamine toimub väljaspool rakendust — rakendus kinnitust tagasi ei kanna.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={`/tellija/voorud/${id}/protokoll/pdf`}
            className="kh-btn kh-btn-primary"
            data-testid="protocol-pdf"
          >
            Laadi protokoll (PDF)
          </a>
          <a
            href={`/tellija/voorud/${id}/protokoll/xlsx`}
            className="kh-btn"
            data-testid="protocol-xlsx"
          >
            Laadi lisa (.xlsx)
          </a>
        </div>
      </section>

      <section className="kh-card p-4">
        <h2>Sõrmejälg</h2>
        <p className="mt-1 max-w-[80ch] text-[13px] text-[var(--color-muted)]">
          Protokoll on koostatud salvestatud andmetest ja neid ei arvutata uuesti. Alljärgnev
          SHA-256 on nende andmete kohta ning selle esimesed 16 märki on iga PDF-lehe jalusel. Kui
          jalus, see leht ja auditijälg näitavad sama räsi, on dokument muutmata.
        </p>
        <p className="mt-3 font-mono text-[12.5px] break-all" data-testid="protocol-hash">
          {protocol.contentHash}
        </p>
        <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-[auto_1fr]">
          <dt className="text-[var(--color-muted)]">Lühivorm</dt>
          <dd className="font-mono font-semibold">{fingerprint(protocol.contentHash)}</dd>
          <dt className="text-[var(--color-muted)]">Koostatud</dt>
          <dd className="font-semibold tabular-nums">
            {formatDateTime(protocol.generatedAt)} · {protocol.generatedBy}
          </dd>
          <dt className="text-[var(--color-muted)]">Andmestruktuuri versioon</dt>
          <dd className="font-semibold tabular-nums">{protocol.version}</dd>
          <dt className="text-[var(--color-muted)]">Auditijälje kanne</dt>
          <dd className="font-semibold" data-testid="protocol-audit">
            {auditRow ? (
              <Link href="/tellija/auditilogi" className="text-[var(--color-brand)]">
                #{auditRow.id} · {formatDateTimeShort(auditRow.occurredAt)}
              </Link>
            ) : (
              '—'
            )}
          </dd>
        </dl>
      </section>
    </div>
  );
}
