# Kaskaadhankija

A tool for running **cascade mini-procurements (kaskaad-minihanked)** — the process
for assigning individual training orders under the Estonian framework procurement
*"Eesti.ai koolitajate tellimine"* (Riigikantselei,
[RHR 10567384](https://riigihanked.riik.ee/rhr-web/#/procurement/10567384/general-info),
framework agreements valid until 31.12.2027).

One round of trainings goes to **every** partner of a lot at the same instant.
Over a window of about three working days each partner marks what it will take
and confirms; at the deadline the allocation is resolved strictly in framework
rank order, so speed of response never matters. While the window is open a
partner sees the *effect* of higher-ranked partners' confirmed marks — never
their identity — and can plan around what is realistically still available.

The UI is in Estonian. So is the specification, because the procurement
specialists edit it directly.

## Status

| | |
|---|---|
| **[`docs/kaskaadi-ariloogika.md`](docs/kaskaadi-ariloogika.md)** | The business logic: 78 numbered rules, decisions with their alternatives, a traceability appendix, and a worked example (Lisa B). **The source of truth.** |
| **[`PLAN.md`](PLAN.md)** | Why the design is what it is, and what is deliberately structural |
| **`src/`** | The application: buyer and partner screens, the round engine, the table import, the test harness |
| **[`demo/`](demo/)** | The v1 single-file HTML demo of the *sequential* cascade — still useful, no server needed |
| Deployment | `Dockerfile` and `fly.toml` are written; the image has not been built or deployed yet |

## Try it locally

```bash
pnpm install
DEMO_MODE=1 pnpm dev          # http://localhost:3000
```

The first request creates the database, applies the migrations and loads the
sample data. (In the container it is the same code, from the same first request;
there is no separate migration step, because the database lives on a volume that
a release machine would not have.) Open the URL and you are asked to pick a persona before you see anything
else: the buyer (Mari Tamm, Riigikantselei) or any of six fictional partners.
Each card shows what that persona has waiting.

Then use the striped strip above the application to switch persona, move the
virtual clock, or reset the sample data. It is not part of the application — with
`DEMO_MODE` unset there is no strip, no personas and no clock, and the demo-only
actions refuse to run.

### A five-minute tour

The seeded open round **VOOR-2026-003 is Lisa B of the specification**, so you can
compare the screens against the document as you go.

1. Enter as **Tehisaru Koolitus OÜ** (koht 3 in OSA-2). It has a saved draft that
   is *not confirmed*, so the round page shows the four display states of [N-03]
   for its draft alongside a warning that only confirmed marks count at the
   deadline. This is Lisa B.2, column C.
2. Confirm it, then switch to **AI Akadeemia OÜ** (koht 1), remove one training
   and re-confirm. That is Lisa B.3.
3. Switch to **Digioskus MTÜ** (koht 2) and watch the training that AI Akadeemia
   released appear in its projection — without any indication of who released it.
4. Back as the buyer, press **Järgmise tähtajani** on the strip. The round closes
   itself and the proposal is frozen: Lisa B.1.
5. Open the review. Digioskus is flagged as being at its lot's workload
   threshold, which is the framework's [T-01] warning. Cap it at one training,
   with a justification — the allocation becomes Lisa B.4.
6. Confirm. Each partner now has an order, and a partner whose marked training
   went elsewhere is told so without a name or a reason.

### Uploading a procurement table

As the buyer: **Koolitused → Impordi**. Upload a `.csv` or `.xlsx` with Estonian
headers; the preview says what will be created, updated, skipped as locked, or
rejected, with a reason per row, and nothing is written until you confirm. The
sample calendar in [`seed/`](seed/) is loaded through the same code, so the
"upload a table" and "load from the database" paths cannot drift.
`scripts/fixtures/e2e-koolitused.csv` has a deliberately broken row if you want
to see the diagnostics.

## Development

```bash
pnpm typecheck
pnpm test                       # 232 domain and engine tests, named after spec rules
pnpm build

node scripts/verify-harness.mjs # personas, strip, clock, reset, DEMO_MODE off
node scripts/verify-partner.mjs # Lisa B from three partner personas
node scripts/e2e.mjs            # Lisa B to the end, and a round built from an upload
node scripts/verify-container.mjs  # restart survival on a volume, production posture
pnpm verify:all                 # build, then all four in order

pnpm db:seed                    # load the sample data into ./data
pnpm datasets:build             # regenerate the XLSX twins from the CSVs
pnpm demo:verify                # rebuild and drive the v1 single-file demo
```

The browser scripts each start their own server on a throwaway database and a
free port, and write screenshots next to themselves. They need no configuration.

### How the specification and the code stay in step

Every rule in the spec has a stable ID. Code comments and test names cite them:

```ts
describe('[J-04] range järjestus', () => { … })
```

So a change to the document is the contract for a change to the application:
edit the rule, record it in the change log at the end of the document, then
change the code and the tests named after it. Decisions that could reasonably
have gone another way live in section **L** with their alternatives — including
the six recorded while this was built.

## Deployment

One container, one SQLite file on a mounted volume, no outside services. See
[`PLAN.md`](PLAN.md) for the reasoning and `fly.toml` for the Fly.io specifics —
in short: one machine only (two would mean two databases), never suspended
(the deadline timer runs in-process), and migrations at start-up rather than as a
release command (a release machine has no volume). Copy `.env.example` for the
configuration; SMTP is optional, and without it the in-app notification log is
the only channel.

Deploys run from GitHub Actions, so nothing needs to be installed locally:

1. Create a Fly access token (account- or organisation-scoped, **not** an
   app-scoped deploy token — the workflow may have to create the app itself).
2. Save it as the repository secret **`FLY_API_TOKEN`**, under
   *Settings → Secrets and variables → Actions*.
3. Run **Deploy to Fly.io** from the Actions tab, or push to `main`.

The workflow creates the app and the `kh_data` volume if they are missing,
deploys with `--ha=false`, and then refuses to go green unless the result is
right: exactly one machine, started, with a volume at `/data`; `/api/health`
reporting ok; the opening screen offering six partner personas and the buyer;
and `/tellija` unreachable without a persona.

Two things that bite. Fly app names are **globally unique** — if `kaskaadhankija`
is taken, re-run the workflow with a different name in its `app` input, and
change both `app` and `APP_BASE_URL` in `fly.toml` (the latter is what
notification links use). And Fly wants payment details on file before it will
create machines.

To run it as a real deployment rather than a test one, remove `DEMO_MODE` from
`fly.toml`: no personas, no strip, no virtual clock, and the demo-only actions
refuse. Mail can be added later without redeploying anything else, with
`fly secrets set SMTP_HOST=… SMTP_USER=… SMTP_PASS=… EMAIL_FROM=…`.

## Before go-live

The per-lot cascade parameters — response deadline, the workload threshold, and
whether the sealed visibility mode is ever wanted — are configuration, not
assumptions in the code, and should be checked against the framework's own
alusdokumendid. The specification marks the four questions awaiting legal or
specialist input as **[L-01]**, **[L-05]**, **[L-07]** and **[L-10]**.
