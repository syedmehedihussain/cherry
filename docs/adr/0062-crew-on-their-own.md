# 0062 — The crew works on its own: required checks, job hints and the Crew panel

- **Status:** Accepted
- **Date:** 2026-11-09
- **Decided by:** Meddy

## Context

ADR-0061 bundled ECC specialists and skills in every room. In the first real run with them
(water-demo, 2026-11-09) no room used a specialist or opened a skill unless the user asked. When
asked, they found real problems: invisible icons and a broken dark mode (a11y-architect), and
storage and CSP gaps (the reviewers). The user wants the agents to use their skills and
specialists on their own, in an efficient way, and to see them in a sidebar.

## Options

1. **Stronger prompt wording only.** Trade-off: free, but the run showed agents skip optional
   steps on small jobs.
2. **Required checks Cherry enforces, plus hints and a panel, with no model call.** Trade-off: a
   few more Sonnet subagent runs per stage (10-40 s each), a small SQLite table.
3. **A model picks the crew for each job (a Haiku call).** Trade-off: better matching, but
   every message would start a model call nobody clicked (ADR-0055 forbids it).

## Decision

We chose **option 2**:

- **Required checks** in each room's AGENT.md front matter (`requires:`, `a|b` = either):
  Design `a11y-architect`; Development `code-reviewer|typescript-reviewer|react-reviewer`;
  Testing `security-reviewer`. `stage_ready` refuses until one of each has run in the current
  cycle (Development's prototype step is exempt). Plan's Opus specialists stay optional.
- **Runs are recorded** in `specialist_runs` (migration 011) when a subagent finishes; the tool
  use id keeps replays from counting twice.
- **Job hints:** after each message Cherry adds one line naming up to three skills and two
  specialists whose name and description share words with the message. Plain keyword matching
  in `@cherry/shared` (`suggest`), no model call; nothing for slash commands.
- **The system prompt** tells every room to use its skills and specialists on its own, in the
  foreground, and names the stage's required checks.
- **Crew panel:** a Crew tab in each room (in the docs sidebar; next to the chat in Design and
  Deployment) shows the required checks with their state, the specialists with model and runs,
  and the skills, with "fits this job" on the matches for the last message. A click only puts a
  line in the message box (ADR-0055: every model call starts from a click).

## Consequences

- Good: every Design, Development and Testing stage gets at least one specialist check; agents
  see which skills fit without reading all of them; the user sees the crew and what ran.
- Bad / cost: a few extra subagent runs per stage; keyword matching misses synonyms and can
  suggest a near miss (it is a hint, not a rule). Runs from before this change are not counted.
- Follow-up: a real run to see how often the hints are followed and what the checks cost; tune
  the word lists or the `requires:` lines from that.

## Tuning after the crew run (2026-11-09)

The water-demo 1.1 run checked this. Changes from it:

- The required checks worked: Design ran a11y-architect after `stage_ready` refused (5 fixes),
  Development ran typescript-reviewer and security-reviewer on its own. The check came last, so
  the system prompt now says to run it before the agent's own last browser check.
- Hints: Design and Testing opened the skills named; Plan used none. A hint now needs two shared
  words, and "write", "tell" and "ready" are stop words (one word gave "write-a-skill" and
  "handoff" in Development).
- Claude Code deferred Cherry's tools behind tool search, and no room called TaskCreate or
  ask_decision. The `cherry` MCP server is now `alwaysLoad`; the prompt says to load TaskCreate
  and TaskUpdate with ToolSearch first.
- In a later version, Development's prototype step now says the app exists and the first build
  of the change is the prototype.
- `requires:` stays as it is.
