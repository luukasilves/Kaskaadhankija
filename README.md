# Kaskaadhankija

A tool for running **cascade mini-procurements (kaskaad-minihange)** — the process
for assigning individual training orders under the Estonian framework procurement
*"Eesti.ai koolitajate tellimine"* (Riigikantselei,
[RHR 10567384](https://riigihanked.riik.ee/rhr-web/#/procurement/10567384/general-info),
framework agreements valid until 31.12.2027).

Framework partners are ranked per lot from the tender evaluation. Each training
order is offered to rank 1, who must accept within a set deadline (typically three
working days); on decline or timeout the offer cascades to the next rank, with
documented justifications and a complete audit trail throughout. Doing that by
hand across hundreds of orders is error-prone and hard to audit — hence this tool.

## Status

| | |
|---|---|
| **[`PLAN.md`](PLAN.md)** | Approved MVP plan: architecture, schema, cascade state machine, phased build order |
| **[`demo/`](demo/)** | ✅ Working single-file HTML demo of the whole cascade — **start here** |
| Server app | Not built yet. Scaffold and shared domain modules are in place |

### Try the demo

Open [`demo/kaskaadhankija-demo.html`](demo/kaskaadhankija-demo.html) — double-click
it, email it, or host it on GitHub Pages. No server, no accounts, no network. It runs
the real cascade logic with email and the passage of time simulated, so a
three-working-day deadline can be watched expiring in one click. See
[`demo/README.md`](demo/README.md) for a three-minute tour.

Its purpose is to settle the one open question in the plan: whether the cascade
parameters match the actual framework agreement text. All of them are configurable
per lot in the demo, so the question can be answered in a meeting with RTK or the
procurement lawyers rather than after a deployment.

## Architecture

The MVP targets **one Docker container with no outside services**: Next.js
standalone, SQLite on a mounted volume, an in-process expiry timer, and nodemailer
against existing SMTP. Rationale is in [`PLAN.md`](PLAN.md) — briefly: the load is
trivial and SQLite's global write serialization is exactly the guarantee the cascade
needs; offer mail must come from a trusted `.ee` address or partners will treat the
link as phishing; and procurement data stays on infrastructure the buyer controls.

### Shared domain modules

`src/domain/` is pure, dependency-free TypeScript imported by **both** the demo and
the server, so the two cannot disagree about behaviour that matters:

| Module | Responsibility |
|---|---|
| `working-days.ts` | Estonian working-day deadline arithmetic — riigipühad 2026–2028, Europe/Tallinn DST |
| `select-next.ts` | Which ranked partner is offered next (strict or rotation) |
| `statuses.ts` | Order and offer statuses, legal transitions, Estonian labels |
| `email-templates.ts` | The Estonian email copy sent to partners and the buyer team |
| `format.ts` | Estonian date and currency formatting |

## Development

```bash
pnpm install
pnpm test           # unit tests for deadline and ranking logic
pnpm typecheck
pnpm demo:build     # rebuild the single-file demo
pnpm demo:verify    # rebuild, then drive the demo in Chromium and assert the cascade
```

## Before go-live

Verify the per-lot cascade parameters against the framework agreement's own text —
response deadline length, whether skipping a partner is permitted, and strict
ranking versus rotation. All are configurable; none should be assumed.
