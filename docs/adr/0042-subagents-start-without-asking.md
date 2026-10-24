# 0042 — Subagents start without asking

- **Status:** Accepted
- **Date:** 2026-10-24
- **Decided by:** Meddy

## Context

The chat should feel like the Claude Code CLI (V2.1 w7). Claude starts subagents with its Task
tool (Agent in newer Claude Code). Cherry asked for an approval card before each one, as for any
unknown tool, and the chat showed nothing of what the subagent did. The CLI starts subagents
without asking and shows one row with their progress. A subagent's own tool calls go through the
same permission check as the main agent's, so its edits and commands still ask.

## Options

1. **Keep the approval card** for Task. Trade-off: one extra click per subagent, unlike the CLI,
   and it adds nothing because the risky steps inside ask anyway.
2. **Start subagents without asking** (Task and Agent join the read-only allow list); show them as
   one row with their step count and current step, and as a card in Live. Trade-off: a subagent
   can read files and use read-only tools without a card, as the main agent already can.

## Decision

We chose **2** because it matches the CLI and keeps every edit and command behind the same
approvals, Auto rules and serious-command warnings (ADR-0025, ADR-0033).

## Consequences

- Good: no card for starting a subagent; the chat row and the Live card show what it is doing.
- Bad / cost: subagent steps are not rows of their own; only the count, failures and the current
  step show.
- Follow-up: background agents use the same allow list, so they start subagents without asking too.
