# 0033 — Serious commands ask instead of being blocked

- **Status:** Accepted
- **Date:** 2026-10-22
- **Decided by:** Meddy

## Context

`sudo`, `curl … | sh`, `rm -r` outside the project and force-pushing to main were refused
outright, with no card. In practice that blocked real work: deleting a folder next to the project
or running a root command meant leaving Cherry for a terminal. The user wants to decide.

## Options

1. **Keep the hard block** — safest. Trade-off: the user cannot do legitimate work from Cherry.
2. **Treat them as normal commands** — simplest. Trade-off: Auto mode and "Allow for this
   session" would run them without a look.
3. **Ask with a warning, every time** — the card says why the command is serious, Auto mode still
   asks, and no session rule covers it.

## Decision

We chose **3**. `classifyCommand` now marks these commands serious with a reason. The chat shows
"Claude wants to run a serious command" with the reason in red and only Allow and Deny. Background
agents (nobody watching, ADR-0028) skip them like a push and list them under Needs you.

## Consequences

- Good: the user can run them from Cherry after looking at them.
- Bad / cost: one wrong click runs a destructive command. The red warning and the missing session
  allow are the guard.
- Follow-up: edits outside the project and secret files stay blocked by the path and secret
  guards.
