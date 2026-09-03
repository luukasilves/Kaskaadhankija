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
