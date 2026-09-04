/**
 * One order — the printable call-off contract [T-05].
 *
 * Rendered entirely from the document snapshot frozen at confirmation, not from
 * live joins: the contract must say what it said when it was agreed, even if a
 * partner's contact or a lot's configuration changes afterwards.
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { orderTrainings, orders, trainings } from '@/db/schema';
import { formatDateTimeShort, formatEur, formatIsoDay } from '@/domain/format';
import { LANGUAGE_LABELS } from '@/domain/statuses';
import { OrderAdminPanel } from './order-admin-panel';

export const dynamic = 'force-dynamic';

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const order = db.select().from(orders).where(eq(orders.id, id)).get();
  if (!order) notFound();

  const document = order.documentSnapshot;
  const number = `KH-${order.orderYear}-${String(order.orderSeq).padStart(4, '0')}`;

  const links = db
    .select({
      trainingId: orderTrainings.trainingId,
      unitPriceEur: orderTrainings.unitPriceEur,
      cancelledAt: orderTrainings.cancelledAt,
      cancelReason: orderTrainings.cancelReason,
      partnerWithdrewAt: orderTrainings.partnerWithdrewAt,
      partnerWithdrawNote: orderTrainings.partnerWithdrawNote,
      status: trainings.status,
      code: trainings.code,
    })
    .from(orderTrainings)
    .innerJoin(trainings, eq(trainings.id, orderTrainings.trainingId))
    .where(eq(orderTrainings.orderId, id))
    .all();
  const linkByCode = new Map(links.map((l) => [l.code, l] as const));

  return (
    <div className="space-y-5">
      <div className="kh-no-print">
        <Link href="/tellija/tellimused" className="text-[13px] text-[var(--color-brand)]">
          ← Tellimused
        </Link>
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
              <dt className="text-[var(--color-muted)]">Partneri kinnitus</dt>
              <dd className="font-semibold tabular-nums">
                {document.partnerConfirmedAt ? formatDateTimeShort(document.partnerConfirmedAt) : '—'}
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
                  <th className="kh-th">Ühikhind</th>
                </tr>
              </thead>
              <tbody>
                {document.trainings.map((training) => {
                  const link = linkByCode.get(training.code);
                  const voided = link?.cancelledAt !== null && link?.cancelledAt !== undefined;
                  const withdrawn =
                    link?.partnerWithdrewAt !== null && link?.partnerWithdrewAt !== undefined;
                  return (
                    <tr key={training.code} style={voided || withdrawn ? { opacity: 0.55 } : undefined}>
                      <td className="kh-td font-semibold whitespace-nowrap">{training.code}</td>
                      <td className="kh-td">
                        {training.title}
                        {voided && (
                          <div className="text-[12px]" style={{ color: 'var(--color-danger)' }}>
                            tühistatud: {link?.cancelReason}
                          </div>
                        )}
                        {withdrawn && (
                          <div className="text-[12px]" style={{ color: 'var(--color-danger)' }}>
                            partner loobus: {link?.partnerWithdrawNote} — vajab lepingulist
                            järelmenetlust
                          </div>
                        )}
                      </td>
                      <td className="kh-td text-[13px] whitespace-nowrap">{training.workshopType}</td>
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
                        {LANGUAGE_LABELS[training.language as 'et' | 'ru' | 'en'] ?? training.language}
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
                  <td className="kh-td font-semibold" colSpan={7}>
                    Hinnanguline kogumaksumus
                  </td>
                  <td className="kh-td font-bold whitespace-nowrap tabular-nums">
                    {formatEur(document.totalEur)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      </article>

      <OrderAdminPanel
        orderId={id}
        trainings={links
          .filter((link) => link.cancelledAt === null && link.partnerWithdrewAt === null)
          .map((link) => ({ id: link.trainingId, code: link.code, status: link.status }))}
      />
    </div>
  );
}
