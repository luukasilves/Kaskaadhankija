/**
 * Teavitused — the buyer's view of every notification the system produced.
 *
 * In the test deployment this is the primary channel: SMTP is optional, so the
 * log is where the messages actually live. It shows partner-facing messages too,
 * so the buyer can read exactly what a koolitaja was told.
 */

import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { lotPartners, notifications, partners, rounds } from '@/db/schema';
import { formatDateTimeShort } from '@/domain/format';
import { NOTIFICATION_TYPE_LABELS } from '@/domain/round-statuses';
import { StatusBadge } from '@/components/status-badge';
import { hasSmtp } from '@/lib/env';

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
      emailTo: notifications.emailTo,
      emailStatus: notifications.emailStatus,
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

  return (
    <div className="space-y-4">
      <div>
        <h1>Teavitused</h1>
        <p className="mt-1 max-w-[80ch] text-[var(--color-muted)]">
          Kõik teated, mida süsteem on koostanud — nii partneritele kui tellimismeeskonnale.
          {hasSmtp
            ? ' SMTP on seadistatud, seega need saadeti ka e-postiga.'
            : ' SMTP ei ole seadistatud, seega e-kirju ei saadetud — see logi on ainus kanal.'}
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="kh-card p-6 text-[var(--color-muted)]">Teateid veel ei ole.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
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
                  {row.emailTo && (
                    <span>
                      · {row.emailTo}{' '}
                      {row.emailStatus === 'sent'
                        ? '(saadetud)'
                        : row.emailStatus === 'failed'
                          ? '(saatmine ebaõnnestus)'
                          : '(e-kirja ei saadetud)'}
                    </span>
                  )}
                </div>
              </summary>
              <pre className="mt-3 overflow-x-auto text-[13px] whitespace-pre-wrap">{row.body}</pre>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
