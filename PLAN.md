# Kaskaadhankija — MVP Plan

## Context

**Why**: The eesti.ai programme ("Kõige AI targem rahvas", target: 100,000+ working-age adults complete an AI workshop in 2026–2027) buys trainings through the framework procurement **"Eesti.ai koolitajate tellimine"** (Riigikantselei via RTK, RHR procurement [10567384](https://riigihanked.riik.ee/rhr-web/#/procurement/10567384/general-info), ~€5M, framework agreements valid until 31.12.2027). Individual training orders under the framework are assigned by **cascade mini-procurement (kaskaad)**: framework partners are ranked per lot from the tender evaluation; each order is offered to rank #1, who must accept within a set deadline (~3 working days); on decline or timeout the offer cascades to the next rank, with documented justifications and a complete audit trail. Running this by hand (email + spreadsheet) is error-prone and audit-hostile at the scale of hundreds of orders.

**What**: An online tool ("Kaskaadhankija") for the buyer team to create training orders, run the cascade automatically, and keep the audit trail. Confirmed MVP scope:

1. **Users**: buyer-side team logs in; framework partners get **no accounts** — they receive offers by email with secure tokenized Accept/Decline links; the cascade advances automatically on decline or deadline expiry.
2. **Methods**: cascade only (mini-competition post-MVP).
3. **Stack**: Next.js (App Router, TypeScript) + Postgres + Drizzle; deployed on **Vercel + managed Postgres (Neon)**; Resend for email. UI in Estonian.

**Framework facts** (from public sources): lots include trainings **with room rental**, **without room rental** (customer's venue), **web-based** (Teams/Zoom), and **large-scale events** (hackathons, lectures, co-creation); standardized formats "Töötuba 1"/"Töötuba 2". Framework agreements may not be concluded yet → partners/rankings entered manually by admins. Exact cascade parameters must be **configurable per lot** and verified against the alusdokumendid before go-live.

**Execution note**: this file is the approved MVP plan. The build session executes it on this branch, phase by phase per the build order below.

---

## Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 15 (App Router, `src/`, TS strict), React 19 |
| DB | Neon Postgres (pooled), `drizzle-orm` ~0.44 via `drizzle-orm/node-postgres` (`pg` Pool — the engine needs interactive transactions with `SELECT … FOR UPDATE`; do **not** use the Neon HTTP driver), `drizzle-kit` ~0.31 |
| Auth | Auth.js (next-auth v5) + Drizzle adapter + Resend magic links, DB sessions, invite-only (signIn callback checks `users` table) |
| Email | Resend SDK; plain TS template functions; dev mode logs emails to console (`EMAIL_DEV_MODE=1`) |
| UI | Tailwind v4 + shadcn/ui; Estonian strings centralized in `src/lib/strings.ts` |
| Validation | zod (shared form + server action schemas) |
| Dates | date-fns v4 + `@date-fns/tz` (TZDate); own working-days util, hardcoded Estonian holidays 2026–2028 |
| Tests | vitest (working-days, next-partner selection; engine tests on pglite optional) |
| Scheduling | Vercel Cron → `GET /api/cron/expire` every 10 min (**Pro plan needed for sub-daily; fallback: external pinger hitting the same secret-protected route**) + lazy expiry on the public offer page as backstop |

All timestamps stored UTC; the only Tallinn-aware code is `working-days.ts` and display formatting.

## Repository layout

```
drizzle/                          # migrations (+2 custom: audit trigger, order_number_seq)
drizzle.config.ts  vercel.json    # cron config
src/
  middleware.ts                   # cookie-presence redirect; real auth in (app)/layout
  db/{schema.ts,index.ts,seed.ts}
  lib/{working-days.ts,tokens.ts,strings.ts,format.ts}
  auth.ts                         # Auth.js config + requireUser()/requireAdmin()
  server/
    audit.ts                      # logAudit(tx, …) — same transaction as the mutation
    cascade/{engine.ts,select-next.ts}
    email/{send.ts,templates.ts}
    actions/{orders,lots,partners,users,cascade}.ts   # "use server", zod, auth-checked
  app/
    login/page.tsx
    offer/[token]/{page.tsx,actions.ts}   # PUBLIC partner response page, noindex
    (app)/                         # auth-guarded shell: Töölaud, Tellimused, Hankeosad, Partnerid, Auditilogi, Kasutajad
      page.tsx                     # dashboard
      orders/{page.tsx,new/page.tsx,[id]/page.tsx,[id]/cascade-timeline.tsx}
      lots/{page.tsx,[id]/page.tsx}
      partners/page.tsx  audit/page.tsx  admin/users/page.tsx
    api/auth/[...nextauth]/route.ts
    api/cron/expire/route.ts       # Bearer CRON_SECRET
    api/webhooks/resend/route.ts   # stretch: bounce events
```

## Data model (`src/db/schema.ts`)

Enums: `user_role(admin,member)`, `ranking_mode(strict,rotation)`, `order_status(draft,cascading,assigned,failed,cancelled,completed)`, `offer_status(pending,accepted,declined,expired,skipped,cancelled)`, `decline_reason(no_capacity,date_conflict,location_unsuitable,other)`, `workshop_type(tootuba_1,tootuba_2,suursundmus,muu)`, `language(et,ru,en)`, `county(15 maakonda + veebipohine)`, `email_status(sent,failed,delivered,bounced)`, `actor_type(user,partner,system)`.

- **users**: id, email unique (lowercased), name, role, createdAt + Auth.js `accounts/sessions/verificationTokens` tables.
- **lots**: code unique (`OSA-2`), name, description, cascade config — `responseDeadlineWorkingDays` (default 3), `deadlineLocalTime` (default `'17:00'` Tallinn), `rankingMode` (default strict), `allowSkip` (default true), `reminderHoursBefore` (nullable, stretch), isActive.
- **partners**: name, regCode (äriregistrikood), notes, isActive. Company data only (GDPR-minimal).
- **lot_partners**: lotId, partnerId, `rank`, contactEmail, contactName, unitPriceEur (informative framework price), isActive. `unique(lotId,partnerId)`; partial unique index `(lotId,rank) where isActive`. Accepted volume/value per partner is **derived by query**, never stored.
- **orders**: `orderSeq` from Postgres sequence → display `KH-2026-0007`; lotId, title, workshopType, eventStart/eventEnd, county, locationText, participantCount, language, estimatedValueEur, extraNotes, status, `currentRun int` (per cascade restart), **config snapshot** at cascade start (deadline days, local time, ranking mode — mid-flight lot edits don't affect running cascades), assignedLotPartnerId, assignedAt, createdBy.
- **offers** (one row per partner per round — the audit core): orderId, lotPartnerId, `runNo`, `roundNo`, `unique(orderId,runNo,roundNo)`, `tokenHash` unique (SHA-256 of 32-byte base64url token; **raw token only in the email**), status, `isManual`, sentAt, `deadlineAt`, respondedAt, declineReasonCode/Text, skipJustification, skippedBy, reminderSentAt, responderIp, responderUserAgent. Partial unique index `(orderId) where status='pending'` — at most one live offer per order. Skipped-before-send rows have null sentAt/tokenHash so every considered rank is documented.
- **audit_events** (append-only): bigserial, occurredAt, actorType/actorId/actorLabel, nullable orderId/offerId/lotId, eventType (`order.created`, `cascade.started`, `offer.sent/accepted/declined/expired/skipped/resent/email_failed`, `cascade.exhausted/aborted`, `order.assigned_manually/cancelled/completed`, `partner.rank_changed`, `lot.config_changed`, `user.invited`…), payload jsonb. **Custom migration: `BEFORE UPDATE OR DELETE` trigger → `RAISE EXCEPTION`.**
- **email_log**: orderId/offerId, toEmail, template, subject, resendId, status, error, sentAt.

Decline reasons (public page radios): `no_capacity` "Koolitajad on hõivatud", `date_conflict` "Kuupäev ei sobi", `location_unsuitable` "Asukoht ei sobi", `other` "Muu põhjus" (free-text required for `other`).

## Cascade state machine (`src/server/cascade/engine.ts`)

Order: `draft → cascading → assigned → completed`; `cascading → failed` (exhausted); `draft|cascading|assigned → cancelled`; `cascading → draft` (admin abort; **editing while cascading is forbidden at the action layer** — restart = `currentRun+1`, cascade re-begins at rank 1, old runs kept as history). Offer: `pending` → `accepted|declined|expired|skipped|cancelled`.

| Trigger | Effect (one DB transaction; emails only **after commit**) |
|---|---|
| Alusta kaskaadi | Guards: draft, ≥1 active lot_partner. Snapshot config, `currentRun++`, optional pre-skips (justification each), first non-skipped rank → pending offer, token, `deadlineAt = addWorkingDays(now, N)` at snapshot local time. Order → cascading. Send offer email |
| Partner Accept (public) | Lock order `FOR UPDATE`, then offer (fixed order → no deadlocks). Guards: offer pending, order cascading, `now ≤ deadlineAt`. Offer → accepted (+ip/UA), order → assigned. Confirmations to partner + team |
| Partner Decline (reason required) | Same locking. Offer → declined + reason; `advanceCascade` in-txn; next-offer email + team notice |
| Click after deadline (lazy expiry) | Time guard fails → offer expired, `advanceCascade`, render "Tähtaeg on möödunud" |
| Cron expire | `WHERE status='pending' AND deadline_at < now() FOR UPDATE SKIP LOCKED`, each own txn → expired + advance. Idempotent, overlap-safe. Also sends reminders (stretch) |
| `advanceCascade` | `select-next.ts` (pure fn): strict = lowest active rank with no offer in current run; rotation = order by (currently assigned/completed count ASC, rank ASC). Found → new pending offer + email. None → order failed, `cascade.exhausted`, team email |
| Admin Jäta vahele | Mandatory justification → offer skipped (+skippedBy), advance |
| Admin Katkesta kaskaad | Pending offer → cancelled, order → draft |
| Admin Määra käsitsi | From draft/cascading/failed: pick any active lot_partner + justification → synthetic offer `accepted, isManual=true`, order → assigned (covers phone agreements, post-exhaustion salvage) |
| Email send failure | Offer stays pending; email_log failed + audit + red banner; **Saada uuesti** resets `deadlineAt` from now (audited `offer.resent`) |

Race rules: every mutation re-checks status inside the txn under row locks; double-clicks get a friendly "Sellele pakkumusele on juba vastatud" page; accept-vs-cron serializes on the lock; a crashed email never rolls back state (it becomes a resendable failure).

**Working days** (`src/lib/working-days.ts`): Mon–Fri minus Estonian public holidays hardcoded for 2026–2028 (01.01, 24.02, Suur Reede 03.04.26/26.03.27/14.04.28, ülestõusmispüha 05.04.26/28.03.27/16.04.28, 01.05, nelipüha 24.05.26/16.05.27/04.06.28, 23.06, 24.06, 20.08, 24.–26.12). Send day doesn't count; result = Nth working day at `deadlineLocalTime` Tallinn → UTC via TZDate. Unit-test Friday sends, holiday spans, DST edges.

## Email flow (Estonian) + public page

`sendEmail()` wrapper = Resend call + email_log row; dev mode prints body + links to console. Templates: **offer** (subject `Koolitustellimus KH-2026-0007 — palume vastust hiljemalt 02.09.2026 17:00`; framework reference `Raamleping "Eesti.ai koolitajate tellimine", RHR 10567384, hankeosa …`; details table: töötuba, kuupäev(ad), maakond/asukoht, osalejate arv, keel, hinnanguline maksumus, lisainfo; bold deadline; button → `${APP_BASE_URL}/offer/{rawToken}`; note that the link is personal/single-use and non-response passes the order to the next partner), **acceptance→partner**, **acceptance→team**, **decline→team**, **exhausted→team**, **reminder** (stretch).

`/offer/[token]` (server component, noindex, no auth): hash → offer+order+lot+partner. States: pending & in-deadline → details + **Võtan tellimuse vastu** / **Loobun tellimusest** (reason radios + textarea), POSTing token-scoped server actions; already responded → outcome summary; expired/cancelled → tähtaeg möödunud; unknown → 404. Shows only that partner's own order data; records ip/UA.

## Pages

- **Töölaud**: status-count cards; pending offers table (order, partner, rank, deadline countdown, red <24h); warnings (failed emails, exhausted cascades); **Partnerite koormus** per lot (rank, accepted count/€ total, declined/expired/skipped) — the volume-balancing report.
- **Tellimused**: filterable list; new-order form (zod); detail page = spec + status actions + **cascade timeline** (every run/round: partner, rank, sent/deadline/responded, status badge, reasons/justifications) — the human-readable audit trail.
- **Hankeosad**: config form + ranked partner editor (add/rank up/down/deactivate; audited; running cascades unaffected via snapshot). **Partnerid**: CRUD. **Auditilogi**: filterable, payload as expandable JSON, read-only. **Kasutajad** (admin): invite by email, role, deactivate.

## Env

`DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, `APP_BASE_URL`, `CRON_SECRET`, `TEAM_NOTIFICATIONS_EMAIL`, `SEED_ADMIN_EMAIL`, `EMAIL_DEV_MODE`. `vercel.json` cron `*/10 * * * *` → `/api/cron/expire`.

## Build order (each phase verifiable)

0. **Scaffold**: create-next-app + deps + shadcn + vercel.json + .env.example. *Verify: dev renders, build passes.*
1. **Schema + seed**: schema.ts, custom migrations (audit trigger, sequence), seed.ts. *Verify: migrate + seed against Neon dev branch; manual `UPDATE audit_events` fails.*
2. **Auth + shell**: magic-link login, invite-only allowlist, (app) layout. *Verify: seeded admin logs in via console link; stranger rejected; logged-out redirect.*
3. **CRUD**: lots (config + ranked partners), partners, users, orders (draft). *Verify: click-through creating lot + 3 ranked partners + draft order.*
4. **Cascade engine**: working-days + tokens + select-next + engine + templates, unit tests. *Verify: `pnpm test` green; Alusta kaskaadi → offer row with correct Tallinn deadline; offer email in dev console.*
5. **Public offer page + confirmations + timeline**. *Verify full happy path locally: start → decline w/ reason → round 2 → accept → assigned + 2 confirmation emails; reopened links show "already responded"; double-submit inert.*
6. **Cron + lazy expiry**: *Verify: backdate `deadline_at`, curl with Bearer → expired + advanced; 2nd curl no-op; wrong secret 401; exhausting all partners → failed + team email.*
7. **Dashboard, audit UI, polish, deploy**: Neon prod, Resend domain, Vercel envs + cron. *Verify in prod: seed fictional partners with plus-addressed team inboxes, run one real cascade end-to-end by email, watch cron expire a short-deadline offer.*

Seed (`src/db/seed.ts`, idempotent): admin from `SEED_ADMIN_EMAIL`; 4 lots mirroring the framework (OSA-1 ruumirendiga, OSA-2 ruumirendita, OSA-3 veebikoolitused, OSA-4 suursündmused; 3 working days / strict / 17:00); 5 fictional partners (Tehisaru Koolitus OÜ, AI Akadeemia OÜ, Digioskus MTÜ, Nutikoolitus OÜ, E-õppe Ekspert OÜ) with plus-addressed emails, ranked 3–4 per lot with plausible unit prices; 2 draft orders.

## Risks / edge cases (handled by design)

Cascade exhausted → failed + alert + restart or audited manual assign. Email failure → banner + resend with fresh deadline (silent bounces: Resend webhook is stretch; mitigations are the visible pending state + admin skip). Mid-cascade edits forbidden; abort→edit→restart keeps all history. Tokens: 256-bit, hashed at rest, scoped, dead after response/expiry. Config drift: per-order snapshots. Timezone/DST: UTC storage + TZDate + tested holiday table (through 2028 for spillover). GDPR-minimal: business contacts only, participant *count* only, ip/UA kept solely as procurement evidence. Audit immutability: DB trigger + same-transaction writes. Vercel Hobby cron is daily-only → Pro or external pinger. **Before go-live: verify per-lot cascade parameters against the actual framework agreement text** (deadline length, skip rules, rotation vs strict) — all configurable in Hankeosad.

## Verification (overall)

Unit tests for working-days and select-next; scripted end-to-end click-through per phases 5–6 above; final prod smoke test with fictional partners via real email. Success = one order cascading from rank 1 decline → rank 2 accept with a complete, immutable audit trail and correct Tallinn deadlines.
