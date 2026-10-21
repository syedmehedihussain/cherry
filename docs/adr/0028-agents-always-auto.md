# 0028 — Background agents always run in Auto and leave push, publish and rm -r for you

- **Status:** Accepted
- **Date:** 2026-10-22
- **Decided by:** Meddy

## Context

A background agent with the Auto switch off (the default) stopped for every command, even `ls`
or `cd`, and waited for someone to click Allow. Nobody watches a background agent, so the work
stood still. With Auto on (ADR-0025) it still stopped and asked for push, publish, deploy and
`rm -r`. The user wants agents to work like an employee: do the job alone, report back, and say
what they could not do.

## Options

1. **Keep the switch, default it to on** — one line change. Trade-off: the agent still waits on
   an approval card for push and publish, and the switch stays a choice nobody wants.
2. **Always Auto; refuse what only the user may do and report it** — no switch, no card from an
   agent. Trade-off: those steps need a follow-up in the main chat.
3. **Always Auto and allow everything** — the agent pushes and publishes too. Trade-off: work
   leaves the machine without a person looking at it.

## Decision

We chose **2**. Every new agent runs in Auto mode. The agent's permission policy refuses the
commands `autoNeedsApproval` names (push, GitHub writes, publish, deploy, `rm -r`) with a reason
that tells Claude to skip the step, finish the rest and list it under "Needs you". The daemon
keeps the skipped commands (`agents.needs_json`). An agent that ends with skipped steps shows
**Needs you**, sends an `agent.needs` notice, and offers **Continue in chat**: a click sends the
branch, the summary and the skipped commands to the project chat, where the normal approvals
apply. Blocked commands keep their own refusal and are never offered. The agent prompt also asks
it to run the tests when the project has them. The chat keeps Ask / Auto / Plan (ADR-0025).

## Consequences

- Good: an agent never waits for a click; the user hears about it through a notification.
- Good: nothing leaves the machine from an agent; push and publish still go through a person.
- Bad / cost: a step like "push the branch" now takes one more click and a chat turn.
- Follow-up: the `auto` field and column stay for older rows and clients; new rows are always 1.
- Amends ADR-0025 (the Auto switch for agents is gone).
