# 0043 — Always allow here, per project

- **Status:** Accepted
- **Date:** 2026-10-24
- **Decided by:** Meddy

## Context

The Claude Code CLI lets you say "Yes, and don't ask again" for a command in a project. Cherry
only had Allow and Allow for this session, so a project's everyday commands (the test runner, the
linter) asked again in every new chat. Cherry runs Claude without settings files (ADR-0004), so
the CLI's own allow rules do not apply; Cherry has to keep its own. Serious commands must keep
asking every time (ADR-0033), and pushing, publishing and destructive git must keep asking even
in Auto (ADR-0025).

## Options

1. **Exact command per project, in SQLite** — "Always allow here" stores `run:<command>` or
   `tool:<name>` for the project. Trade-off: `npm test -- foo` is a new command and asks once.
2. **Command prefix rules like the CLI's `npm test:*`.** Trade-off: a prefix can let a longer,
   different command through (`npm test; rm -r x`), and needs a parser we would have to trust.
3. **Write the CLI's `.claude/settings.local.json`.** Trade-off: Cherry ignores settings files on
   purpose; it would also bypass Cherry's approvals in every other tool.

## Decision

We chose **1** because an exact match cannot let anything else through, and it covers the
commands that repeat. Edits are never remembered for good (Allow for this session stays), and the
card does not offer it for serious commands or the ones Auto still asks for. The daemon refuses
`allow_always` on such a card.

## Consequences

- Good: the test runner and linter stop asking once you say so; it carries over to new chats and
  to background agents of the same project.
- Bad / cost: variants of a command ask once each.
- Follow-up: Settings → Permissions lists the rules per project and removes them; `/permissions`
  opens it.
