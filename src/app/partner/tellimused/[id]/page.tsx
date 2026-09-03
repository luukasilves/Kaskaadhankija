/**
 * One order, as the partner sees it — the printable call-off contract [T-05].
 *
 * Rendered entirely from the document snapshot frozen at confirmation, so the
 * partner and the buyer print the same paper even after a contact or a lot
 * price changes. Scoped to the acting company's memberships: an order id from
 * another partner is a 404, not a leak [N-04].
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { orderTrainings, orders, trainings } from '@/db/schema';
import { formatDateTimeShort, formatEur, formatIsoDay } from '@/domain/format';
import { ORDER_STATUS_LABELS, TRAINING_STATUS_LABELS } from '@/domain/round-statuses';
import { LANGUAGE_LABELS } from '@/domain/statuses';
import { StatusBadge } from '@/components/status-badge';
import { requirePartner } from '@/server/auth/actor';

export const dynamic = 'force-dynamic';

export default async function PartnerOrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePartner();
  if (actor.lotPartnerIds.length === 0) notFound();

  const db = getDb();
  const order = db
    .select()
    .from(orders)
    .where(and(eq(orders.id, id), inArray(orders.lotPartnerId, actor.lotPartnerIds)))
    .get();
  if (!order) notFound();

  const document = order.documentSnapshot;
  const number = `KH-${order.orderYear}-${String(order.orderSeq).padStart(4, '0')}`;

  const links = db
    .select({
      code: trainings.code,
      status: trainings.status,
      cancelledAt: orderTrainings.cancelledAt,
      cancelReason: orderTrainings.cancelReason,
      partnerWithdrewAt: orderTrainings.partnerWithdrewAt,
      partnerWithdrawNote: orderTrainings.partnerWithdrawNote,
    })
    .from(orderTrainings)
    .innerJoin(trainings, eq(trainings.id, orderTrainings.trainingId))
    .where(eq(orderTrainings.orderId, id))
    .all();
  const linkByCode = new Map(links.map((link) => [link.code, link] as const));

  const liveTotal = document.trainings.reduce((sum, training) => {
    const link = linkByCode.get(training.code);
    const off = link?.cancelledAt !== null || link?.partnerWithdrewAt !== null;
    return off ? sum : sum + training.unitPriceEur;
  }, 0);
  const anyOff = liveTotal !== document.totalEur;

  return (
    <div className="space-y-5">
      <div className="kh-no-print flex flex-wrap items-center gap-3">
        <Link href="/partner/tellimused" className="text-[13px] text-[var(--color-brand)]">
          ← Tellimused
        </Link>
        <StatusBadge
          label={ORDER_STATUS_LABELS[order.status]}
          tone={order.status === 'cancelled' ? 'neutral' : 'success'}
        />
        <span className="ml-auto text-[12px] text-[var(--color-muted)]">
          Trükkimiseks kasuta brauseri prindifunktsiooni (Ctrl/Cmd + P).
        </span>
      </div>

      <article className="kh-card p-6">
        <header className="border-b border-[var(--color-border)] pb-4">
          <h1>Koolitustellimus {number}</h1>
          <p className="mt-1 text-[13px] text-[var(--color-muted)]">{document.frameworkReference}</p>
          <p className="mt-0.5 text-[13px] text-[var(--color-muted)]">
            Hankeosa {document.lotCode} — {document.lotName} · voor {document.roundCode}
          </p>
        </header>

        <section className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <h2>Täitja</h2>
            <p className="mt-1 font-semibold">{document.partnerName}</p>
            <p className="text-[13px] text-[var(--color-muted)]">
              Registrikood {document.partnerRegCode}
            </p>
            <p className="text-[13px]">
              {document.contactName} · {document.contactEmail}
            </p>
          </div>
          <div>
            <h2>Kinnitused</h2>
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[13px]">
              <dt className="text-[var(--color-muted)]">Teie kinnitus voorus</dt>
              <dd className="font-semibold tabular-nums">
                {document.partnerConfirmedAt
                  ? formatDateTimeShort(document.partnerConfirmedAt)
                  : '—'}
              </dd>
              <dt className="text-[var(--color-muted)]">Tellija kinnitus</dt>
              <dd className="font-semibold tabular-nums">
                {formatDateTimeShort(document.buyerConfirmedAt)}
              </dd>
              <dt className="text-[var(--color-muted)]">Kinnitas</dt>
              <dd className="font-semibold">{document.buyerConfirmedBy}</dd>
            </dl>
          </div>
        </section>

        <section className="mt-5">
          <h2>Koolitused ({document.trainings.length})</h2>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="kh-th">Kood</th>
                  <th className="kh-th">Koolitus</th>
                  <th className="kh-th">Formaat</th>
                  <th className="kh-th">Toimumine</th>
                  <th className="kh-th">Asukoht</th>
                  <th className="kh-th">Osalejaid</th>
                  <th className="kh-th">Keel</th>
                  <th className="kh-th">Olek</th>
                  <th className="kh-th">Ühikhind</th>
                </tr>
              </thead>
              <tbody>
                {document.trainings.map((training) => {
                  const link = linkByCode.get(training.code);
                  const cancelled = link?.cancelledAt !== null && link?.cancelledAt !== undefined;
                  const withdrawn =
                    link?.partnerWithdrewAt !== null && link?.partnerWithdrewAt !== undefined;
                  const off = cancelled || withdrawn;
                  return (
                    <tr key={training.code} style={off ? { opacity: 0.55 } : undefined}>
                      <td className="kh-td font-semibold whitespace-nowrap">{training.code}</td>
                      <td className="kh-td">
                        {training.title}
                        {cancelled && (
                          <div className="text-[12px]" style={{ color: 'var(--color-danger)' }}>
                            Tellija tühistas: {link?.cancelReason}
                          </div>
                        )}
                        {withdrawn && (
                          <div className="text-[12px]" style={{ color: 'var(--color-danger)' }}>
                            Loobumine registreeritud: {link?.partnerWithdrawNote}
                          </div>
                        )}
                      </td>
                      <td className="kh-td text-[13px] whitespace-nowrap">
                        {training.workshopType}
                      </td>
                      <td className="kh-td whitespace-nowrap tabular-nums">
                        {formatIsoDay(training.eventDate)}
                        {training.eventEnd && ` – ${formatIsoDay(training.eventEnd)}`}
                      </td>
                      <td className="kh-td text-[13px]">
                        {training.county}
                        {training.locationText && `, ${training.locationText}`}
                      </td>
                      <td className="kh-td tabular-nums">{training.participantCount}</td>
                      <td className="kh-td text-[13px] whitespace-nowrap">
                        {LANGUAGE_LABELS[training.language as 'et' | 'ru' | 'en'] ??
                          training.language}
                      </td>
                      <td className="kh-td text-[13px] whitespace-nowrap">
                        {off
                          ? 'Ära jäänud'
                          : link
                            ? TRAINING_STATUS_LABELS[link.status]
                            : '—'}
                      </td>
                      <td className="kh-td whitespace-nowrap tabular-nums">
                        {formatEur(training.unitPriceEur)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td className="kh-td font-semibold" colSpan={8}>
                    Hinnanguline kogumaksumus tellimuse väljastamisel
                  </td>
                  <td className="kh-td font-bold whitespace-nowrap tabular-nums">
                    {formatEur(document.totalEur)}
                  </td>
                </tr>
                {anyOff && (
                  <tr>
                    <td className="kh-td font-semibold" colSpan={8}>
                      Kehtivate koolituste maksumus
                    </td>
                    <td className="kh-td font-bold whitespace-nowrap tabular-nums">
                      {formatEur(liveTotal)}
                    </td>
                  </tr>
                )}
              </tfoot>
            </table>
          </div>
        </section>

        <footer className="mt-5 border-t border-[var(--color-border)] pt-3 text-[12px] text-[var(--color-muted)]">
          Koolituse ärajäämine või muu takistus tuleb tellijale teatada esimesel võimalusel —
          süsteem seda ise ei registreeri.
        </footer>
      </article>
    </div>
  );
}
