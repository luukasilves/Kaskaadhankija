# Kaskaadhankija: independent review and Estonia CFR assessment

<!-- Review date: 2026-09-14. Review model: gpt-6-astra (GPT-6 Astra), via OpenAI Codex. Reviewed commit: 65d2792b01f5f6d90691443af4ce11d260551fd0. -->

> **Review provenance:** Conducted on **14 September 2026** by **OpenAI Codex using GPT-6 Astra (`gpt-6-astra`)**. The model identifier was verified from the review task's metadata. This is a dated assessment of commit `65d2792b01f5f6d90691443af4ce11d260551fd0`; it is not a continuously updated statement about `main`, and publication does not mean the findings have been fixed.

**Reviewed 14 September 2026. Target: a government public service, with government IT handover as the next milestone.**

**My assessment: this is a credible working pilot with a strong business core. I would take it into an IT handover discussion, but I would not approve it for live procurement use in its present state.** The next investment should be targeted hardening, acceptance testing and operational ownership. The code does not justify a wholesale rewrite.

The most consequential defects I reproduced are premature round closure, modification of another partner's notification read status, email deliveries that remain queued after an interrupted dispatch, and a protocol integrity check that trusts a hash stored alongside editable content. There are also clear government requirements gaps around identity, audit storage, licensing and personal data in URLs. These are substantive, even though the existing tests pass.

Companion files: [full CFR workbook](cfr-matrix.xlsx), [CSV matrix](cfr-matrix.csv). Every one of the 67 source requirements has an assessment, evidence, next action and proposed accountable role. The workbook preserves the original Estonian rules and source levels.

## Scope and evidence

