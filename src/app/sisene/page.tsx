/**
 * /sisene — the sign-in. Outside the test environment this is where `/` lands;
 * inside it, it sits beside the persona picker for whoever has a real address
 * on the representatives' or the team's list.
 */

import Link from 'next/link';
import { logoutAction } from '@/server/actions/auth';
import { getSessionActor } from '@/server/auth/actor';
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

  return (
    <main className="mx-auto max-w-md p-5 md:p-10">
      <div className="mb-4 text-[15px] font-bold tracking-tight">Kaskaadhankija</div>
      {signedIn ? (
        <section className="kh-card space-y-3 p-5" data-testid="signed-in-card">
          <h1 className="text-[22px]">Olete sisse logitud</h1>
          <p className="text-[13.5px]">
            <strong>{signedIn.label}</strong>
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href={signedIn.kind === 'buyer' ? '/tellija' : '/partner/voorud'} className="kh-btn kh-btn-primary">
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
