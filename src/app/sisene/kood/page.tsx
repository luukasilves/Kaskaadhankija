import { redirect } from 'next/navigation';
import { SignInCodeForm } from '@/components/sign-in';

export const dynamic = 'force-dynamic';

export default async function SignInCodePage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; viga?: string }>;
}) {
  const { e, viga } = await searchParams;
  if (!e) redirect('/sisene');

  return (
    <main className="mx-auto max-w-md p-5 md:p-10">
      <div className="mb-4 text-[15px] font-bold tracking-tight">Kaskaadhankija</div>
      <SignInCodeForm email={e} error={viga} />
    </main>
  );
}
