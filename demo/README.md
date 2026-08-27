# Kaskaadhankija — näidis / demo

`kaskaadhankija-demo.html` is a **self-contained working demo** of the cascade
mini-procurement process used to assign individual training orders under the
framework procurement *"Eesti.ai koolitajate tellimine"*
([RHR 10567384](https://riigihanked.riik.ee/rhr-web/#/procurement/10567384/general-info)).

## How to open it

Any of these work — no server, no build, no accounts, no network:

- **Double-click the file.** It runs from `file://` in any modern browser.
- **Email it** as an attachment (~84 kB).
- **Host it on GitHub Pages** or any static host, unchanged.

State is kept in that browser's `localStorage`, so each viewer gets a private
sandbox. "Lähtesta näidis" wipes it and starts over.

## What is real and what is simulated

**Real** — this is the same logic the production app will run, from the same
`src/domain/` modules:

- the full cascade state machine: offer → accept / decline / timeout → next
  ranked partner → exhausted
- skip-with-justification, cascade abort and restart, manual assignment
- Estonian working-day deadline arithmetic, including riigipühad and
  Europe/Tallinn DST (unit-tested in `src/domain/working-days.test.ts`)
- ranked and rotation partner selection
- the complete audit trail, and the exact Estonian email copy that production
  will send

**Simulated** — deliberately, and both are *better* for a demo:

- **Email.** Nothing is sent. Every message the app would send appears in the
  **Partneri postkast** panel on the right, addressed to partners and to the
  buyer team alike. Opening an offer in "partner view" shows the tokenized
  response page exactly as a koolitaja would see it.
- **Time.** The clock in the top bar can be fast-forwarded, so a three-working-day
  deadline can be watched expiring in one click instead of three days. Use
  **Järgmise tähtajani** to jump just past the next pending deadline.

**Not present**, because a browser cannot provide it: real mail delivery, state
shared between people, enforceable token security, or an evidentiary audit
record. This is a faithful prototype of the workflow, not a system of record.

## A three-minute tour

1. The dashboard opens with one **live cascade** already waiting for an answer
   (KH-2026-0003) and one finished order that shows the canonical outcome —
   rank 1 declined, rank 2 accepted.
2. In the mailbox, click **Ava partneri vaates** on the highlighted offer, then
   **Loobun tellimusest** and pick a reason. The cascade immediately offers the
   order to the next ranked partner and mails them.
3. Click **Järgmise tähtajani** in the top bar. The new offer expires unanswered
   and the cascade advances on its own — the behaviour that runs on a timer in
   production. Keep clicking to drive the cascade to exhaustion.
4. Open **Tellimused → the draft order → Alusta kaskaadi** to run a cascade from
   the start, optionally skipping partners with a justification.
5. **Hankeosad** holds the per-lot cascade settings; **Auditilogi** shows every
   recorded event.

## The point of the demo

The one thing the plan could not settle is whether the cascade parameters match
the actual framework agreement text — response deadline, whether skipping is
permitted, and strict ranking versus rotation for volume balancing. All three are
configurable per lot under **Hankeosad**. Put this demo in front of RTK or the
procurement lawyers and the question gets answered in a meeting rather than after
a deployment.

**Partner names and contacts are fictional.** The real framework partners and
their rankings are entered once the framework agreements are concluded.

## Rebuilding

```bash
pnpm install
pnpm demo:build     # bundles src/demo + src/domain into the single HTML file
pnpm demo:verify    # rebuilds, then drives it in Chromium and asserts the cascade
pnpm test           # unit tests for the deadline and ranking logic
```

`demo:verify` writes screenshots to `demo/screenshots/` (gitignored).
