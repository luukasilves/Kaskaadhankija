/**
 * „Kellena tegutseda“ — the test environment's act-as screen.
 *
 * Reached only by a signed-in buyer admin, and reached after **every** sign-in,
 * because the act-as cookie is dropped at verification. Everyone else is sent
 * straight to their own area; anyone without a session is sent to the sign-in.
 *
 * The session stays open while acting as somebody else, so this screen is not a
 * login: it is a lens. The strip above the areas says whose view is on screen
 * and whose session is behind it, and every write records both [L-08].
 *
 * The ordering matters on a phone: the choices come directly under a one-line
 * instruction, and the explanation of what this environment is sits *below*
 * them. With the prose first, the first card landed at 563px on a 390px screen
 * — under the browser chrome, so the page read as having no choices at all.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isDemoMode } from '@/lib/env';
import { getDb } from '@/db';
import { frameworkClause } from '@/domain/framework';
import { frameworkIdentity } from '@/server/framework';
import { actAs, actAsSelf } from '@/server/actions/act-as';
import { logoutAction } from '@/server/actions/auth';
import { listActAsRoster, type ActAsCard } from '@/server/act-as';
import { resolveIdentity } from '@/server/auth/actor';
import { areaHome, mayActAs } from '@/server/auth/identity';

export const dynamic = 'force-dynamic';

function Card({
  participant,
  isCurrent,
  isSelf,
}: {
  participant: ActAsCard;
  isCurrent: boolean;
  isSelf: boolean;
}) {
  const isBuyer = participant.kind === 'buyer';
  return (
    <form action={actAs}>
      <input type="hidden" name="persona" value={participant.key} />
      <button
        type="submit"
        data-testid="act-as-card"
        className="kh-card block w-full cursor-pointer p-4 text-left transition hover:border-[var(--color-brand)]"
        style={isCurrent ? { borderColor: 'var(--color-brand)', borderWidth: 2 } : undefined}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[15px] font-semibold">
              {participant.name}
              {isSelf && (
                <span className="ml-2 text-[11px] font-semibold text-[var(--color-muted)]">
                  (sina)
                </span>
              )}
              {isCurrent && (
                <span className="ml-2 text-[11px] font-semibold text-[var(--color-brand)]">
                  praegu valitud
                </span>
              )}
            </div>
            <div className="text-[var(--color-muted)]">{participant.subtitle}</div>
          </div>
          <span
            className="kh-badge"
            style={{
              background: isBuyer ? 'var(--color-brand-soft)' : 'var(--color-neutral-soft)',
              color: isBuyer ? 'var(--color-brand)' : 'var(--color-neutral)',
            }}
          >
            {isBuyer ? 'Tellija' : 'Partner'}
          </span>
        </div>

        {participant.chips.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {participant.chips.map((chip) => (
              <span
                key={chip}
                className="kh-badge bg-[var(--color-neutral-soft)] text-[var(--color-neutral)]"
              >
                {chip}
              </span>
            ))}
          </div>
        )}

        <ul className="mt-3 space-y-0.5 text-[12.5px] text-[var(--color-muted)]">
          {participant.statusLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </button>
    </form>
  );
}

export default async function ActAsScreen() {
  // Outside the test environment nobody acts as anybody: the front door is the
  // sign-in, and it is also where this address lands.
  if (!isDemoMode) redirect('/sisene');

  const { signedIn, acting, actingKey } = await resolveIdentity();
  if (!signedIn) redirect('/sisene');
  // A member or a representative has exactly one identity — their own.
  if (!mayActAs(signedIn, isDemoMode)) redirect(areaHome(signedIn.kind));

  const roster = listActAsRoster();
  const framework = frameworkIdentity(getDb());
  const selfKey = `buyer:${signedIn.userId}`;

  return (
    <main
      data-testid="act-as-screen"
      className="mx-auto flex min-h-screen max-w-[1100px] flex-col justify-center p-5 md:p-10"
    >
      <header className="mb-5">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-[26px]">Kaskaadhankija</h1>
          <span className="kh-badge border border-[var(--color-demo)] bg-[var(--color-demo-soft)] text-[var(--color-demo)]">
            TESTKESKKOND
          </span>
        </div>
        <p className="mt-2 text-[15px]">
          <strong>Kellena tegutseda?</strong> Vali osaleja, kelle vaates keskkonda vaadata.
        </p>
        <p className="mt-1 text-[13px] text-[var(--color-muted)]">
          Sinu sessioon jääb kehtima — toimingud salvestatakse valitud osaleja nimel ja
          auditijälge märgitakse ka sinu nimi.
        </p>
      </header>

      <div
        data-testid="self-band"
        className="mb-5 flex flex-wrap items-center gap-3 rounded-[10px] border border-[var(--color-border)] p-3"
      >
        <span className="text-[13px]">
          Sisse logitud: <strong>{signedIn.name}</strong> (admin)
        </span>
        <form action={actAsSelf}>
          <button type="submit" className="kh-btn kh-btn-primary" data-testid="continue-self">
            Jätka enda nimel
          </button>
        </form>
        <form action={logoutAction}>
          <button type="submit" className="kh-btn" data-testid="sign-out">
            Logi välja
          </button>
        </form>
      </div>

      {actingKey && acting && (
        <div
          data-testid="continue-band"
          className="mb-5 flex flex-wrap items-center gap-3 rounded-[10px] border p-3"
          style={{ borderColor: 'var(--color-brand)', background: 'var(--color-brand-soft)' }}
        >
          <span className="text-[13px]">
            Tegutsed kui <strong>{acting.kind === 'buyer' ? acting.name : acting.partnerName}</strong>
            {acting.kind === 'buyer' ? ' (tellija)' : ' (partner)'}.
          </span>
          <Link
            href={areaHome(acting.kind)}
            className="kh-btn kh-btn-primary"
            data-testid="continue-link"
          >
            Jätka
          </Link>
          <span className="text-[12px] text-[var(--color-muted)]">
            või vali allpool mõni teine osaleja
          </span>
        </div>
      )}

      {roster.buyers.length === 0 && roster.partners.length === 0 && (
        <div data-testid="no-framework-data" className="kh-card p-6 text-[var(--color-muted)]">
          Raamhanke andmeid ei ole veel laaditud.{' '}
          <Link href="/tellija" className="font-semibold text-[var(--color-brand)]">
            Ava tellija töölaud
          </Link>{' '}
          ja laadi raamhanke andmed üles — osalejad tekivad sellest failist.
        </div>
      )}

      {roster.buyers.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3">Tellimismeeskond</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {roster.buyers.map((participant) => (
              <Card
                key={participant.key}
                participant={participant}
                isCurrent={participant.key === actingKey}
                isSelf={participant.key === selfKey}
              />
            ))}
          </div>
        </section>
      )}

      {roster.partners.length > 0 && (
        <section>
          <h2 className="mb-1">Raamlepingu partnerid</h2>
          <p className="mb-3 text-[12.5px] text-[var(--color-muted)]">
            Iga partneri juures on tema koht hankeosade järjestuses — koht 1 tähendab eesõigust.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {roster.partners.map((participant) => (
              <Card
                key={participant.key}
                participant={participant}
                isCurrent={participant.key === actingKey}
                isSelf={false}
              />
            ))}
          </div>
        </section>
      )}

      <details className="mt-8 border-t border-[var(--color-border)] pt-5">
        <summary className="cursor-pointer font-semibold">Mis keskkond see on?</summary>
        <p className="mt-2 max-w-[70ch] text-[var(--color-muted)]">
          Kaskaad-minihangete keskkond, mille alus on {frameworkClause(framework)}. Kogu
          kaskaadiloogika, vastamistähtaegade arvutus, e-kirjad
          ja auditijälg töötavad päriselt ja <strong>päris ajas</strong>: katsetamiseks tehtud vooru
          vastamisaken pannakse lühikeseks vooru skeemifailis.
        </p>
        <p className="mt-3 max-w-[70ch] text-[var(--color-muted)]">
          Osalejad — tellimismeeskond ja raamlepingu partnerid — tulevad üleslaaditud raamhanke
          andmetest. Keskkond töötab <strong>ühe ühise andmebaasi peal</strong>: kõik, kes lingi
          avavad, näevad ja muudavad sama seisu. Igaüks logib sisse oma e-posti aadressiga; ainult
          tellija admin saab valida, kelle vaates keskkonda vaadata.
        </p>
      </details>

      <footer className="mt-8 border-t border-[var(--color-border)] pt-4 text-[12px] text-[var(--color-muted)]">
        Äriloogika on kirjeldatud failis <code>docs/kaskaadi-ariloogika.md</code>. Iga reegel kannab
        tunnust (nt <code>[J-04]</code>), millele viitavad ka kood ja automaattestid.
      </footer>
    </main>
  );
}
