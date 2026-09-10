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
| **[`docs/kaskaadi-ariloogika.md`](docs/kaskaadi-ariloogika.md)** | The business logic: 83 numbered rules, decisions with their alternatives, a traceability appendix, and a worked example (Lisa B). **The source of truth.** |
| **[`PLAN.md`](PLAN.md)** | Why the design is what it is, and what is deliberately structural |
| **`src/`** | The application: buyer and partner screens, the round engine, the framework and round imports, the protocol |
| **[`demo/`](demo/)** | The v1 single-file HTML demo of the *sequential* cascade — still useful, no server needed |
| **[kaskaadhankija.fly.dev](https://kaskaadhankija.fly.dev)** | The accepted v2 test environment — the persona picker, kept as the specialists reviewed it |
| **[kaskaadhankija-v3.fly.dev](https://kaskaadhankija-v3.fly.dev)** | The v3 line: sign-in as the front door, the framework data in the application, real time, the signable round protocol |

## Try it

The v3 test environment is live at
**[kaskaadhankija-v3.fly.dev](https://kaskaadhankija-v3.fly.dev)**: one machine
in Stockholm, SQLite on a volume, sample data loaded on first boot. Everything
below works there exactly as it does locally. The partners in it are fictional
and their addresses are made up, so nothing in it needs protecting — but the
door is real: **there is no way in without signing in**.

To run it yourself:

```bash
pnpm install
DEMO_MODE=1 pnpm dev          # http://localhost:3000
```

The first request creates the database, applies the migrations and loads the
sample data — through the same import an admin would use, so there is no second
truth to keep in step. (In the container it is the same code, from the same
first request; there is no separate migration step, because the database lives
on a volume that a release machine would not have.)

### The front door

`/` is not a page you can read: it sends you to **`/sisene`**, where an address
gets a six-digit code by e-mail [L-08]. The code exists only in the mail — it is
deliberately absent from every log. Where you land depends on who you are:

- **a buyer admin** → the *„Kellena tegutseda“* screen, every time. In the test
  environment an admin may act as any participant — the team, or any partner the
  framework data put in the tables — **without ending their own session**. Both
  names are then on the record: the participant as the actor, the admin as
  `via`, and a partner's confirmation carries the suffix „testkeskkonnas
  tegutses: …“ as [D-09] evidence.
- **a hankija** → the buyer dashboard, and the whole procurement with it: the
  calendar, a new round, publishing, the review, the caps, the confirmation, the
  protocol, the orders. What is not theirs is the framework agreement's own data
  [L-21] and the team — they read both in full, with the forms replaced by a
  note saying what an admin does and what they can do themselves [R-01]. They
  cannot act as another participant.
- **a partner's representative** → their own area, and nobody else's.

With `DEMO_MODE` unset there is no act-as screen and no badge: the sign-in is
the only way in, for everyone.

**Who is an admin.** `AUTO_ADMIN_ALLOWLIST` names who may sign in as an admin
**without being listed first** — a named address (`nimi@riigikantselei.ee`), or
a whole domain (`@naidis.ee`) for a throwaway environment where maintaining a
roster is not worth it. The user row appears only on a **verified** code, never
on a request, and the list never reactivates somebody an admin switched off.
Everyone else is added by an admin on *Meeskond* and starts as a **hankija**;
an admin promotes them there if they need it, and the last active admin can be
neither demoted nor switched off.

A whole domain means anyone holding a mailbox there can publish rounds and
confirm allocations, which is irreversible — **[L-08]** now records the named
list as the chosen access model, and the test deployment carries one address.
The sign-in page publishes how **many** entries the list has and never whose
address they are; *Meeskond* says the same, and warns when an entry is a whole
domain. Leave the variable empty to require that everybody be listed by hand.

### A ten-minute tour

The seeded open round **VOOR-2026-003 is Lisa B of the specification**, so the
screens can be compared against the document as you go.

1. Sign in with an allowlisted address. You land on *„Kellena tegutseda“*: the
   team plus every partner the framework data created.
2. Act as **Tehisaru Koolitus OÜ** (koht 3 in OSA-2) and open the open round. It
   has a saved draft that is *not confirmed*, so the page shows the display
   states of [N-03] beside a warning that only confirmed marks count at the
   deadline — Lisa B.2, column C. Confirm it.
3. Switch back to the buyer. The matrix shows every partner's answer; a partner
   never sees another's.
4. **Raamhange**: change one partner's contact address, then read
   *„Muudatuste logi“* at the bottom of the same page — the change is there,
   before and after.
5. **Voorud → Uus voor → Laadi skeem üles**, or edit the downloaded workbook.
   Publish with an absolute deadline a few minutes out (the test environment's
   floor), answer as two partners, and wait. The round closes itself.
6. Review, cap one partner with a justification, confirm. Each partner gets an
   order, and a partner whose marked training went elsewhere is told so without
   a name or a reason [N-08].
7. **Vooru protokoll** on the round page: the PDF is the signable document, the
   .xlsx annex the same content as tables plus the technical evidence. The
   fingerprint on the page, in the PDF footer and in the audit trail are one
   number.

### The framework data lives in the application

**Raamhange** (a hankija reads it, an admin changes it) is the framework
agreement itself [L-21]: its
identity, the lots with their cascade settings, each lot's ranking with the
official contacts, and the representatives. Two ways to change any of it, and
they are the same code underneath:

- **a workbook** — *Raamleping*, *Hankeosad*, *Partnerid*, *Esindajad*.
  Download it filled in with the current data, change the cell you came to
  change, drop it back. A blank cell means *unchanged*, the code is the key,
  nothing is ever deleted, and the import is all-or-nothing with a preview that
  names every refusal — including the two that are easy to miss: a partner who
  would lose their place, and a contact address that cannot become a sign-in.
- **the forms on the page** — the identity, a lot, a partner added to a
  ranking, a contact, a rank moved up or down, a representative.

**The official contact is the partner's sign-in.** The address on a lot's
ranking is mirrored into the representatives, so the formal notices go to
someone who can answer, and that person can get in [L-08]. An address that
already belongs to a buyer user or represents another company is refused at
preview time rather than dropped quietly.

**Every change is logged.** File or form, each one writes an audit row with the
before and after, and the page ends with *„Muudatuste logi“* so the record is
where the editing happens.

### The round protocol

When a round ends — the allocation is confirmed, or a published round is
cancelled — the application writes a **protocol** in the same transaction
[L-22]. It holds the round's conditions, every confirmation in arrival order
with its timestamp, the buyer's adjustments with their justifications, the
proposal beside the final allocation, the orders, the notices and the audit
trail. Nothing is recomputed: the snapshots are copied as the round stored
them.

The stored form is canonical JSON plus its SHA-256, and the same hash goes into
the audit trail. The **PDF** and the **.xlsx annex** are rendered from that on
demand, so the fingerprint printed in the footer always names the data rather
than the renderer. The annex is the only place the confirmations' IP addresses
and browsers appear — evidence for a dispute, not part of a document that
circulates. Approval happens outside the application; nothing is written back.

### Real time

There is no clock to wind [L-23]. A round's deadline is a real instant, and the
minute timer (or the next page load) closes the round when it passes. A test
cascade is made walkable by naming a **short window**: in `DEMO_MODE` the floor
is five minutes rather than the lot's working-day minimum, so a whole cascade
fits in an afternoon. Production keeps the framework's own window, and a
deadline can still only ever be extended [V-04].

### Representatives, and who gets the mail

A partner's lot contact is a representative automatically. Extra people — a
deputy, a second project manager — come from the framework workbook's
*Esindajad* sheet or the form on **Raamhange**; *Esindajad* itself is the list.
Each row carries where it came from (`raamleping` / `üleslaaditud` / `käsitsi`)
and **whoever last activated a row owns it**, so the two feeders cannot undo
each other's decisions: a framework contact cannot be switched off from the
list, and the list's own people are not touched when the ranking is rewritten.

Every formal notice a partner receives is e-mailed to all of its active
representatives, with the lot contact as the fallback, and the *Teavitused* log
shows what happened to each copy — sent, failed and retried, suppressed by the
test environment's allowlist, or never attempted for want of a mail server —
with a manual re-send.

### Uploading a whole round

As the buyer: **Voorud → Uus voor → Laadi skeem üles**. One workbook describes
one round: a *Voor* sheet (lot, visibility, which cap kinds partners may use,
extra working days, the planned window, a note) and a *Koolitused* sheet in the
calendar-import layout. The template downloads prefilled with the lot's
unassigned trainings. The upload creates a **draft** — all or nothing — and
publishing stays the audited act in the application it always was.

The file may name the window it wants: `avaldamine` and `vastamistahtaeg`
(`DD.MM.YYYY HH:MM`; a bare date takes the lot's time of day). That is a
**plan, not a fact** — the draft page shows it, the publish form offers it, and
the real instants are fixed at publication, where the floor is still enforced
from the moment publication actually happens [L-20].

### Caps by trainings or by trainees

A round offers its partners a ceiling of one kind, both, or none — the buyer's
choice per round, defaulting from the lot: "kuni N koolitust" or "kuni N
osalejat" (trainees across the trainings they would receive). A trainee
budget skips a training that does not fit and keeps going, so a later smaller
one can still be taken. The seeded OSA-2 round offers both.

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
pnpm test                       # 456 domain, engine and protocol tests, named after spec rules
pnpm build

node scripts/e2e.mjs            # upload → publish → answer → close → review → confirm → protocol; a partner's own view; an empty environment set up by hand
node scripts/verify-auth.mjs    # sign-in by e-mail code, act-as, admin vs hankija, the named allowlist, production posture
node scripts/verify-admin.mjs   # the framework round trip (download, edit, upload, sign in as the new contact), the admin forms, every change in the log
node scripts/verify-protocol.mjs   # the protocol's two documents over HTTP, and who may fetch them
node scripts/make-juhend-shots.mjs # regenerate the bidder guide's figures; fails if a screen it illustrates has moved
node scripts/verify-container.mjs  # restart survival on a volume, a protocol from the standalone build, production posture
pnpm verify:all                 # build, then all five in order

pnpm db:seed                    # load the sample data into ./data
pnpm datasets:build             # regenerate the sample workbooks from the CSVs and the lot seed
pnpm demo:verify                # rebuild and drive the v1 single-file demo
```

The browser suites run against real time, so the ones that close a round wait
out a real deadline — about a minute each. `TEST_DEADLINE_FLOOR_SECONDS` is
what makes that possible: the harness sets it, and it only ever applies in
`DEMO_MODE`.

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
reporting ok and naming how much framework data is loaded; `/` redirecting to
the sign-in, which carries the environment badge and proves the admin
allowlist reached the machine; and `/tellija` unreachable without a session.

Two environments run from the same workflow. Pushes to `main` and
`claude/parallel-cascade-spec` deploy the accepted **v2** at
[kaskaadhankija.fly.dev](https://kaskaadhankija.fly.dev); pushes to
`claude/cascade-miniprocurement-mvp-plan-re21yp` deploy the **v3** line, where
the sign-in front door, the framework data, real time and the round protocol
are being built, at
[kaskaadhankija-v3.fly.dev](https://kaskaadhankija-v3.fly.dev). Each has its
own machine, volume, database and secrets, so the team can compare them side by
side. The mapping is the `resolve` step of `deploy.yml`.

Two things that bite. Fly app names are **globally unique** — if `kaskaadhankija`
is taken, re-run the workflow with a different name in its `app` input, and
change both `app` and `APP_BASE_URL` in `fly.toml` (the latter is what
notification links use). And Fly wants payment details on file before it will
create machines.

To run it as a real deployment rather than a test one, remove `DEMO_MODE` from
`fly.toml`: no act-as screen, no badge, no relaxed deadline floor. The sign-in
is the front door in both cases. Note that the mail gate does **not** stop
applying outside `DEMO_MODE` — `DEMO_MODE` only decides what an *empty*
allowed-recipients set means (silence in the test environment, everyone in
production).

### Mail

The v3 workflow pushes the mail settings to the v3 app from repository
secrets, so nothing needs `flyctl`: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
`SMTP_PASS`, `EMAIL_FROM`, and `EMAIL_ALLOWED_RECIPIENTS`.

**Who may receive mail [L-19]** is two sets, and only one of them is
configuration. The **framework's own addresses** — every active representative
and every active lot contact — are allowed automatically, derived from the data
an admin uploads (`frameworkRecipients`). Nobody edits a secret to onboard a
bidder, which is what used to leave a real partner receiving neither a round
notice nor a sign-in code. `EMAIL_ALLOWED_RECIPIENTS` then covers the people the
framework does *not* contain: the buyer's own team, the team's mailbox, testers
— addresses and `@domains`, comma-separated. Anything in neither set is recorded
as *suppressed* and never attempted; with both sets empty the test environment
sends nothing at all. The gate covers sign-in codes too, which is why the
derived set must never be narrower than who may sign in — a code the transport
refused is logged as a warning, because the sign-in page deliberately cannot say
whether an address is known. Optional: `TEAM_NOTIFICATIONS_EMAIL` for the buyer team's
copies, and `SEED_TEAM` (`nimi,e-post[,roll];…`) so a fresh volume already has
the people who sign in — added alongside the sample Mari Tamm, not instead of
her. Partner representatives are no longer seeded from a secret: they arrive
with the framework data an admin uploads or edits [L-21]. `AUTH_SECRET`, which
signs the codes and sessions, is generated once by the workflow.

Any SMTP relay works — the test phase uses a public one with a verified sender
address; the Riigikantselei server later is the same variables with different
values. The e-mails' copy lives in `src/domain/round-templates.ts`, and the
`/api/health` endpoint reports `mail: smtp | dev | off`.

## Before go-live

The per-lot cascade parameters — response deadline, the workload threshold,
which cap kinds partners are offered, and whether the sealed visibility mode is
ever wanted — are data an admin edits on **Raamhange**, not assumptions in the
code, and should be checked against the framework's own alusdokumendid. So is
the framework's identity and the ranking itself: replacing the sample data with
the real award means uploading one workbook.

**The bidder guide's pilot passages must go.** `/juhend` is the public guide for
the framework's partners (content in `src/domain/juhend.ts`, figures generated by
`scripts/make-juhend-shots.mjs`). Its *Katsekeskkond* section says that nothing
confirmed in the environment is a binding order — true during the pilot and
false the moment a real round runs. The section is `pilotOnly`, so `DEMO_MODE`
unset already hides it, but it should be **deleted** rather than left to an env
gate, and the go-live wording reviewed by whoever owns the agreement. The page
also restates the app-wide `robots: noindex`; a public guide may want the
opposite once the pilot ends. `docs/juhend/query-sheet.md` lists what else is
outstanding.

There is no reset button [L-23]. Once testers have changed things, the way back
to a pristine environment is a fresh volume — deliberately, because from the
moment an admin uploads real framework data a reset would be one press away from
deleting it. The specification marks
the questions awaiting legal or specialist input as **[L-01]**, **[L-05]**,
**[L-07]** and **[L-10]**; **[L-08]** notes that an e-mail code identifies a
mailbox, not a qualified signatory, and names the one seam to change if the
legal review wants TARA or Smart-ID.
