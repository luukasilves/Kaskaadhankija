/**
 * Sign-in by e-mail code [L-08]: two plain forms, so the flow works without
 * JavaScript and reads the same in every browser a partner might have.
 */

import Link from 'next/link';
import { requestLoginCodeAction, verifyLoginCodeAction } from '@/server/actions/auth';

const REQUEST_ERRORS: Record<string, string> = {
  aadress: 'Sisesta korrektne e-posti aadress.',
};

const CODE_ERRORS: Record<string, string> = {
  wrong: 'Kood ei sobi. Kontrolli ja proovi uuesti.',
  expired: 'Kood on aegunud. Küsi uus kood.',
  no_code: 'Sellele aadressile ei ole kehtivat koodi. Küsi uus kood.',
  locked: 'Liiga palju valesid katseid — see kood ei kehti enam. Küsi uus kood.',
  subject_gone: 'Selle aadressiga ei saa enam sisse logida. Võta ühendust tellimismeeskonnaga.',
};

function ErrorLine({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      data-testid="sign-in-error"
      className="rounded-md border px-3 py-2 text-[13px] font-semibold"
      style={{ borderColor: 'var(--color-danger)', background: 'var(--color-danger-soft)', color: 'var(--color-danger)' }}
    >
      {message}
    </p>
  );
}

export function SignInRequestForm({
  email,
  error,
  adminDomains = [],
  allowlistSize = 0,
}: {
  email?: string;
  error?: string;
  /** whole domains that may sign in without being listed first, if any */
  adminDomains?: readonly string[];
  /** how many allowlist entries there are in all — addresses included */
  allowlistSize?: number;
}) {
  // `data-admin-allowlist` is what the deploy greps to prove the configured
  // allowlist actually reached the machine: a secret that silently failed to
  // arrive would otherwise look exactly like "nobody can sign in", with no
  // visible cause anywhere. It carries the **count**, not the entries — a
  // domain was fair to name in public, a named person's address is not, and the
  // count is all the deploy gate needs [L-08].
  return (
    <form
      action={requestLoginCodeAction}
      className="kh-card space-y-3 p-5"
      data-testid="sign-in-form"
      data-admin-allowlist={String(allowlistSize)}
    >
      <h1 className="text-[22px]">Logi sisse</h1>
      <p className="text-[13.5px] text-[var(--color-muted)]">
        Sisesta e-posti aadress, mis on partneri esindajate või tellimismeeskonna loendis
        {adminDomains.length > 0 ? ` või lõpeb ${adminDomains.join(' / ')}` : ''}. Saadame sellele
        kuuekohalise koodi, mis kehtib 10 minutit. Paroole ei ole.
      </p>
      <ErrorLine message={error ? REQUEST_ERRORS[error] : undefined} />
      <label className="block">
        <span className="text-[12.5px] font-semibold">E-post</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          autoFocus
          defaultValue={email ?? ''}
          className="kh-input mt-1 w-full"
          placeholder="nimi@ettevote.ee"
        />
      </label>
      <button type="submit" className="kh-btn kh-btn-primary">
        Saada kood
      </button>
      <p className="text-[12.5px] text-[var(--color-muted)]">
        Esimene kord siin?{' '}
        <a href="/juhend" className="text-[var(--color-brand)]" data-testid="sign-in-juhend">
          Juhend koolitajale
        </a>{' '}
        selgitab, kuidas voorule vastata.
      </p>
    </form>
  );
}

export function SignInCodeForm({ email, error }: { email: string; error?: string }) {
  return (
    <form action={verifyLoginCodeAction} className="kh-card space-y-3 p-5" data-testid="sign-in-code-form">
      <h1 className="text-[22px]">Sisesta kood</h1>
      <p className="text-[13.5px] text-[var(--color-muted)]">
        Kui aadress <strong className="font-mono">{email}</strong> on esindajate või tellimismeeskonna
        loendis, saatsime sellele kuuekohalise koodi. Kood kehtib 10 minutit ja ainult üks kord.
      </p>
      <ErrorLine message={error ? CODE_ERRORS[error] ?? 'Sisselogimine ebaõnnestus.' : undefined} />
      <input type="hidden" name="email" value={email} />
      <label className="block">
        <span className="text-[12.5px] font-semibold">Kood</span>
        <input
          type="text"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          required
          autoFocus
          className="kh-input mt-1 w-full font-mono text-[18px] tracking-[0.3em]"
          placeholder="123456"
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="kh-btn kh-btn-primary">
          Logi sisse
        </button>
        <Link href={`/sisene?e=${encodeURIComponent(email)}`} className="text-[13px] text-[var(--color-brand)]">
          Küsi uus kood
        </Link>
      </div>
    </form>
  );
}
