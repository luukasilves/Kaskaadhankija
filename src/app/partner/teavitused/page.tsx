/**
 * A partner's own notification log.
 *
 * The same rows the buyer's log shows, filtered to this company's memberships —
 * in the test deployment SMTP is optional, so this is where a koolitaja
 * actually reads what they were told. Nothing about other partners appears
 * here, and the messages themselves are already worded so they cannot leak
 * a competitor's marks [N-04][N-08].
 */

import Link from 'next/link';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { notifications, orders, rounds } from '@/db/schema';
import { formatDateTimeShort } from '@/domain/format';
import { EMAIL_DELIVERY_STATUS_LABELS, NOTIFICATION_TYPE_LABELS } from '@/domain/round-statuses';
import { StatusBadge } from '@/components/status-badge';
import { requirePartner } from '@/server/auth/actor';
import { describeMailMode } from '@/server/mail';
import { deliveriesFor } from '@/server/notify';

export const dynamic = 'force-dynamic';

/** Types worth pulling the eye to: something is expected of the partner. */
const ACTIONABLE = new Set(['round_published', 'reminder_24h', 'round_changed', 'order_issued']);

export default async function PartnerNotificationsPage() {
  const actor = await requirePartner();
  const db = getDb();

  const rows =
    actor.lotPartnerIds.length === 0
      ? []
      : db
          .select({
            id: notifications.id,
            createdAt: notifications.createdAt,
            type: notifications.type,
            title: notifications.title,
            body: notifications.body,
            roundId: notifications.roundId,
            roundCode: rounds.code,
            orderId: notifications.orderId,
            orderYear: orders.orderYear,
            orderSeq: orders.orderSeq,
          })
          .from(notifications)
          .leftJoin(rounds, eq(rounds.id, notifications.roundId))
          .leftJoin(orders, eq(orders.id, notifications.orderId))
          .where(
            and(
              eq(notifications.recipientKind, 'partner'),
              inArray(notifications.recipientLotPartnerId, actor.lotPartnerIds),
            ),
          )
          .orderBy(desc(notifications.createdAt))
          .limit(200)
          .all();

  // What happened to each e-mail copy — the partner's own addresses only, since
  // the rows are already filtered to this company's notices [D-10].
  const deliveries = deliveriesFor(
    db,
    rows.map((r) => r.id),
  );

  return (
    <div className="space-y-4">
      <div>
        <h1>Teavitused</h1>
        <p className="mt-1 max-w-[80ch] text-[var(--color-muted)]">
          Kõik teated, mille süsteem on teile koostanud — vooru avaldamised, kinnituste kviitungid,
          prognoosi muutused ja tellimused. {describeMailMode()}
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="kh-card p-6 text-[var(--color-muted)]">Teateid veel ei ole.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const actionable = ACTIONABLE.has(row.type);
            return (
              <details
                key={row.id}
                className="kh-card p-3"
                style={
                  actionable ? { borderColor: 'var(--color-brand)', borderWidth: 2 } : undefined
                }
              >
                <summary className="cursor-pointer">
                  <span className="font-semibold">{row.title}</span>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-[var(--color-muted)]">
                    <span className="tabular-nums">{formatDateTimeShort(row.createdAt)}</span>
                    <StatusBadge
                      label={NOTIFICATION_TYPE_LABELS[row.type] ?? row.type}
                      tone={actionable ? 'info' : 'neutral'}
                    />
                    {row.roundCode && <span>· {row.roundCode}</span>}
                    {(deliveries.get(row.id) ?? []).map((mail) => (
                      <span key={mail.id} title={mail.detail || undefined}>
                        · {mail.to} ({EMAIL_DELIVERY_STATUS_LABELS[mail.status] ?? mail.status})
                      </span>
                    ))}
                  </div>
                </summary>
                <pre className="mt-3 overflow-x-auto text-[13px] whitespace-pre-wrap">
                  {row.body}
                </pre>
                <div className="mt-2 flex flex-wrap gap-3 text-[13px]">
                  {row.roundId && (
                    <Link
                      href={`/partner/voorud/${row.roundId}`}
                      className="text-[var(--color-brand)]"
                    >
                      Ava voor {row.roundCode ?? ''}
                    </Link>
                  )}
                  {row.orderId && row.orderYear !== null && row.orderSeq !== null && (
                    <Link
                      href={`/partner/tellimused/${row.orderId}`}
                      className="text-[var(--color-brand)]"
                    >
                      Ava tellimus KH-{row.orderYear}-{String(row.orderSeq).padStart(4, '0')}
                    </Link>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
