import { requirePartner } from '@/server/auth/actor';
import { AppNav } from '@/components/app-nav';
import { TestStrip } from '@/components/test-strip';

export const dynamic = 'force-dynamic';

export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePartner();

  return (
    <>
      <TestStrip />
      <AppNav
        title={actor.partnerName}
        subtitle={`Raamlepingu partner · ${actor.memberships.map((m) => `${m.lotCode} koht ${m.rank}`).join(' · ')}`}
        actor={actor.contactName}
        items={[
          { href: '/partner/voorud', label: 'Voorud' },
          { href: '/partner/tellimused', label: 'Tellimused' },
          { href: '/partner/teavitused', label: 'Teavitused' },
        ]}
      />
      <main className="mx-auto max-w-[1100px] px-5 py-6 pb-16">{children}</main>
    </>
  );
}
