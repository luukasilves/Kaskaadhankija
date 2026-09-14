# docs/

## `kaskaadi-ariloogika.md` — the business-logic specification (Estonian)

This is the **source of truth for how Kaskaadhankija behaves**. It is written in
Estonian so the procurement specialists can edit it directly.

Every rule carries a stable ID such as `[J-04]`. Code, tests and UI copy refer to
rules by ID — e.g. `describe('[J-04] range järjestus', …)` — so a change to the
document is the contract for a change to the application:

1. Edit the rule in the spec (or add a new one; never renumber).
2. Record the change in the *Muudatuste logi* at the end.
3. The build session implements it and updates the tests named after the rule.

Decisions that could reasonably have gone another way are recorded in section
**L** with the chosen option, the alternatives and their status. Items marked as
awaiting legal or specialist review are **L-01, L-05, L-07, L-10**.

Section **Lisa A** maps verbatim quotes from the specialists' meeting to the rules
they justify; **Lisa B** is a worked example that doubles as an acceptance test
for the allocation algorithm and the four partner-facing display states.

## `tehniline-ulevaade.md` — how the system works (Estonian, English summary)

Architecture, data model, round lifecycle, identity, mail, documents, audit trail and
evidence, personal data and retention, configuration, quality control, limits. For the
technical teams that will host and integrate the application.

## `juurutamine.md` — deployment guide (Estonian, English summary)

Requirements on one page, recommended topology for a private or hybrid cloud, image
build, production configuration and secrets, step-by-step mail-server wiring, first
boot, operations (health, logs, backup, upgrades), security, go-live checklist.

## `uuendused-2026-09-13.md` — what changed after the first play-through (Estonian)

A changelog for the review team: v2.5 → v2.7 by area, what to check before the next
play-through, and the decisions the team still owes.

## Independent review and Estonia CFR assessment — 14 September 2026

An independent assessment by **OpenAI Codex using GPT-6 Astra (`gpt-6-astra`)**,
reviewing commit `65d2792b01f5f6d90691443af4ce11d260551fd0`. English, with the
original Estonian CFR rules retained in the matrix. This records the project at
the review date; it does not assert that findings have since been resolved.

- [Independent review](reviews/2026-09-14/independent-review.md): project state,
  reproduced findings, government handover gaps and recommended acceptance sequence.
- [CFR workbook](reviews/2026-09-14/cfr-matrix.xlsx) and
  [CSV matrix](reviews/2026-09-14/cfr-matrix.csv): all 67 requirements, original
  source levels, evidence, next actions and proposed accountable roles.
- [Evidence summary](reviews/2026-09-14/evidence-summary.md): execution results,
  independent reproductions and the limits of the assessment.

## `juhend/` — the bidder guide's working files

The guide itself is a page in the application (`/juhend`, content in
`src/domain/juhend.ts`); this folder holds what was needed to write it in
publication-quality Estonian, following the `en-et-translation` skill's method:

- **`job-brief.md`** — the blanket decisions, settled once: audience, purpose,
  register, and the address (*teie*, which the app's own partner-facing text
  already chose).
- **`glossary/`** — the asset layers mined from this project's own Estonian:
  attested phrasings (`phrase_anchors.tsv`), PREFER/AVOID pairs
  (`term_preferences.tsv`), the enforceable rules (`locked_decisions.txt`), two
  register exemplars, and the do-not-translate list.
- **`decision-register.tsv`** — the forced choices Estonian grammar imposed,
  with what was chosen and why.
- **`query-sheet.md`** — **what is left for a person to decide.** Read this one:
  item 1 is a blocker for the pilot, and items 2–4 are inconsistencies in the
  application that the guide exposed rather than caused.
