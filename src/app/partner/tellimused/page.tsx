/**
 * A partner's own orders — the call-off contracts they have been issued [T-05].
 *
 * Scoped by `lotPartnerIds` of the acting company, so a partner sees their own
 * contracts and nothing about anyone else's [N-04].
 */

import Link from 'next/link';
import { desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { lots, orderTrainings, orders, rounds } from '@/db/schema';
import { formatDateTimeShort, formatEur } from '@/domain/format';
import { ORDER_STATUS_LABELS } from '@/domain/round-statuses';
import { StatusBadge } from '@/components/status-badge';
import { requirePartner } from '@/server/auth/actor';

export const dynamic = 'force-dynamic';

export default async function PartnerOrdersPage() {
  const actor = await requirePartner();
  const db = getDb();

  const rows =
    actor.lotPartnerIds.length === 0
      ? []
      : db
          .select({
            id: orders.id,
            orderYear: orders.orderYear,
            orderSeq: orders.orderSeq,
            status: orders.status,
            buyerConfirmedAt: orders.buyerConfirmedAt,
            documentSnapshot: orders.documentSnapshot,
            roundCode: rounds.code,
            lotCode: lots.code,
            lotName: lots.name,
          })
          .from(orders)
          .innerJoin(rounds, eq(rounds.id, orders.roundId))
          .innerJoin(lots, eq(lots.id, orders.lotId))
          .where(inArray(orders.lotPartnerId, actor.lotPartnerIds))
          .orderBy(desc(orders.buyerConfirmedAt))
          .all();

  // How many trainings of each order are no longer live, so the list total does
  // not promise work that was cancelled or withdrawn afterwards [E-07].
  const voided = new Map<string, number>();
  if (rows.length > 0) {
    for (const link of db
      .select()
      .from(orderTrainings)
      .where(
        inArray(
          orderTrainings.orderId,
          rows.map((row) => row.id),
        ),
      )
      .all()) {
      if (link.cancelledAt !== null || link.partnerWithdrewAt !== null) {
        voided.set(link.orderId, (voided.get(link.orderId) ?? 0) + 1);
      }
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1>Tellimused</h1>
        <p className="mt-1 max-w-[80ch] text-[var(--color-muted)]">
          Teile väljastatud koolitustellimused. Raamlepingu järgi on tellimus käsitletav
          hankelepinguna — selle sisu on kinnitamise hetkel külmutatud ja koolitused tuleb läbi viia
          raamlepingu tingimustel.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="kh-card p-6 text-[var(--color-muted)]">
          Teile ei ole veel tellimusi väljastatud. Tellimus tekib siis, kui tellija kinnitab vooru
          jaotuse ja mõni teie kinnitatud koolitus määratakse teile.
        </p>
      ) : (
        <div className="kh-card overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="kh-th">Number</th>
                <th className="kh-th">Osa</th>
                <th className="kh-th">Voor</th>
                <th className="kh-th">Koolitusi</th>
                <th className="kh-th">Kogumaksumus</th>
                <th className="kh-th">Väljastatud</th>
                <th className="kh-th">Olek</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((order) => {
                const number = `KH-${order.orderYear}-${String(order.orderSeq).padStart(4, '0')}`;
                const off = voided.get(order.id) ?? 0;
                return (
                  <tr key={order.id}>
                    <td className="kh-td font-semibold whitespace-nowrap">
                      <Link
                        href={`/partner/tellimused/${order.id}`}
                        className="text-[var(--color-brand)]"
                      >
                        {number}
                      </Link>
                    </td>
                    <td className="kh-td whitespace-nowrap">
                      {order.lotCode}
                      <div className="text-[12px] text-[var(--color-muted)]">{order.lotName}</div>
                    </td>
                    <td className="kh-td whitespace-nowrap">{order.roundCode}</td>
                    <td className="kh-td tabular-nums">
                      {order.documentSnapshot.trainings.length - off}
                      {off > 0 && (
                        <span className="ml-1 text-[12px] text-[var(--color-muted)]">
                          ({off} ära jäänud)
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
