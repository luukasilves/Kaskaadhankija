/**
 * The opening screen.
 *
 * A tester lands here and sees **none of the environment** until they pick a
 * persona — the buyer or one of the mock framework partners. Each card carries
 * a live status line, so it is obvious before entering which persona has
 * something interesting waiting: the rank-3 partner with unconfirmed changes is
 * the point of the seeded scenario.
 *
 * This page deliberately does **not** redirect a tester who already has a
 * persona. It used to, which made the whole screen a once-per-browser event:
 * the cookie lasts 30 days, so on every later visit the most informative page
 * in the demo — who is waiting on what — was skipped, and there was no way back
 * to it short of wiping the sample data. A returning tester gets a "continue"
 * shortcut at the top instead, which costs one tap and keeps the choice.
 *
 * The ordering matters on a phone: the choices come directly under a one-line
 * instruction, and the explanation of what this environment is sits *below*
 * them. With the prose first, the first card landed at 563px on a 390px screen
 * — under the browser chrome, so the page read as having no choices at all.
 *
 * With DEMO_MODE off this is where real authentication will live; for now it
 * says so rather than pretending.
 */

import Link from 'next/link';
import { formatDateTimeShort } from '@/domain/format';
import { isDemoMode } from '@/lib/env';
import { getActor } from '@/server/auth/actor';
import { choosePersona } from '@/server/actions/persona';
import { listPersonas, type PersonaCard } from '@/server/personas';

export const dynamic = 'force-dynamic';

