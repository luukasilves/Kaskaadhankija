/**
 * `/juhend` — the guide for the framework agreement's partners [R-02].
 *
 * **Public on purpose.** A bidder needs this before their first sign-in, when
 * all they hold is a notice and a code, so the page takes no session: it lives
 * outside `src/app/partner/`, whose layout calls `requirePartner()`.
 *
 * This file is layout only. Every word is in `src/domain/juhend.ts`, where it
 * is reviewable in a diff and covered by `juhend.test.ts` — the same split
 * `round-templates.ts` uses for the notices that go to the same people.
 *
 * `force-dynamic` is load-bearing, not stylistic: prerendered, `isDemoMode`
 * would be read at **build** time with `DEMO_MODE` unset, and the passages that
 * say „this is a test environment, nothing here binds you“ would be missing
 * from the deployed pilot and present nowhere.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { isDemoMode } from '@/lib/env';
import {
  AJATELG,
  KASKAAD,
  KASKAAD_PIIRMAAR,
  OLEKU_SILDID as LEGEND,
  PEALKIRI,
  SECTIONS,
  SISSEJUHATUS,
  type Block,
} from '@/domain/juhend';
import { FIGURES } from './figures';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `${PEALKIRI} — Kaskaadhankija`,
  description: SISSEJUHATUS,
  // The root layout already sets this for the whole app, restated here as a
  // decision rather than an inheritance: this page names the framework, the
  // buyer and the procedure, and during the pilot it should not be findable.
  // At go-live a public guide may well want the opposite — decide it then.
  robots: { index: false, follow: false },
};

/* ------------------------------------------------------------------ *
 * inline emphasis
 * ------------------------------------------------------------------ */

/**
 * `**…**` and nothing else.
 *
 * One convention rather than a Markdown dependency: the guide needs bold for
 * the handful of sentences a hurried reader must not skip, and nothing more.
 */
