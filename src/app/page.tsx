/**
 * The opening screen.
 *
 * A tester lands here with no persona chosen and sees **none of the
 * environment** until they pick one — the buyer or one of the mock framework
 * partners. Each card carries a live status line, so it is obvious before
 * entering which persona has something interesting waiting: the rank-3 partner
 * with unconfirmed changes is the point of the seeded scenario.
 *
 * With DEMO_MODE off this is where real authentication will live; for now it
 * says so rather than pretending.
 */

import { redirect } from 'next/navigation';
import { formatDateTimeShort } from '@/domain/format';
import { isDemoMode } from '@/lib/env';
import { getActor } from '@/server/auth/actor';
import { choosePersona } from '@/server/actions/persona';
import { listPersonas, type PersonaCard } from '@/server/personas';

export const dynamic = 'force-dynamic';

function Card({ persona }: { persona: PersonaCard }) {
  const isBuyer = persona.kind === 'buyer';
  return (
    <form action={choosePersona}>
      <input type="hidden" name="persona" value={persona.key} />
      <button
        type="submit"
        className="kh-card block w-full cursor-pointer p-4 text-left transition hover:border-[var(--color-brand)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[15px] font-semibold">{persona.name}</div>
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

  // Already chosen — go straight to that persona's home.
  const actor = await getActor();
  if (actor) redirect(actor.kind === 'buyer' ? '/tellija' : '/partner/voorud');

  const roster = listPersonas();

  return (
    <main className="mx-auto max-w-[1100px] p-6 md:p-10">
      <header className="mb-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1>Kaskaadhankija</h1>
          <span className="kh-badge border border-[var(--color-demo)] bg-[var(--color-demo-soft)] text-[var(--color-demo)]">
            TESTKESKKOND
          </span>
        </div>
        <p className="mt-3 max-w-[70ch] text-[var(--color-muted)]">
          Kaskaad-minihangete keskkond raamlepingu „Eesti.ai koolitajate tellimine“ (riigihanke
          viitenumber 10567384) alusel. Kogu kaskaadiloogika, vastamistähtaegade arvutus ja
          auditijälg töötavad päriselt. <strong>Andmed on väljamõeldud</strong> ja aega saab
          testimiseks edasi kerida, seega kirjades ja logides olevad kellaajad järgivad näidise
          kella, mitte tegelikku aega.
        </p>
        <p className="mt-3 text-[var(--color-muted)]">
          Vali persoon, kelle vaates keskkonda vaadata. Persooni saab hiljem ülemiselt ribalt
          vahetada.
        </p>
        <p className="mt-2 text-[12.5px] text-[var(--color-muted)]">
          Näidise aeg: <strong className="tabular-nums">{formatDateTimeShort(roster.nowMs)}</strong>
        </p>
      </header>

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
              <Card key={persona.key} persona={persona} />
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
              <Card key={persona.key} persona={persona} />
            ))}
          </div>
        </section>
      )}

      <footer className="mt-10 border-t border-[var(--color-border)] pt-4 text-[12px] text-[var(--color-muted)]">
        Äriloogika on kirjeldatud failis <code>docs/kaskaadi-ariloogika.md</code>. Iga reegel kannab
        tunnust (nt <code>[J-04]</code>), millele viitavad ka kood ja automaattestid.
      </footer>
    </main>
  );
}