function Card({ persona, isCurrent }: { persona: PersonaCard; isCurrent: boolean }) {
  const isBuyer = persona.kind === 'buyer';
  return (
    <form action={choosePersona}>
      <input type="hidden" name="persona" value={persona.key} />
      <button
        type="submit"
        data-testid="persona-card"
        className="kh-card block w-full cursor-pointer p-4 text-left transition hover:border-[var(--color-brand)]"
        style={isCurrent ? { borderColor: 'var(--color-brand)', borderWidth: 2 } : undefined}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[15px] font-semibold">
              {persona.name}
              {isCurrent && (
                <span className="ml-2 text-[11px] font-semibold text-[var(--color-brand)]">
                  praegu valitud
                </span>
              )}
            </div>
            <div className="text-[var(--color-muted)]">{persona.subtitle}</div>
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

        {persona.chips.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {persona.chips.map((chip) => (
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
          {persona.statusLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </button>
    </form>
  );
}

export default async function OpeningScreen() {
  if (!isDemoMode) {
    return (
      <main className="mx-auto max-w-2xl p-10">
        <h1>Kaskaadhankija</h1>
        <p className="mt-3 text-[var(--color-muted)]">
          Sisselogimine seadistatakse. Testkeskkonna persoonivalik on saadaval ainult
          näidiskeskkonnas.
        </p>
      </main>
    );
  }

  // Deliberately no redirect for an existing persona — see the note above.
  const actor = await getActor();
  const currentKey = actor
    ? actor.kind === 'buyer'
      ? `buyer:${actor.userId}`
      : `partner:${actor.partnerId}`
    : null;
  const currentHome = actor?.kind === 'buyer' ? '/tellija' : '/partner/voorud';

  const roster = listPersonas();

  return (
    <main
      data-testid="intro-screen"
      className="mx-auto flex min-h-screen max-w-[1100px] flex-col justify-center p-5 md:p-10"
    >
      {/* The gate. No strip, no navigation, nothing of the environment until a
          persona is chosen — and compact enough that the choices themselves are
          the first thing on the screen, phone included. */}
      <header className="mb-5">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-[26px]">Kaskaadhankija</h1>
          <span className="kh-badge border border-[var(--color-demo)] bg-[var(--color-demo-soft)] text-[var(--color-demo)]">
            TESTKESKKOND
          </span>
        </div>
        <p className="mt-2 text-[15px]">
          <strong>Vali persoon</strong>, kelle vaates keskkonda vaadata.
        </p>
        <p className="mt-1 text-[13px] text-[var(--color-muted)]">
          Kaskaad-minihangete näidiskeskkond raamlepingu „Eesti.ai koolitajate tellimine“ alusel.
          Andmed on väljamõeldud. Näidise aeg{' '}
          <strong className="tabular-nums">{formatDateTimeShort(roster.nowMs)}</strong>.
        </p>
      </header>

      {actor && (
        <div
          data-testid="continue-band"
          className="mb-5 flex flex-wrap items-center gap-3 rounded-[10px] border p-3"
          style={{ borderColor: 'var(--color-brand)', background: 'var(--color-brand-soft)' }}
        >
          <span className="text-[13px]">
            Olid siin{' '}
            <strong>
              {actor.kind === 'buyer' ? actor.name : actor.partnerName}
            </strong>
            {actor.kind === 'buyer' ? ' (tellija)' : ' (partner)'}.
          </span>
          <Link href={currentHome} className="kh-btn kh-btn-primary" data-testid="continue-link">
            Jätka
          </Link>
          <span className="text-[12px] text-[var(--color-muted)]">
            või vali allpool mõni teine persoon
          </span>
        </div>
      )}

      {roster.buyers.length === 0 && roster.partners.length === 0 && (
        <div className="kh-card p-6 text-[var(--color-muted)]">
          Näidisandmeid ei ole veel laaditud. Käivita <code>pnpm db:seed</code>.
        </div>
      )}

      {roster.buyers.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3">Tellija</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {roster.buyers.map((persona) => (
              <Card key={persona.key} persona={persona} isCurrent={persona.key === currentKey} />
            ))}
          </div>
        </section>
      )}

      {roster.partners.length > 0 && (
        <section>
          <h2 className="mb-1">Raamlepingu partnerid</h2>
          <p className="mb-3 text-[12.5px] text-[var(--color-muted)]">
            Väljamõeldud ettevõtted. Iga partneri juures on tema koht hankeosade järjestuses —
            koht 1 tähendab eesõigust.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {roster.partners.map((persona) => (
              <Card key={persona.key} persona={persona} isCurrent={persona.key === currentKey} />
            ))}
          </div>
        </section>
      )}

      <details className="mt-8 border-t border-[var(--color-border)] pt-5">
        <summary className="cursor-pointer font-semibold">Mis keskkond see on?</summary>
        <p className="mt-2 max-w-[70ch] text-[var(--color-muted)]">
          Kaskaad-minihangete keskkond raamlepingu „Eesti.ai koolitajate tellimine“ (riigihanke
          viitenumber 10567384) alusel. Kogu kaskaadiloogika, vastamistähtaegade arvutus ja
          auditijälg töötavad päriselt. <strong>Andmed on väljamõeldud</strong> ja aega saab
          testimiseks edasi kerida, seega kirjades ja logides olevad kellaajad järgivad näidise
          kella, mitte tegelikku aega.
        </p>
        <p className="mt-3 max-w-[70ch] text-[var(--color-muted)]">
          Keskkond töötab <strong>ühe ühise andmebaasi peal</strong>: kõik, kes lingi avavad, näevad
          ja muudavad sama seisu. Persoon on iga brauseri oma, seega mitmekesi katsetades saab
          igaüks olla eri partner — kuid kella kerimine ja näidisandmete lähtestamine mõjuvad
          kõigile korraga. Pärast persoona valimist saab seda ülemiselt ribalt vahetada — nupp
          „Vaheta persooni“ toob siia lehele tagasi.
        </p>
      </details>

      <footer className="mt-8 border-t border-[var(--color-border)] pt-4 text-[12px] text-[var(--color-muted)]">
        Äriloogika on kirjeldatud failis <code>docs/kaskaadi-ariloogika.md</code>. Iga reegel kannab
        tunnust (nt <code>[J-04]</code>), millele viitavad ka kood ja automaattestid.
      </footer>
    </main>
  );
}
