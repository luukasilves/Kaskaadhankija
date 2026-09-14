# Job brief — Juhend koolitajale (`/juhend`)

Filled once, before drafting, per the `en-et-translation` skill's
`references/job-brief.md`. It locks the blanket defaults so the forced-choice
pass never re-raises them sentence by sentence.

Note the unusual shape of this job: there is **no English source**. The guide is
authored natively in Estonian from an Estonian corpus (the spec and the app's
own texts), so the skill's Mode A collapses to *draft → forced-choice
self-review → source-blind monolingual edit → fidelity check against the spec*.
See "Quality bar" below for what replaces the back-translation.

- **Source / Target language:** — / ET (original composition, not translation)
- **Audience:** the contractual representatives of the framework agreement's
  partners — companies that already hold the agreement, not applicants and not
  consumers. Assume a competent professional who has never seen this tool and
  will not read twice.
- **Purpose (skopos):** the reader answers their first round correctly, alone,
  without asking the buyer. Specifically: they confirm rather than leave a
  draft, and they understand why they can see that *somebody* above them marked
  a training without seeing who.
- **Genre / register:** public-administration Estonian, semi-formal,
  **instructional** — not normative. The spec says `peab kuvama`; the guide says
  `vajutage`. Match `src/domain/round-templates.ts`, not the spec's voice.
- **Address (sina/teie):** **teie.** Settled by the corpus, not chosen: every
  bidder-facing surface in the app is *teie* (`Teie osalus`, `Teie kinnitus`,
  `Te ei ole veel vastanud`, `olete kohustatud`, `Saate oma valikut muuta`),
  while internal buyer-team text is *sina* (`Sul on hankija roll`). The skill's
  precedence rule puts the client corpus above the base layer, and here the base
  layer agrees — institutional and public means *teie*.
- **Formality:** high-neutral. `Lugupeetud` is the notices' opening and sets the
  ceiling; the guide sits just below it, because it explains rather than notifies.
- **Gender / inclusive:** Estonian is gender-neutral here throughout. Avoid
  gendered role nouns; `esindaja`, `kontaktisik`, `koolitaja` are all neutral.
- **Future reference:** present tense. Estonian has no future tense and the
  corpus never reaches for a periphrasis: `voor sulgub`, `jaotuse kinnitame`.
- **Medium / format:** a public HTML page (`/juhend`), authored as a typed
  module in `src/domain/juhend.ts`. Printable through the browser; no `.docx`
  harness, so the skill's XML path does not apply.
- **House term choices:** see `glossary/term_preferences.tsv`. The load-bearing
  one: the reader is a **`raamlepingu partner`**, never a `hankija` — in this
  app `hankija` is a *buyer* role [R-01].
- **Do-not-translate:** see `glossary/do_not_translate.txt`.
- **Reference corpus**, ranked (see `glossary/style_exemplars.md`):
  1. `src/domain/round-templates.ts` — the **sibling document**: same audience,
     already *teie*, already reviewed by the procurement team. The voice anchor.
  2. `docs/kaskaadi-ariloogika.md` — 431 lines on this exact subject. The
     **terminology** anchor; its register is normative, so not the voice.
  3. `src/app/partner/**` — the on-screen voice, and the source of every label
     the guide quotes verbatim.
  4. `README.md` is **not** corpus: English, and written for developers.
- **Quality bar:** *reads native, publication.* This document goes to companies
  under a live framework agreement and states what is binding.
  **Fidelity is checked against the spec, not against an English source:** every
  procedural claim carries the rule tag it implements, and the check is that the
  claim and the rule agree. That is worth more here than a back-translation,
  which would only tell me whether my own English survived a round trip.
- **Notes:** written for the **test pilot**. The passages that say so are gated
  on `isDemoMode` and listed in `README.md` under what must go at go-live.