The repository was reviewed at [main commit 65d2792](https://github.com/luukasilves/Kaskaadhankija/tree/65d2792b01f5f6d90691443af4ce11d260551fd0). The tracked application source was left unchanged. Local tests used disposable databases and fictional data; external email delivery was disabled. I did not attack or mutate the public Fly deployment.

The assessment covers source, configuration, migrations, business rules, documentation, existing tests, independent domain probes, browser requests against a local production-mode instance, a dependency advisory scan, sampled accessibility checks, and a generated protocol. It does **not** establish actual government platform configuration, organisational controls, production traffic capacity, a completed penetration test, a full accessibility audit, or procurement-law approval.

The supplied [CFR repository](https://koodivaramu.eesti.ee/e-gov/cfr) is the assessment baseline. Its reviewed XML file last changed at [commit 4d8b69c, 1 December 2022](https://koodivaramu.eesti.ee/e-gov/cfr/-/blob/4d8b69cb1777952f92310adda22edb95bace4467/cfr.xml). A copy of the XML was retained in the review workspace; the pinned link identifies the material assessed. The file contains 18 `required`, 36 `expected`, 7 `recommended`, 4 `draft`, 1 `kohustus` (TARA), and 1 `deprecated` entry. I treat `kohustus` as mandatory for triage while retaining its literal label. Draft and deprecated entries are not counted as active requirements.

This is an assessment against that baseline, not a claim that every line is a current statutory obligation. In particular, the XML still refers to ISKE. The receiving agency must determine the applicable current E-ITS scope and controls; RIA has published updated information-security requirements. [RIA guidance](https://www.ria.ee/uudised/kehtima-hakkavad-uued-infoturbenouded). Conversely, accessibility is only `recommended` in this CFR file, but government public services have separate accessibility obligations. [TTJA guidance](https://www.ttja.ee/avaliku-sektori-digiligipaasetavus).

## What the project currently is

The application implements cascade mini-procurements for a framework agreement: import trainings and framework participants, publish a round to a lot's partners, collect and confirm choices, calculate allocation in framework rank order, review adjustments, and produce a protocol. Formal decisions and new order issuance are currently handled **outside the application** under [L-25](https://github.com/luukasilves/Kaskaadhankija/blob/65d2792b01f5f6d90691443af4ce11d260551fd0/docs/kaskaadi-ariloogika.md). Suspended order code and historical order screens remain. That is an intentional scope decision, not a missing feature to restore automatically.

The implementation is one Next.js 15 process, React 19 and strict TypeScript, with Drizzle and SQLite on a persistent disk. A process timer and lazy reads execute due jobs; SMTP is the only external runtime service. Deployment documentation explicitly prescribes one instance, continuous operation and Recreate upgrades. Authentication uses six-digit email codes and database-backed sessions. There is no TARA, X-tee business integration or separately deployed business API. [Technical overview](https://github.com/luukasilves/Kaskaadhankija/blob/65d2792b01f5f6d90691443af4ce11d260551fd0/docs/tehniline-ulevaade.md).

The strengths are concrete:

- **The business rules are unusually explicit for a pilot.** There are 96 identified rules, worked allocation examples, documented alternatives and named unresolved decisions. This gives a receiving team something testable to discuss.
- **The allocation core is understandable and reusable.** Pure domain functions are separated from persistence and UI, and the same algorithm supports projections and final allocation. Rank, rather than response speed, determines priority.
- **Evidence preservation is taken seriously.** Publication/allocation snapshots, append-only confirmations and audit triggers are meaningful safeguards. Imports have validation and previews, and many mutations use transactions.
- **Testing extends beyond isolated units.** The project has migration, authentication, document and browser workflow tests, plus standalone restart checks.
- **The UI communicates consequential states.** Draft versus confirmed marks and provisional versus final results are generally explained. The operator and partner guides, fictional datasets and deployment notes are useful handover material.

The main maintainability concern is concentration: the round engine is about 2,100 lines and framework management about 1,200. This remains navigable because functions and rules are named, but future changes should split responsibilities around lifecycle boundaries and keep shared invariants in one place. Do not substitute a framework migration for that work.

The interface is functional and consistent, although dense. The framework page combines configuration, representatives and a long change history. At a 390-pixel viewport, the partner page had no whole-page horizontal overflow, but important training columns require scrolling inside the table. That is a usability issue to test with actual partners; a wide data table alone is not sufficient to declare a WCAG reflow failure.

## What ran

| Check | Result and practical limit |
|---|---|
| Frozen dependency installation | Passed with the repository's pnpm 10.33.0. |
| Strict TypeScript | Passed. |
| Existing unit/server suites | **591/591 tests passed across 31 files under Node 22**, matching CI's major version. |
| Production build | Passed locally. |
| Existing browser suites | Authentication, end-to-end procurement, administration and protocol suites all passed in Chrome. |
| Standalone/restart suite | Passed after adapting the local staging layout; forced-kill recovery, unchanged data, migrations, guide assets, PDF generation and production posture checked. |
| Independent domain probes | Six checks passed: five reproduce the documented behaviours below; one verifies rejection of a partner confirmation after the deadline without waiting for a timer tick. A passing reproduction test means a defect was observed. |
| Independent HTTP probes | Authenticated buyer closed a round about 72.6 hours early; authenticated partner changed another partner's notification read status. |
| Dependency scan | 3 high and 9 moderate affected-package advisory entries; 11 distinct GHSA identifiers. Reachability requires triage. |
| Accessibility sample | Axe 4.13 on five pages found contrast, link differentiation and input labelling failures. Several checks remained inconclusive. |
| Lint command | Not configured for unattended use: `next lint` prompts to set up ESLint and exits unsuccessfully in this run. |

There were two environment qualifications. The host's Node 24.12.0 decoded Windows-1252 control-range bytes incorrectly, causing two initial PDF tests to fail; they passed under Node 22. The project should define and test supported Node versions more precisely than `>=22`. Separately, an unrelated ancestor lockfile made Next choose a tracing root above this checkout, nesting the standalone server. The unmodified standalone script initially failed to find `server.js`; a review-only staging adaptation preserved all original checks and passed. No Docker/Podman engine was available, so this verifies the standalone bundle, **not a Linux container boot**. The existing GitHub [CI run](https://github.com/luukasilves/Kaskaadhankija/actions/runs/34842038213) was successful for the reviewed commit.

Published evidence: [execution and reproduction summary](evidence-summary.md). Raw execution logs, disposable databases and local screenshots remain in the review workspace. Evidence filenames in the workbook/CSV identify those original outputs; their relevant results and limitations are recorded in the published summary.

## Findings to address before live use

### F1 — A buyer can close a round before the response deadline

**High priority; reproduced through HTTP and at the domain boundary.** `closeRoundIfDueAction` calls `closeRound` without checking whether the deadline has passed. The engine only checks that the round is open. The Server Action is present in the built application even though an ordinary user may never see a button for it.

In a local production-mode instance, an authenticated buyer submitted the action for a round whose deadline was roughly three days away. The request returned HTTP 200 and persisted `status=closed`, with `closed_at` preceding `deadline_at` by 261,340,733 ms. This freezes a premature proposal and ends partners' ability to answer. Buyer authority to administer a procurement does not remove the promised response window.

**Change:** enforce `ctx.at >= deadlineAt` inside `closeRound`, in the same transaction as the state change. Keep any deliberately different administrative operation separate and explicitly governed. Add direct-action and engine regression tests. Related CFR: #10, #33, #44.

Code: [engine.ts:1180](https://github.com/luukasilves/Kaskaadhankija/blob/65d2792b01f5f6d90691443af4ce11d260551fd0/src/server/rounds/engine.ts#L1180), [rounds-buyer.ts:366](https://github.com/luukasilves/Kaskaadhankija/blob/65d2792b01f5f6d90691443af4ce11d260551fd0/src/server/actions/rounds-buyer.ts#L366).

### F2 — Notification read status is not scoped to the recipient

**Medium priority; reproduced through HTTP.** `markNotificationReadAction` authenticates a partner, then updates a notification using its ID alone. The query does not constrain recipient kind or partner ownership. In the independent test, partner A posted partner B's notification ID and changed B's `read_at` from null to a timestamp; the response was HTTP 200.

This requires knowing a valid notification ID. The test obtained it from the disposable database; I did not establish a normal UI disclosure path for other partners' IDs. The confirmed impact is alteration of read status, not reading the notification body or changing an allocation.

**Change:** make the update conditional on the authenticated partner's permitted recipient memberships and return failure when no permitted row matches. Check buyer-side policy separately. Test with valid IDs belonging to another organisation. Related CFR: #19, #44.

Code: [rounds-partner.ts:97](https://github.com/luukasilves/Kaskaadhankija/blob/65d2792b01f5f6d90691443af4ce11d260551fd0/src/server/actions/rounds-partner.ts#L97).

### F3 — Committed queued mail is not recovered after an interrupted send

**High operational priority; reproduced by constructing the interrupted state.** Notification and delivery rows are committed, but initial dispatch uses `ctx.outbox` in process memory. Automatic retry selects only `failed` deliveries. A process exit after commit and before the first attempt leaves a durable `queued` row that the scheduler never picks up.

The probe created a queued delivery dated 24 hours earlier, discarded the in-memory outbox, and ran retry processing. Zero deliveries were selected; the row remained `queued`, with zero attempts. This models the crash window rather than claiming a real SMTP server was fault-injected. The in-app notice survives, and a buyer can manually resend; the promised automatic email delivery does not recover.

Foreground requests also await sequential dispatch after commit. Slow SMTP can therefore leave users waiting after a successful business mutation, with latency accumulating across recipients.

**Change:** let a durable worker select queued and retryable deliveries from storage, claim them, recover expired claims and record outcomes. Make duplicate delivery handling explicit: SMTP cannot guarantee exactly-once delivery after a crash. Add backlog alerts and a fault test around commit/send/status-write boundaries. Related CFR: #8, #16, #26, #64.

Code: [notify.ts:73](https://github.com/luukasilves/Kaskaadhankija/blob/65d2792b01f5f6d90691443af4ce11d260551fd0/src/server/notify.ts#L73), [notify.ts:195](https://github.com/luukasilves/Kaskaadhankija/blob/65d2792b01f5f6d90691443af4ce11d260551fd0/src/server/notify.ts#L195), [action helpers](https://github.com/luukasilves/Kaskaadhankija/blob/65d2792b01f5f6d90691443af4ce11d260551fd0/src/server/actions/helpers.ts).

### F4 — The protocol integrity check does not consult its original audit hash

**High evidentiary priority; requires database write access.** `getRoundProtocol` hashes the stored content and compares it with `content_hash` in the same mutable row. Although protocol generation records the original hash in the append-only audit table, reading the protocol never compares against that original hash. Protocol rows deliberately lack append-only triggers to support a test scenario.

The probe generated a protocol, altered its round code directly in the test database, and recomputed its stored hash. The original audit hash remained unchanged, yet `getRoundProtocol` returned `intact=true`. This is not an unauthenticated remote-edit exploit. It is a failure of the claimed tamper-detection boundary, relevant to accidental maintenance changes or someone with storage access.

**Change:** enforce production immutability and validate against the original protocol-generation event; keep test setup accommodations out of production integrity policy. Store the trusted audit anchor outside the application database as required by CFR #41. A database administrator can otherwise change or replace the whole database. Related CFR: #41, #46, #55.

The PDF also overstates what its printed fingerprint proves. The fingerprint identifies canonical data, not the PDF bytes: someone can edit a PDF and leave the printed hash unchanged. External signature/archival procedures should authenticate the actual issued document. The application currently does not ingest that signed result.

Code: [protocol.ts:517](https://github.com/luukasilves/Kaskaadhankija/blob/65d2792b01f5f6d90691443af4ce11d260551fd0/src/server/rounds/protocol.ts#L517), [protocol.ts:549](https://github.com/luukasilves/Kaskaadhankija/blob/65d2792b01f5f6d90691443af4ce11d260551fd0/src/server/rounds/protocol.ts#L549), [schema.ts:913](https://github.com/luukasilves/Kaskaadhankija/blob/65d2792b01f5f6d90691443af4ce11d260551fd0/src/db/schema.ts#L913), [PDF wording](https://github.com/luukasilves/Kaskaadhankija/blob/65d2792b01f5f6d90691443af4ce11d260551fd0/src/server/documents/protocol-pdf.ts#L642).

### F5 — Login places personal data in the URL

**Medium priority; direct CFR #42 failure.** Successful code requests redirect to `/sisene/kood?e=<email>`. Encoding the address does not remove the personal data. It becomes part of browser history and potentially proxy/access logs.

**Change:** use server-side challenge state or an opaque reference, without including the email or session secret in the URL. Verify both success and error redirects. Code: [auth.ts:116](https://github.com/luukasilves/Kaskaadhankija/blob/65d2792b01f5f6d90691443af4ce11d260551fd0/src/server/actions/auth.ts#L116).

### F6 — Secret-rotation instructions promise session revocation that does not happen

**Medium operational priority; reproduced.** The deployment guide repeatedly says rotating `AUTH_SECRET` logs everyone out. Session tokens are actually stored and resolved using an unkeyed SHA-256 hash; the secret only participates in login-code hashing. An existing session remained valid after the probe changed `AUTH_SECRET`.

**Change:** document and test an explicit revoke-all-sessions procedure, or introduce a session epoch/key binding with defined rotation semantics. Do not tell an incident responder that secret rotation invalidates stolen sessions when it does not. Code: [codes.ts:153](https://github.com/luukasilves/Kaskaadhankija/blob/65d2792b01f5f6d90691443af4ce11d260551fd0/src/server/auth/codes.ts#L153), [session resolution](https://github.com/luukasilves/Kaskaadhankija/blob/65d2792b01f5f6d90691443af4ce11d260551fd0/src/server/auth/codes.ts#L390), [deployment instructions](https://github.com/luukasilves/Kaskaadhankija/blob/65d2792b01f5f6d90691443af4ce11d260551fd0/docs/juurutamine.md#L133).

A lower-priority authentication finding: after requesting two codes and consuming the newer code, the older unconsumed code becomes usable again. Each code is still single-use and expires; this is not an unlimited guessing bypass. Supersede earlier outstanding codes on issuance or successful login to give users and operators predictable recovery semantics.

### F7 — Accessibility failures affect primary actions

**Medium implementation priority; required for public-service acceptance.** White text on primary blue buttons measured **2.53:1**, below the 4.5:1 threshold for their normal-sized text. Failures occurred on sign-in, partner confirmation and framework administration. The hidden native file input has no accessible name, and some links rely solely on colour to distinguish them from surrounding text.

**Change:** adjust the shared button colour/text treatment, explicitly label the file input, and add durable link differentiation. Then test keyboard flow, screen readers, zoom, error announcements and all relevant states. Axe found no violations on two sampled pages, but one of those had unresolved contrast checks; this is not a conformance claim.

The three-page sample protocol is generally readable, with a minor wrapped table heading. It has no tagging structure or document language metadata; PDF accessibility needs additional work and testing. The [evidence summary](evidence-summary.md#protocol-inspection) records the sample inspection; the synthetic PDF remains in the review workspace.

Code: [globals.css](https://github.com/luukasilves/Kaskaadhankija/blob/65d2792b01f5f6d90691443af4ce11d260551fd0/src/app/globals.css), [upload-drop-zone.tsx:61](https://github.com/luukasilves/Kaskaadhankija/blob/65d2792b01f5f6d90691443af4ce11d260551fd0/src/components/upload-drop-zone.tsx#L61). Related CFR: #39; [TTJA public-sector requirements](https://www.ttja.ee/avaliku-sektori-digiligipaasetavus).

## Government handover gaps beyond individual bugs

**Identity and authority — CFR #18, #30, #52.** Email OTP proves mailbox control, not a national identity or authority to bind a company. The baseline expressly requires TARA unless separately justified and prohibits creating a new identity system. Agree the identity architecture with the receiving team. National authentication does not itself solve company representation: the application still needs a governed mapping from verified people to partners and roles.

**Audit and information governance — #41, #43, #55–62.** The local transactional audit is valuable but does not meet independent audit storage. Establish classification, record versioning, retention, controller responsibilities, RIHA applicability, data dictionary, Data Tracker applicability, quality indicators and exports. The presence of names, emails, IP addresses and confirmation evidence makes these concrete responsibilities. Some apply to an agency or a wider information system; missing repository evidence is not proof that the agency has failed them.

**Release assurance — #6, #9–12, #40, #63.** There is no declared software licence. Security testing and required human approvals need acceptance evidence. CI is useful, but the Fly test-deploy workflow runs independently and has no dependency on the CI result for the same commit. This does not prove that failing code has reached government production; it means this workflow cannot be adopted as the production gate unchanged. Add browser acceptance, vulnerability/secret/image scanning, and noninteractive static analysis with sensible exceptions.

The dependency scan requires prompt triage. Nodemailer 9.0.5 is below the patches for four reported advisories, including a high-severity address-parsing denial of service; the scan's combined fix floor is 9.1.1. [Maintainer advisory for the high-severity issue](https://github.com/nodemailer/nodemailer/security/advisories/GHSA-2x7j-588g-ccc2). PostCSS 8.4.31, pulled through Next, has four advisories, two high; scan-reported patches extend to 8.5.23. [PostCSS maintainer advisory](https://github.com/postcss/postcss/security/advisories/GHSA-6g55-p6wh-862q). Other entries involve UUID and development tooling (esbuild, Vitest and its mocker). These are affected dependency versions, **not twelve proven remotely exploitable flaws**. For example, the application does not accept uploaded CSS and restricts email syntax. Upgrade compatible versions and retest; document reachability and accepted residual risk rather than blindly forcing major overrides.

**Availability and operations — #4, #7, #8, #13–16, #26, #47–48, #64.** A small, single-instance SQLite service can be an appropriate engineering choice for this volume. It does not meet the CFR's stated multi-instance, autoscaling and two-site availability expectations. Obtain an explicit availability decision with RPO/RTO and maintenance windows. If those expectations are mandatory for this service, persistence and job coordination need design work. Simply adding a second application replica is unsafe.

The documented backup command uses a consistent SQLite backup, which is good. Demonstrate recovery from an independent backup, not just a restarted process. Provide real monitoring, alert recipients, disk/backlog thresholds, deployment manifests, private dependency mirrors and a maintenance plan. Node 22 reaches EOL on **30 April 2027**, so the five-year support rule is plainly unsatisfied without an agreed lifecycle approach. [Official Node release schedule](https://github.com/nodejs/Release).

The local app omits several security headers and uses HTTP; the guide assigns TLS/HSTS and headers to the proxy. Therefore those controls are **unverified at the actual deployment**, rather than automatically absent. The documented internal proxy-to-app HTTP hop and optional SMTP TLS still require explicit review against #47–48. The proxy must overwrite trusted forwarding headers, because the app uses the client IP for evidence and rate limits.

**Architecture and reuse — #5, #20–27.** The domain layer is a good starting point, but there is no stable reusable REST API or generated API contract, and the service is not a microservice system. Request proportionate exceptions where no consumer needs those capabilities. Likewise, TypeScript is outside the literal top-25 language rule at the review date (39 in the September 2026 index), despite JavaScript being inside it. That calls for a documented interpretation or exception supported by maintainability evidence, not an automatic language rewrite. [TIOBE index](https://www.tiobe.com/tiobe-index/).

**Business acceptance remains open.** The specification itself leaves questions about changing marks, buyer adjustments, workload definition, review timing, working versus calendar days and handling a closed round that should not allocate. Have the agreement owner resolve L-01, L-05, L-07, L-09, L-10 and L-12. Reconcile older README/worked-example claims about order creation with L-25, and record the operational step by which a signed external decision and any subsequent correction are linked back to a round. This review does not determine compliance with the underlying framework agreement or procurement law.

## CFR results

| Assessment | All 67 entries | Active 62 | Mandatory 19 |
|---|---:|---:|---:|
| Met | 9 | 9 | 5 |
| Partially met | 27 | 26 | 5 |
| Not met | 20 | 18 | 6 |
| Unverified | 6 | 6 | 3 |
| Not applicable | 5 | 3 | 0 |

“Met” is scoped to available evidence, not a certification. “Partially met” means there is relevant implementation with remaining gaps. “Unverified” means evidence is missing. “Not applicable” is conditional on the current service boundary. No overall compliance percentage is calculated because these distinctions and the source levels matter more than an aggregate score.

The six unmet mandatory entries are **#6 licence, #10 known weaknesses, #18 TARA, #30 identity reuse, #41 external audit storage, and #42 personal data in URLs**. The five partial mandatory entries are **#12 release test gate, #47 TLS, #55 record versioning, #62 exports and #64 external-failure resilience**. The three unverified mandatory entries are **#9 preproduction security testing, #43 security classification/control baseline and #57 RIHA publication**. The remaining five mandatory entries have positive evidence: **#1 Git, #2 maintainable code, #28 environment configuration, #50 Unicode storage and #63 no secrets found in the reviewed tracked source**. The last is a bounded pattern scan, not a certification of Git history or deployed secrets.

## Recommended acceptance sequence

1. **Make the current pilot trustworthy.** Fix F1–F7, triage and patch dependencies, add focused negative/fault tests, correct the operational instructions and reconcile the business documentation. Keep changes small and independently reviewable.
2. **Agree the government operating model.** Receiving architecture, security and service owners decide identity, company representation, audit retention/storage, availability exceptions, platform ownership, data governance and the formal external-decision workflow. Give each accepted CFR exception an owner, rationale, compensating measures and review date.
3. **Prove the proposed production release.** Build through controlled dependencies; pass checks on the exact release artifact; run risk-based security testing, accessibility assessment, supported-browser tests, a restore exercise and a load test at at least twice agreed peak demand. Exercise SMTP outage, interrupted sends, deadline processing and session revocation.
4. **Accept handover against evidence.** Deliver licence/rights, source and build provenance, manifests, runbooks, alert routing, recovery results, security findings and disposition, data documentation, business decisions and a prioritised residual backlog. Name the team responsible for dependency updates and incidents.

I would preserve the domain core, specification and test investment. The immediate risk is that a convincing demo and a green test suite are mistaken for production acceptance. The project is far enough along to deserve a disciplined handover process; the defects and missing evidence above are the work that process must close.
