/**
 * /sisene — the sign-in, and the front door in both environments: nobody sees a
 * participant's view without proving a mailbox first [L-08]. In the test
 * environment an admin lands from here on the act-as screen; everyone else
 * lands in their own area.
 */

import Link from 'next/link';
import { isDemoMode } from '@/lib/env';
import { logoutAction } from '@/server/actions/auth';
import { getSessionActor } from '@/server/auth/actor';
import { landingAfterSignIn } from '@/server/auth/identity';
import { autoAdminDomains } from '@/server/auth/codes';
import { SignInRequestForm } from '@/components/sign-in';

export const dynamic = 'force-dynamic';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ viga?: string; e?: string }>;
}) {
  const { viga, e } = await searchParams;
  const signedIn = await getSessionActor();

  const landing = signedIn
    ? landingAfterSignIn(
        signedIn.kind === 'buyer'
          ? { kind: 'buyer', role: signedIn.role }
          : { kind: 'partner' },
        isDemoMode,
      )
    : '/';

  return (
    <main className="mx-auto max-w-md p-5 md:p-10">
      <div className="mb-4 flex flex-wrap items-baseline gap-3">
        <span className="text-[15px] font-bold tracking-tight">Kaskaadhankija</span>
        {/* The one place the test environment names itself before sign-in — the
            deploy's smoke test reads it here, now that `/` is behind the door. */}
        {isDemoMode && (
          <span className="kh-badge border border-[var(--color-demo)] bg-[var(--color-demo-soft)] text-[var(--color-demo)]">
            TESTKESKKOND
          </span>
        )}
      </div>
      {signedIn ? (
        <section className="kh-card space-y-3 p-5" data-testid="signed-in-card">
          <h1 className="text-[22px]">Olete sisse logitud</h1>
          <p className="text-[13.5px]">
            <strong>{signedIn.label}</strong>
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href={landing} className="kh-btn kh-btn-primary">
              Jätka
            </Link>
            <form action={logoutAction}>
              <button type="submit" className="kh-btn">
                Logi välja
              </button>
            </form>
          </div>
        </section>
      ) : (
        <SignInRequestForm email={e} error={viga} adminDomains={autoAdminDomains()} />
      )}
    </main>
  );
}
