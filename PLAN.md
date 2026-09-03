# Kaskaadhankija — plan (v2, parallel cascade)

## What this is

An online tool for running **cascade mini-procurements (kaskaad-minihanked)** — the
process for assigning individual training orders under the Estonian framework
procurement **"Eesti.ai koolitajate tellimine"** (Riigikantselei via RTK,
[RHR 10567384](https://riigihanked.riik.ee/rhr-web/#/procurement/10567384/general-info),
~€5M, framework agreements valid until 31.12.2027).

The eesti.ai programme aims to put 100,000+ working-age adults through an AI
workshop in 2026–2027. That is hundreds of individual orders, each of which has
to be offered to framework partners in their ranked order, with justifications
and an audit trail. By email and spreadsheet it is error-prone and hard to audit.

## The model, and why it changed

**v1 assumed a sequential cascade**: offer to rank 1, wait for the deadline,
cascade to rank 2 on a decline or a timeout. That is what the merged single-file
demo in [`demo/`](demo/) shows, and it is a legitimate mode — but it is not the
one the specialists described.

**v2 implements a parallel cascade.** One round goes to *every* active partner of
a lot at the same instant. During a window of about three working days each
partner marks the trainings it will take and confirms; at the deadline the
allocation is resolved strictly in framework rank order. Speed of response never
matters. While the window is open, a partner sees the *effect* of higher-ranked
partners' confirmed marks — never their identity — so it can plan around what is
realistically still available.

The business logic is specified, in Estonian, in
[`docs/kaskaadi-ariloogika.md`](docs/kaskaadi-ariloogika.md): **78 numbered
rules** with stable IDs (`[J-04]`, `[N-03]`, …), a traceability appendix mapping
verbatim quotes from the specialists' meeting to the rules they justify, and a
worked example (**Lisa B**) that doubles as the acceptance test. The document is
the source of truth; the code refers to rules by ID and the tests are named after
them.

### The one idea the design turns on

The display *is* the algorithm. `allocate()` is a single pure function, and the
same function serves all three cut points [J-05]:

| Cut | When | Adjustments |
|---|---|---|
| **Prognoos** — projection | live, while the window is open | none |
| **Jaotusettepanek** — proposal | frozen at the deadline | none |
| **Lõplik jaotus** — final | at confirmation | the buyer's, if any |

What a partner watches during the window therefore cannot disagree with what it
receives at the end. `partnerView()` derives the four display states [N-03] by
running the *same* `allocate` over the ranks above the viewer, so cap flow-down
falls out of the algorithm rather than being reimplemented for the screen, and
nothing about other partners can leak: the function is never given their
identities.

### Two decisions that make the window safe

**Visibility informs, it never restricts** [K-01]. Any partner may mark any
training whatever its state says. A mark with no projection is a fallback that
takes effect if a higher-ranked partner withdraws — which is what makes
mid-window revision safe: marking everything and dropping it late achieves
nothing, because the partners below have already marked their fallbacks.

**Marks bind, so the cap protects** [K-05][K-06]. A confirmed mark is a binding
undertaking, which is what makes the round a real procurement rather than an
expression of interest. Fallback-marking would then be dangerous — you could be
handed everything you marked — so a partner may set an optional ceiling
("I accept at most N"), and within it trainings are allocated by event date.
Alternatives for both are recorded as [L-01] and [L-02].

## Architecture, as built

One container, one SQLite file, no outside services.

| Concern | Choice |
|---|---|
| Framework | Next.js 15 App Router, React 19, TypeScript strict, server actions |
| Database | SQLite via `better-sqlite3` + `drizzle-orm`, WAL, on a mounted volume |
| Transactions | every mutation is one `BEGIN IMMEDIATE` transaction that re-checks status inside; SQLite serializes writers globally, which is exactly the guarantee a cascade needs |
| Styling | Tailwind v4 design tokens, light and dark, print stylesheet for orders |
| Time | a virtual clock offset in the database; the domain never reads a clock |
| Scheduling | in-process timer from `instrumentation.ts`, plus lazy checks on round pages and after any clock move — idempotent from all three |
| Email | optional `nodemailer` over configurable SMTP; the in-app notification log is the primary channel and each row records what happened to its email |
| Identity | one `getActor()` seam; personas in the test deployment, real auth later [L-08] |
| Tests | vitest for domain and engine, plain Node + Playwright for the browser suites |

### Constraints the implementation expresses structurally

- **`publishRound` has no partner-selection parameter.** The framework describes
  offering to one partner at a time or to all of them; an ad hoc subset is not
  available. The absence of the parameter *is* rule [V-01] — there is no UI to
  hide, and no code path to review.
- **Partner actions never receive a `lotPartnerId`.** They take a `roundId`; the
  engine resolves the acting membership from the actor. A client cannot act for a
  company that is not its own.
- **Confirmations, adjustments and audit events are append-only**, enforced by
  `BEFORE UPDATE`/`BEFORE DELETE` triggers that `RAISE(ABORT)`. A withdrawn
  training's marks are excluded when the allocation input is built [V-04]; a
  stored confirmation is never edited, because it is evidence.
- **The buyer's discretion is never automatic.** The framework's workload right
  (the "~25 trainings" rule) surfaces as a post-deadline warning with a mandatory
  justification, and the justification is displayed next to the adjustment it
  explains [T-01][T-02].
- **Orders are rendered from a snapshot** frozen at confirmation, so a contract
  says later what it said when it was agreed [T-05].

## The test deployment

The point is that a procurement specialist can walk the whole process from both
sides without an account, a mail server or a three-day wait.

- **An opening screen** picks a persona before the environment is shown — the
  buyer, or any of six fictional partners — and each card shows what that persona
  currently has waiting, so the tester knows which one is instructive.
- **A hazard-striped strip above the application** switches persona, moves the
  virtual clock (`+1 h`, `+1 päev`, `Järgmise tähtajani`) and resets the sample
  data. It is deliberately not app chrome.
- **`DEMO_MODE` is the single switch.** Unset, there is no strip, no personas and
  no clock, and the demo-only actions refuse to run.

### Sample data

Everything is loaded through the *same* import functions the buyer's upload uses,
so "load from the database" and "upload a table" cannot drift:

- `seed/naidis-koolituskalender.csv` — 48 trainings across the four lots, autumn
  2026, all 15 counties, with an XLSX twin generated from it;
- `seed/naidis-partnerid.csv` — six fictional partners ranked per lot;
- four scenario rounds, **replayed as real engine calls against a rewound
  virtual clock**, so the audit trail, the notification log and the frozen
  snapshots a tester sees are genuine rather than fabricated rows [L-16].

The open scenario **is Lisa B**, asserted cell by cell against the spec fixture,
with the rank-3 partner holding an unconfirmed draft — which is where the
[K-03] trap lives and the most instructive screen in the application.

## Verification

| Suite | What it holds to account |
|---|---|
| `pnpm test` — 232 tests | one `describe` per rule ID; Lisa B.1–B.4 exactly; the append-only triggers; the seed *is* Lisa B |
| `node scripts/verify-harness.mjs` | personas, the strip, the clock, reset, and the production posture with `DEMO_MODE` off |
| `node scripts/verify-partner.mjs` | Lisa B walked from three partner personas — every cell of B.2, then A's B.3 revision flipping a training to B; a sealed round shows no states; no page names a competitor |
| `node scripts/e2e.mjs` | Lisa B to the end (close → the T-01 warning → cap → B.4 → confirm → orders), and a second round built from an uploaded table with a deliberately broken row |

## Deployment

`Dockerfile` (multi-stage, Debian slim so better-sqlite3 uses its prebuilt glibc
binary and the image needs no compiler) and `fly.toml` (one machine, one volume,
`auto_stop_machines = "off"` because the deadline timer runs in-process). The
build asserts that the native binding, the migrations and the sample datasets
were traced into the standalone output, so a tracer change breaks the build
rather than production. Migrations and the seed run at start-up, not as a release
command: a Fly release machine has no volume mounted.

**Not yet deployed.** No Docker daemon is available in the build environment, so
the image is unbuilt; the standalone server it runs (`node server.js` with the
volume path) was smoke-tested directly and boots, migrates, seeds and serves.

## Open questions

Four items in the spec await legal or specialist input and are marked as such:
**[L-01]** revising marks during the window (agreed by the buyer team, needs
checking against the framework agreement's own wording), **[L-05]** the scope of
the buyer's adjustments, **[L-07]** what "workload" counts for the 25-training
threshold, **[L-10]** whether "3 days" means working days. **[L-12]** asks
whether a closed round should be cancellable at all. Each records the chosen
option, the alternatives, and the seam in the code where a different answer would
land.

The cascade parameters themselves — deadline length, the workload threshold,
whether the sealed mode is ever needed — are per-lot configuration, not
assumptions baked into the code. They should be checked against the
alusdokumendid before go-live.

---

## Appendix — the sequential mode [V-08], deferred

The framework also permits offering one partner at a time. The v1 plan targeted
exactly that, and the merged demo implements it: offer to rank 1 with a tokenized
email link, cascade on decline or timeout, with per-lot configuration for the
deadline, whether skipping is allowed, and strict ranking versus rotation.

It is deferred rather than dropped. `src/domain/select-next.ts` and the v1 email
templates remain, with their tests, and the spec keeps the mode as [V-08]. What a
future implementation needs is a `mode` on the lot and a second engine path; the
parallel path is untouched by it, since rank order and the audit trail are shared.
