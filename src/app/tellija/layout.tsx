import { requireBuyer } from '@/server/auth/actor';
import { AppNav } from '@/components/app-nav';
import { TestStrip } from '@/components/test-strip';
import { getDb } from '@/db';
import { frameworkIdentity } from '@/server/framework';
import { frameworkSubtitle } from '@/domain/framework';
import { rounds, trainings } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export default async function BuyerLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireBuyer();
  const db = getDb();

  const openCount = db.select({ id: rounds.id }).from(rounds).where(eq(rounds.status, 'open')).all().length;
  const closedCount = db.select({ id: rounds.id }).from(rounds).where(eq(rounds.status, 'closed')).all().length;
  const leftoverCount = db
    .select({ id: trainings.id })
    .from(trainings)
    .where(eq(trainings.status, 'leftover'))
    .all().length;

  return (
    <>
      <TestStrip />
      <AppNav
        title="Kaskaadhankija"
        subtitle={frameworkSubtitle(frameworkIdentity(db))}
        // A member can open every screen but change nothing [R-01]; saying so
        // in the header beats letting them find out by pressing a button.
        actor={actor.role === 'admin' ? actor.label : `${actor.label} · vaatleja`}
        items={[
          { href: '/tellija', label: 'Töölaud', count: closedCount },
          { href: '/tellija/voorud', label: 'Voorud', count: openCount },
          { href: '/tellija/koolitused', label: 'Koolitused' },
          { href: '/tellija/tellimused', label: 'Tellimused' },
          // The framework's own data is one admin screen [L-21]; the lot and
          // partner lists stay for reading.
          ...(actor.role === 'admin' ? [{ href: '/tellija/raamhange', label: 'Raamhange' }] : []),
          { href: '/tellija/hankeosad', label: 'Hankeosad' },
          { href: '/tellija/partnerid', label: 'Partnerid' },
          { href: '/tellija/partnerid/esindajad', label: 'Esindajad' },
          { href: '/tellija/teavitused', label: 'Teavitused' },
          { href: '/tellija/auditilogi', label: 'Auditilogi' },
          { href: '/tellija/meeskond', label: 'Meeskond' },
          ...(leftoverCount > 0
            ? [{ href: '/tellija?jaak=1', label: `Jääk ${leftoverCount}`, alert: true }]
            : []),
        ]}
      />
      <main className="mx-auto max-w-[1600px] px-5 py-6 pb-16">{children}</main>
    </>
  );
}
