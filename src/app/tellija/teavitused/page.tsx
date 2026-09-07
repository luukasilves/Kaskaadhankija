/**
 * Teavitused — the buyer's view of every notification the system produced, and
 * of what happened to each e-mail copy [D-10].
 *
 * The log is the record of what each partner was told. Per recipient it shows
 * whether the mail was sent, failed, was suppressed by the test environment's
 * allowlist, or never attempted for want of a transport — and offers a manual
 * re-send, since the automatic retries give up after three attempts.
 */

import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { lotPartners, notifications, partners, rounds } from '@/db/schema';
import { formatDateTimeShort } from '@/domain/format';
import { EMAIL_DELIVERY_STATUS_LABELS, NOTIFICATION_TYPE_LABELS } from '@/domain/round-statuses';
import { StatusBadge } from '@/components/status-badge';
import { resendDeliveryAction } from '@/server/actions/mail';
import { describeMailMode } from '@/server/mail';
import { deliveriesFor } from '@/server/notify';

export const dynamic = 'force-dynamic';

export default async function BuyerNotificationsPage() {
  const db = getDb();

  const rows = db
    .select({
      id: notifications.id,
      createdAt: notifications.createdAt,
      recipientKind: notifications.recipientKind,
      type: notifications.type,
      title: notifications.title,
      body: notifications.body,
      roundCode: rounds.code,
      partnerName: partners.name,
    })
    .from(notifications)
    .leftJoin(rounds, eq(rounds.id, notifications.roundId))
    .leftJoin(lotPartners, eq(lotPartners.id, notifications.recipientLotPartnerId))
    .leftJoin(partners, eq(partners.id, lotPartners.partnerId))
    .orderBy(desc(notifications.createdAt))
    .limit(300)
    .all();

  const deliveries = deliveriesFor(
    db,
    rows.map((r) => r.id),
  );

  return (
    <div className="space-y-4">
      <div>
        <h1>Teavitused</h1>
        <p className="mt-1 max-w-[80ch] text-[var(--color-muted)]">
          Kõik teated, mida süsteem on koostanud — nii partneritele kui tellimismeeskonnale.{' '}
          {describeMailMode()}
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="kh-card p-6 text-[var(--color-muted)]">Teateid veel ei ole.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const mails = deliveries.get(row.id) ?? [];
            const sentCount = mails.filter((m) => m.status === 'sent').length;
            const failedCount = mails.filter((m) => m.status === 'failed').length;
            return (
              <details key={row.id} className="kh-card p-3">
                <summary className="cursor-pointer">
                  <span className="font-semibold">{row.title}</span>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-[var(--color-muted)]">
                    <span className="tabular-nums">{formatDateTimeShort(row.createdAt)}</span>
                    <StatusBadge
                      label={NOTIFICATION_TYPE_LABELS[row.type] ?? row.type}
                      tone={row.recipientKind === 'buyer' ? 'neutral' : 'info'}
                    />
                    <span>
                      {row.recipientKind === 'buyer'
                        ? 'tellimismeeskonnale'
                        : `partnerile: ${row.partnerName ?? '—'}`}
                    </span>
                    {row.roundCode && <span>· {row.roundCode}</span>}
                    <span data-testid="delivery-summary">
                      ·{' '}
                      {mails.length === 0
                        ? 'e-kirja ei saadetud (saajat ei ole)'
                        : failedCount > 0
                          ? `e-kiri: ${failedCount} saatmine ebaõnnestus`
                          : sentCount === mails.length
                            ? `e-kiri saadetud (${sentCount})`
                            : `e-kiri: ${EMAIL_DELIVERY_STATUS_LABELS[mails[0]!.status] ?? mails[0]!.status}`}
                    </span>
                  </div>
                </summary>

                {mails.length > 0 && (
                  <ul className="mt-3 space-y-1 text-[13px]" data-testid="deliveries">
                    {mails.map((mail) => (
                      <li key={mail.id} className="flex flex-wrap items-center gap-2">
                        <span className="font-mono">{mail.to}</span>
                        <span
                          className={
                            mail.status === 'sent'
                              ? 'text-[var(--color-success)]'
                              : mail.status === 'failed'
                                ? 'text-[var(--color-danger)]'
                                : 'text-[var(--color-muted)]'
                          }
                          title={mail.detail || undefined}
                        >
                          {EMAIL_DELIVERY_STATUS_LABELS[mail.status] ?? mail.status}
                          {mail.attempts > 1 ? ` (${mail.attempts} katset)` : ''}
                          {mail.sentAt ? ` ${formatDateTimeShort(mail.sentAt)}` : ''}
                        </span>
                        {mail.detail && mail.status !== 'sent' && (
                          <span className="text-[12px] text-[var(--color-muted)]">— {mail.detail}</span>
                        )}
                        <form action={resendDeliveryAction} className="inline">
                          <input type="hidden" name="deliveryId" value={mail.id} />
                          <button type="submit" className="kh-btn text-xs" title="Saada see e-kiri uuesti">
                            Saada uuesti
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                )}

                <pre className="mt-3 overflow-x-auto text-[13px] whitespace-pre-wrap">{row.body}</pre>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
