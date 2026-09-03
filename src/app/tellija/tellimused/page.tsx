/** Tellimused — the call-off contracts created by confirmed rounds [T-05]. */

import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { lots, orderTrainings, orders, partners, lotPartners, rounds } from '@/db/schema';
import { formatDateTimeShort, formatEur } from '@/domain/format';
import { ORDER_KIND_LABELS, ORDER_STATUS_LABELS } from '@/domain/round-statuses';
import { StatusBadge } from '@/components/status-badge';

export const dynamic = 'force-dynamic';

export default async function OrdersPage() {
  const db = getDb();

  const rows = db
    .select({
      id: orders.id,
      orderYear: orders.orderYear,
      orderSeq: orders.orderSeq,
      kind: orders.kind,
      status: orders.status,
      buyerConfirmedAt: orders.buyerConfirmedAt,
      partnerConfirmedAt: orders.partnerConfirmedAt,
      documentSnapshot: orders.documentSnapshot,
      roundCode: rounds.code,
      lotCode: lots.code,
      partnerName: partners.name,
    })
    .from(orders)
    .innerJoin(rounds, eq(rounds.id, orders.roundId))
    .innerJoin(lots, eq(lots.id, orders.lotId))
    .innerJoin(lotPartners, eq(lotPartners.id, orders.lotPartnerId))
    .innerJoin(partners, eq(partners.id, lotPartners.partnerId))
    .orderBy(desc(orders.buyerConfirmedAt))
    .all();

  const cancelled = new Map<string, number>();
  for (const link of db.select().from(orderTrainings).all()) {
    if (link.cancelledAt !== null || link.partnerWithdrewAt !== null) {
      cancelled.set(link.orderId, (cancelled.get(link.orderId) ?? 0) + 1);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1>Tellimused</h1>
        <p className="mt-1 max-w-[80ch] text-[var(--color-muted)]">
          Iga kinnitatud vooru kohta luuakse igale täitjale tellimus. Raamlepingu järgi on tellimus
          käsitletav hankelepinguna, seega selle sisu on kinnitamise hetkel külmutatud.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="kh-card p-6 text-[var(--color-muted)]">
          Tellimusi veel ei ole. Need luuakse vooru jaotuse kinnitamisel.
        </p>
      ) : (
        <div className="kh-card overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="kh-th">Number</th>
                <th className="kh-th">Partner</th>
                <th className="kh-th">Osa</th>
                <th className="kh-th">Voor</th>
                <th className="kh-th">Koolitusi</th>
                <th className="kh-th">Kogumaksumus</th>
                <th className="kh-th">Kinnitatud</th>
                <th className="kh-th">Olek</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((order) => {
                const number = `KH-${order.orderYear}-${String(order.orderSeq).padStart(4, '0')}`;
                const withdrawn = cancelled.get(order.id) ?? 0;
                return (
                  <tr key={order.id}>
                    <td className="kh-td font-semibold whitespace-nowrap">
                      <Link href={`/tellija/tellimused/${order.id}`} className="text-[var(--color-brand)]">
                        {number}
                      </Link>
                    </td>
                    <td className="kh-td">{order.partnerName}</td>
                    <td className="kh-td whitespace-nowrap">{order.lotCode}</td>
                    <td className="kh-td whitespace-nowrap">{order.roundCode}</td>
                    <td className="kh-td tabular-nums">
                      {order.documentSnapshot.trainings.length}
                      {withdrawn > 0 && (
                        <span className="ml-1 text-[12px]" style={{ color: 'var(--color-danger)' }}>
                          ({withdrawn} tühistatud)
                        </span>
                      )}
                    </td>
                    <td className="kh-td whitespace-nowrap tabular-nums">
                      {formatEur(order.documentSnapshot.totalEur)}
                    </td>
                    <td className="kh-td text-[13px] whitespace-nowrap tabular-nums">
                      {formatDateTimeShort(order.buyerConfirmedAt)}
                    </td>
                    <td className="kh-td whitespace-nowrap">
                      <StatusBadge
                        label={ORDER_STATUS_LABELS[order.status]}
                        tone={order.status === 'cancelled' ? 'neutral' : 'success'}
                        title={ORDER_KIND_LABELS[order.kind]}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