function Rikas({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <strong key={i}>{part.slice(2, -2)}</strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * diagram 1 — the cascade [N-03][J-04]
 * ------------------------------------------------------------------ *
 *
 * A table, not an SVG: it is a grid of words, it reflows on a phone, it prints,
 * and a screen reader can read it — none of which an SVG of the same thing
 * manages. What it shows that no screenshot can is *why* a training reads one
 * way for one rank and another way for the next, because it puts all three
 * ranks' views side by side. A partner never sees this: it is the mechanism,
 * drawn from the specification's own worked example.
 */
function Kaskaad() {
  return (
    <figure className="kh-card my-5 overflow-x-auto p-4">
      <figcaption className="mb-3 text-[13px]">
        <strong>Kuidas jaotus tekib.</strong> Kuus koolitust, kolm partnerit. Koht 1 on märkinud
        neli koolitust, aga seadnud ülempiiri {KASKAAD_PIIRMAAR.vaartus} — nii liiguvad ülejäänud
        märked allapoole. Nii näeb seda välja igaüks omaette; teiste veerge te kunagi ei näe.
      </figcaption>
      <table className="w-full text-[12.5px]">
        <thead>
          <tr>
            <th className="kh-th">Koolitus</th>
            {([1, 2, 3] as const).map((koht) => (
              <th key={koht} className="kh-th">
                Koht {koht}
                {koht === KASKAAD_PIIRMAAR.koht ? ` (ülempiir ${KASKAAD_PIIRMAAR.vaartus})` : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {KASKAAD.map((rida) => (
            <tr key={rida.kood}>
              <td className="kh-td whitespace-nowrap font-mono text-[12px]">
                {rida.kood}
                <span className="ml-2 font-sans text-[var(--color-muted)]">{rida.toimub}</span>
              </td>
              {rida.kohad.map((lahter) => (
                <td
                  key={lahter.koht}
                  className="kh-td align-top"
                  style={
                    lahter.sai
                      ? { background: 'var(--color-success-soft)', color: 'var(--color-success)' }
                      : undefined
                  }
                >
                  <span className="block">
                    {lahter.margitud ? 'märkis' : '—'}
                    {lahter.sai ? ' · sai' : ''}
                  </span>
                  <span className="block text-[11.5px] text-[var(--color-muted)]">
                    {LEGEND[lahter.olek]}
                    {lahter.pohjus === 'over_cap' ? ' (üle piirmäära)' : ''}
                    {lahter.pohjus === 'higher_partner' ? ' (eesõigusega partner)' : ''}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-[12px] text-[var(--color-muted)]">
        Rohelisel taustal on see, mille iga partner lõpuks sai. Ükski koolitus ei jäänud
        jaotamata. Näide pärineb raamlepingu äriloogika dokumendi lisast B.
      </p>
    </figure>
  );
}

/* ------------------------------------------------------------------ *
 * diagram 2 — one round's course
 * ------------------------------------------------------------------ */

const KES_SILT = { tellija: 'Tellija', teie: 'Teie', susteem: 'Süsteem' } as const;

function Ajatelg() {
  return (
    <figure className="kh-card my-5 p-4">
      <figcaption className="mb-3 text-[13px]">
        <strong>Ühe vooru kulg.</strong> Kes mida teeb ja millal.
      </figcaption>
      <ol className="space-y-2">
        {AJATELG.map((samm, i) => (
          <li key={samm.samm} className="flex gap-3">
            <span
              aria-hidden
              className="mt-[2px] flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold"
              style={{ background: 'var(--color-surface-alt)', border: '1px solid var(--color-border)' }}
            >
              {i + 1}
            </span>
            <span className="text-[13px]">
              <strong>{samm.samm}</strong>
              <span className="ml-2 kh-badge" style={{ background: 'var(--color-surface-alt)' }}>
                {KES_SILT[samm.kes]}
              </span>
              <span className="mt-0.5 block text-[var(--color-muted)]">{samm.tekst}</span>
            </span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

/* ------------------------------------------------------------------ *
 * blocks
 * ------------------------------------------------------------------ */

function Plokk({ block }: { block: Block }) {
  switch (block.kind) {
    case 'para':
      return (
        <p>
          <Rikas text={block.text} />
        </p>
      );

    case 'list':
      return (
        <ul>
          {block.items.map((item, i) => (
            <li key={i}>
              <Rikas text={item} />
            </li>
          ))}
        </ul>
      );

    case 'steps':
      return (
        <ol>
          {block.items.map((item, i) => (
            <li key={i}>
              <Rikas text={item} />
            </li>
          ))}
        </ol>
      );

    case 'note': {
      const warn = block.tone === 'warning';
      return (
        <aside
          className="kh-card my-4 p-4"
          style={{
            borderColor: warn ? 'var(--color-warning)' : 'var(--color-border-strong)',
            borderWidth: warn ? 2 : 1,
            background: warn ? 'var(--color-warning-soft)' : 'var(--color-surface-alt)',
          }}
        >
          <strong className="block text-[14px]">{block.title}</strong>
          <span className="mt-1 block text-[13.5px]">
            <Rikas text={block.text} />
          </span>
        </aside>
      );
    }

    case 'figure': {
      const pilt = FIGURES[block.id];
      return (
        <figure className="my-5">
          {/* A plain <img>: there is no `sharp` in this project, so the
              optimizer `next/image` needs would throw in production. The
              intrinsic size comes from the import, which keeps the aspect
              ratio without a layout shift. */}
          <img
            src={pilt.src}
            width={pilt.width}
            height={pilt.height}
            alt={block.caption}
            className="w-full rounded-md"
            style={{ border: '1px solid var(--color-border)' }}
          />
          <figcaption className="mt-2 text-[12.5px] text-[var(--color-muted)]">
            {block.caption}
          </figcaption>
        </figure>
      );
    }

    case 'diagram':
      return block.id === 'kaskaad' ? <Kaskaad /> : <Ajatelg />;
  }
}

/* ------------------------------------------------------------------ *
 * the page
 * ------------------------------------------------------------------ */

export default function JuhendPage() {
  // Pilot passages are gated rather than deleted, so a go-live deployment
  // (DEMO_MODE unset) cannot show a reader a caveat that no longer holds.
  const sections = SECTIONS.filter((section) => !section.pilotOnly || isDemoMode);

  return (
    <main className="kh-juhend mx-auto max-w-[860px] px-5 py-8 pb-16">
      <div className="kh-no-print mb-6 flex flex-wrap items-center justify-between gap-3 text-[13px]">
        <Link href="/sisene" className="kh-btn kh-btn-primary" data-testid="juhend-sisene">
          Logi sisse
        </Link>
        <span className="text-[var(--color-muted)]">
          Trükkimiseks või salvestamiseks kasutage brauseri prindifunktsiooni (Ctrl/Cmd + P).
        </span>
      </div>

      <header data-testid="juhend">
        <h1 className="text-[26px]">{PEALKIRI}</h1>
        <p className="mt-2 max-w-[70ch] text-[14px] text-[var(--color-muted)]">{SISSEJUHATUS}</p>
      </header>

      <nav className="kh-card kh-no-print my-6 p-4" aria-label="Sisukord">
        <strong className="text-[13px]">Sisukord</strong>
        <ol className="mt-2 grid gap-1 text-[13px] sm:grid-cols-2">
          {sections.map((section) => (
            <li key={section.id}>
              <a href={`#${section.id}`} className="text-[var(--color-brand)]">
                {section.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {sections.map((section) => (
        <section key={section.id} id={section.id} className="mt-8 scroll-mt-4">
          <h2 className="text-[19px]">{section.title}</h2>
          {section.blocks.map((block, i) => (
            <Plokk key={i} block={block} />
          ))}
        </section>
      ))}

      <footer className="mt-10 border-t pt-4 text-[12.5px] text-[var(--color-muted)]" style={{ borderColor: 'var(--color-border)' }}>
        Kaskaadhankija · raamleping „Eesti.ai koolitajate tellimine“ (RHR 10567384). Piltidel on
        näidisandmed ja väljamõeldud partnerid; kuupäevad ja kellaajad on näited.
      </footer>
    </main>
  );
}
