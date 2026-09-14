# Evidence summary for the independent review

**Review date:** 14 September 2026. **Review model:** GPT-6 Astra (`gpt-6-astra`),
via OpenAI Codex. **Reviewed commit:**
[`65d2792b01f5f6d90691443af4ce11d260551fd0`](https://github.com/luukasilves/Kaskaadhankija/tree/65d2792b01f5f6d90691443af4ce11d260551fd0).

This accompanies the [independent review](independent-review.md) and
[CFR workbook](cfr-matrix.xlsx). It summarises execution evidence retained in the
review workspace. Raw logs, disposable databases, local screenshots, synthetic
PDFs and tool/runtime metadata are not included in this publication. Filenames
below are identifiers for the original evidence, not repository download links.

Application source was unchanged during the review. Browser tests ran against
local disposable instances with fictional data and external email disabled.
The public Fly deployment was not mutated or attacked. No Linux container boot,
formal penetration test, full accessibility audit or government infrastructure
inspection was completed.

## Execution results

| Original evidence identifier | Result | Qualification |
|---|---|---|
| `typecheck.log` | Strict TypeScript check passed | Successful command produced no output. |
| `unit-tests-node22.log` | 591 tests passed across 31 files | Node 22 matched CI's runtime major version. |
| `unit-tests.log` | Initial Node 24 run: 589 passed, 2 failed | The host runtime's Windows-1252 decoding caused two PDF test failures; both passed under Node 22. |
| `build.log` | Production build passed | An ancestor lockfile changed Next's inferred tracing root. |
| `browser-suites.json` | Authentication, end-to-end, administration and protocol suites passed | Original standalone check initially failed on the nested local tracing layout. |
| `standalone-adapted.json`, `verify-standalone-local.log` | All original standalone checks passed after a review-only staging adaptation | Forced-kill recovery, unchanged data, migration behaviour, guide assets, PDF rendering and production posture were checked. This was not a Linux container execution. |
| `lint.log` | Unattended lint did not complete successfully | `next lint` prompted to configure missing ESLint. |
| `basic-secret-license-scan.json` | No licence file or live-looking key/token pattern found | Only a few patterns in currently tracked files; no full-history or deployed-secret audit. `.env.example` was a template. |

The reviewed commit also had a successful
[GitHub CI run](https://github.com/luukasilves/Kaskaadhankija/actions/runs/34842038213).
This is separate from the documentation-publication pull request's checks.

## Independent reproductions

`independent-probes.log` records six passing probes. Five assert that the stated
weakness exists; their passing result must not be read as a production acceptance
result. The sixth checks a deadline safeguard that worked.

| Finding | Observed behaviour | Boundary / prerequisite |
|---|---|---|
| F1: premature closure | An open round closed before its deadline. A production-mode HTTP probe persisted closure 261,340,733 ms early and returned HTTP 200. | Authenticated buyer; direct Server Action request. |
| F2: notification ownership | Partner A changed partner B's notification `read_at` from null to a timestamp; HTTP 200. | Authenticated partner with a valid notification ID obtained from the disposable test database. No ordinary cross-partner ID disclosure path was established. |
| F3: stranded queued mail | A committed delivery dated 24 hours earlier stayed `queued`, with zero attempts; automatic retry selected zero rows. | Models interruption after commit and loss of the in-memory outbox. No real SMTP server was fault-injected. |
| F4: protocol integrity | Altered protocol JSON plus a recomputed stored hash returned `intact=true` while the original audit hash remained unchanged. | Requires database write access; not an unauthenticated remote-edit exploit. |
| F6: secret rotation | An existing session remained valid after changing `AUTH_SECRET`. | Tests the guide's claimed revoke-all behaviour. |
| Earlier OTP reappears | After issuing two codes and consuming the newer one, the older unconsumed code was accepted. | Codes remained single-use and expiring; not an unlimited guessing bypass. |
| Deadline safeguard | A partner confirmation after the deadline was rejected without waiting for a timer tick. | Confirms that this separate server-side deadline guard worked. |

`browser-mutations-confirmed.json` contains the corrected HTTP reproductions.
An initial notification-action request in `browser-independent.json` targeted a
page without the action worker and failed; the correctly targeted request
succeeded. A partner's attempted round closure returned HTTP 500 and did not
change the round; that check does not prove a clean authorization-response
contract. A partner's buyer-only protocol request ended at the sign-in page
after redirects, not at a PDF.

## Accessibility sample

`browser-independent.json` records Axe 4.13 checks on sign-in, buyer dashboard,
buyer round, partner round and framework administration pages.

- Primary buttons had white text on `#6aa9d8`: **2.53:1**, below 4.5:1 for the
  sampled normal-sized text. This affected sign-in, partner confirmation and
  framework forms.
- The file input lacked an accessible name.
- Some inline links relied on colour alone to distinguish them from nearby text.
- Two sampled pages had no reported violations; one still had inconclusive
  contrast checks. Neither result establishes full conformance.
- At a 390-pixel viewport, document scroll width equalled viewport width.
  Training tables still required internal horizontal scrolling; that alone is
  not a finding of WCAG reflow failure.

### Protocol inspection

`sample-protocol.pdf` and `protocol-pdf-inspection.json` describe a synthetic
three-page protocol generated by the application. All pages were visually
inspected. The document was generally readable, with a minor wrapped table
heading, but had no tagging structure or document language metadata. The
printed fingerprint identifies canonical protocol data, not the PDF bytes.

## Dependency advisory snapshot

`dependency-audit.json` recorded **3 high and 9 moderate affected-package/advisory
entries**, with no critical entries. There were **11 distinct GHSA identifiers**;
one advisory appeared against both Vitest and its mocker. These are affected
versions, not twelve confirmed exploitable application flaws.

| Affected package/version | Advisory entries | Scan-reported combined patch floor |
|---|---:|---|
| Nodemailer 9.0.5 | 1 high, 3 moderate | 9.1.1 |
| PostCSS 8.4.31 via Next | 2 high, 2 moderate | 8.5.23 |
| UUID 8.3.2 via ExcelJS | 1 moderate | 11.1.1 |
| esbuild 0.18.20 in development tooling | 1 moderate | 0.25.0 |
| Vitest 3.2.7 and `@vitest/mocker` 3.2.7 | 2 moderate package entries, same advisory | 4.1.11 |

Compatibility and application reachability must be assessed before upgrading;
these version floors are not instructions to force arbitrary transitive major
overrides. Primary maintainer references for the high-severity findings include
[Nodemailer](https://github.com/nodemailer/nodemailer/security/advisories/GHSA-2x7j-588g-ccc2)
and [PostCSS](https://github.com/postcss/postcss/security/advisories/GHSA-6g55-p6wh-862q).

## CFR provenance and counts

The reviewed CFR XML is pinned to
[`4d8b69cb1777952f92310adda22edb95bace4467`](https://koodivaramu.eesti.ee/e-gov/cfr/-/blob/4d8b69cb1777952f92310adda22edb95bace4467/cfr.xml),
last changed on 1 December 2022. The original levels are preserved.

| Assessment | All entries | Active | Mandatory |
|---|---:|---:|---:|
| Met | 9 | 9 | 5 |
| Partially met | 27 | 26 | 5 |
| Not met | 20 | 18 | 6 |
| Unverified | 6 | 6 | 3 |
| Not applicable | 5 | 3 | 0 |
| **Total** | **67** | **62** | **19** |

Active excludes four draft entries and one deprecated entry. Mandatory includes
18 `required` entries and #18 labelled `kohustus`. Counts describe the available
evidence and scope; they are not a certification percentage. The workbook was
checked for all 67 unique IDs, reconciled counts, valid XLSX structure and no
formula-error cells, and its overview and matrix excerpt were visually reviewed.
