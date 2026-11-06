# 0055 — Every model call starts from a click

- **Status:** Accepted
- **Date:** 2026-11-06
- **Decided by:** Meddy
- **Amends:** 0022 (small automatic Haiku jobs are no longer allowed)

## Context

ADR-0022 let small capped Haiku jobs run alone (tidy a note, draft a `.gitignore`, the handoff
note between stages). V4 promises that nothing runs without the user, who is on a $20 plan.

## Options

1. **Click only, no exceptions.** Trade-off: a few conveniences need one more click.
2. **Keep small automatic Haiku jobs.** Trade-off: convenient, but the promise has exceptions.

## Decision

We chose **1**. Every model call, Haiku included, starts from a user action: a message, a job, or
a button such as **Write message**. Views that summarise work (stage cards, the Meeting reports,
Claude usage, Invoice) are built from files and stored state, with no model call.

## Consequences

- Good: one simple promise; token use is predictable.
- Bad / cost: the automatic handoff note (r12) and the automatic note tidy are removed or moved
  behind a button.
- Follow-up: CLAUDE.md rule 10 updated; o4 removes the automatic jobs.
