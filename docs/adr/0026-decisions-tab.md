# 0026 — Decisions tab: big project choices wait for the user as Proposed ADRs

- **Status:** Accepted
- **Date:** 2026-10-15
- **Decided by:** Meddy

## Context

Some changes are bigger than an edit or a command: "move the database to SQL", "rename Apeiron
to Cherry". The approval cards (ADR-0004) ask about one tool call, and `ask_decision` asks a
question that Claude waits on in the chat. Neither keeps a record, and with Auto mode
(ADR-0025) Claude could make such a change with no question at all. The user wants these
choices to wait in one place until they approve or reject them, and wants the project's ADRs
to follow the answer.

## Options

1. **The ADR file is the record; a Decisions view reads it** — no new format to keep in sync,
   and it is committed with the project. Trade-off: adds `Rejected` and two optional header
   lines to the ADR format.
2. **Decisions in SQLite, written to an ADR only when approved** — the ADR folder stays clean.
   Trade-off: the record lives in a cache, rejected choices leave no trace, and another tool
   (Claude Code in a terminal) cannot see what is pending.
3. **Keep using ask_decision** — nothing new. Trade-off: the turn stops until the user answers,
   and nothing is recorded.

## Decision

We chose **option 1**. Claude calls `propose_decision` (chat and agents). Cherry writes a new
ADR with Status Proposed and the next number, and never replaces a file. The tool returns at
once: Claude must not make that change, but it goes on with other work. A **Decisions** tab
in the centre (next to Chat, Docs, Notes & Tasks and Agents) shows the pending count. For each decision, the user picks **Approve
only**, **Approve & apply in chat** (Cherry sends the change to the project chat in the last
mode used) or **Approve & start agent** (a background agent in a worktree), or **Reject** with
a reason.

The four states map to the file:

- **Pending** = Proposed.
- **Approved** = Accepted with `Done: not yet`.
- **Done** = Accepted with a date: the chat calls `decision_done`, or the user accepts the
  agent's work, or clicks Mark done.
- **Rejected** = Rejected with `Rejected because`.

Cherry changes only those header lines. The link from a decision to the chat turn or agent
that applies it is kept in SQLite (`decision_links`).

## Consequences

- Good: big choices are never made silently, even in Auto mode, and every one leaves an ADR.
- Good: older ADRs (Accepted, no Done line) show as done history with no change.
- Bad / cost: Proposed ADRs that are later rejected stay in `docs/adr/` (as Rejected).
- Bad / cost: Claude decides what counts as "big"; the prompt names the kinds (stack,
  database, data format, architecture, renaming, removing a feature).
- Follow-up: let the user write a decision by hand from the Decisions tab.
