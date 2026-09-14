import { inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { orders } from '@/db/schema';
import { requirePartner } from '@/server/auth/actor';
import { AppNav } from '@/components/app-nav';
import { TestStrip } from '@/components/test-strip';

export const dynamic = 'force-dynamic';

export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePartner();
  // Orders are formalised outside the application for now [L-25]; the menu
  // item stays only for a company that already holds one from before.
  const hasOrders =
    actor.lotPartnerIds.length > 0 &&
    getDb()
      .select({ id: orders.id })
      .from(orders)
      .where(inArray(orders.lotPartnerId, actor.lotPartnerIds))
      .limit(1)
      .all().length > 0;

  return (
    <>
      <TestStrip />
      <AppNav
        title={actor.partnerName}
        subtitle={`Raamlepingu partner · ${actor.memberships.map((m) => `${m.lotCode} koht ${m.rank}`).join(' · ')}`}
        actor={actor.contactName}
        items={[
          { href: '/partner/voorud', label: 'Voorud' },
          { href: '/partner/kalender', label: 'Kalender' },
          ...(hasOrders ? [{ href: '/partner/tellimused', label: 'Tellimused' }] : []),
          { href: '/partner/teavitused', label: 'Teavitused' },
          // Public, and outside this shell — but a partner who has signed in
          // should not have to go back to the sign-in page to find it.
          { href: '/juhend', label: 'Juhend' },
        ]}
      />
      <main className="mx-auto max-w-[1100px] px-5 py-6 pb-16">{children}</main>
    </>
  );
}
