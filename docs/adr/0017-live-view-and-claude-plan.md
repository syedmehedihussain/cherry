# 0017 — Live view and Claude's plan

- **Status:** Accepted
- **Date:** 2026-10-11
- **Decided by:** Meddy

## Context

The user wants to see Claude work through a task list one step at a time, in a "Live" view in
the right column. Claude Code already has a checklist: the `TaskCreate` / `TaskUpdate` tools
(a spike on 2026-10-11 showed the CLI offers these, not the older `TodoWrite`). Cherry did not
allow them without approval, so every tick would have shown an approval card.

## Options

1. **Use Claude Code's own task tools** and follow them from the tool calls. Trade-off: the
   list lives in the daemon's memory; a restart clears it.
2. **A Cherry tool that writes tasks to `_project/tasks.json`.** Trade-off: fills the user's
   project task graph with short-lived working steps.

## Decision

We chose **option 1**. The task tools (and `TodoWrite`) run without approval: they only change
Claude's own checklist. A `PlanTracker` per conversation builds the plan from `TaskCreate`
(id from the tool result), `TaskUpdate` and `TodoWrite`; the chat state carries it and a
`chat.plan` event sends each change. These calls no longer add rows to the chat timeline. The
chat system prompt asks Claude to record multi-step work as tasks and finish them one by one.
The Live pill shows Claude's state, what it is doing now, the plan with progress, and running
agents.

## Consequences

- Good: no new tool for Claude to learn; works with Claude Code's normal behaviour.
- Bad / cost: the plan is lost on a daemon restart; background agents' plans are not shown yet.
- Follow-up: show each agent's plan in the Live view.
