# Query sheet — Juhend koolitajale

What the guide could not settle on its own. Each item is a decision for the
buyer team or for whoever owns the framework agreement; the guide is written so
that none of them blocks sending it. Item 1 was the exception and is now
resolved; items 2 and 3 are inconsistencies in the application that writing the
guide exposed, and item 4 is the list of numbers the guide deliberately omits.

## 1. A real bidder could not receive a sign-in code — **resolved**

*Was blocking.* Sign-in codes go through `sendMail`, which suppressed any
address `EMAIL_ALLOWED_RECIPIENTS` did not name — and the deploy defaulted that
list to the buyer's and the tool team's domains. A partner writing from their own
company domain got no code at all, and the attempt was recorded as *suppressed*.
Nothing in the pilot worked until somebody remembered to edit a secret.

**Resolved in v2.5 of the specification [L-19]:** the allowed recipients are now
the framework's own contacts — every active representative and every active lot
contact, derived by `frameworkRecipients` in `src/server/recipients.ts` — *plus*
whatever `EMAIL_ALLOWED_RECIPIENTS` names, which is left for the people the
framework does not contain (the buyer's team, testers). Uploading the framework
workbook is now the whole onboarding step.

Two consequences worth knowing:

- **Deliveries already suppressed stay suppressed.** `retryEligible` only
  retries a `failed` row, deliberately — widening it would re-send old notices
  on the next jobs tick. Anything suppressed before the change is re-sent by
  hand from the notification log.
- **A typo in an uploaded contact address now reaches a real mailbox** instead
  of being suppressed. The framework import's address validation is what stands
  between the two.

## 2. The application uses three words for the test environment

- the badge says **TESTKESKKOND** (`src/app/sisene/page.tsx`)
- the strip says **„Katsetuskeskkond raamlepingu voorude läbimängimiseks“**
  (`src/components/test-strip.tsx`)
- the guide's prose says **katsekeskkond**

The guide quotes the badge verbatim, because the reader has to recognise it on
screen, and uses a normal noun in the prose. But one thing should have one name.
Worth picking one before the pilot rather than after.

## 3. The four display-state labels are *sina*, everything around them is *teie*

`TRAINING_VIEW_STATE_LABELS.projected_to_you` is „Prognoosis sinule“ and the
reason suffix is „üle sinu piirmäära“, because that is how the specification's
[N-03] table wrote them. Every other bidder-facing string is *teie*.

The guide quotes them verbatim — a repaired quote would send a reader looking
for words that are not on the screen — so the guide is consistent and the
**labels** are the anomaly. Changing them means changing [N-03] in the spec
first, then `round-statuses.ts`. Not the guide's call.

(Two lesser instances of the same slip *were* fixed while writing this guide,
because the guide quotes those screens: `marking-form.tsx` said „saad märkida“
and the order document said „kasuta brauseri prindifunktsiooni“.)

## 4. Numbers the guide deliberately does not state

Each would become a promise the moment it appeared:

| what | why not | if it is settled |
|---|---|---|
| the response window (`3 tööpäeva`) | per-lot data, and **[L-10]** — working or calendar days — is unresolved | the guide could state the rule, not the number |
| the workload threshold (`25`) | per-lot; the seeded test value is 4 **[T-03][L-14]** | probably still omit: it is the buyer's warning level, not the partner's limit |
| the buyer's decision time (`2 tööpäeva`) | **[L-09]** unresolved | the guide could state it |
| the 75-participant workshop ceiling | a framework property the app deliberately does not enforce **[K-06]** | belongs in the agreement, not here |

The guide says instead that the deadline is on the round page and in every
notice. `juhend.test.ts` enforces the omission, so lifting one is a deliberate
edit in two places.

## 5. Should the round-published notice link to the guide?

It would be the most useful placement — the notice is what a bidder actually
opens. But `src/domain/round-templates.ts` is copy the procurement team
reviewed, so adding a line to it is their decision, not a code change to slip
in. The guide is currently reachable from the sign-in page and from a signed-in
partner's own navigation.

## 6. Indexing, at go-live

`src/app/layout.tsx` sets `robots: { index: false, follow: false }` for the whole
application, and `/juhend` restates it deliberately. Right for a pilot. But
"public page" and "findable page" are different things, and a bidder who loses
the e-mail cannot search for it — worth revisiting when the pilot ends.
