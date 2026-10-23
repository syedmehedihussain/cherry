# 0041 — Approve plan: the Planner hands a plan to Development in one click

- **Status:** Accepted
- **Date:** 2026-10-23
- **Decided by:** Meddy

## Context

The user wants a habit: when a bigger idea comes up during development, go to Plan, say "next I
want X", plan it with the Planner, approve, and have Development start building. Before this
the Planner ended with "open Development", the user switched tabs and typed what to build, and
the Plan chat asked for approval on every doc it wrote even though the Planner can only write
docs (ADR-0034).

## Options

1. **Keep the hand-over in words** — Trade-off: the user retypes the plan for the Builder.
2. **A plan card from the Planner with Approve plan** — Trade-off: one more chat item kind and
   a Claude turn that starts on a click.

## Decision

We chose **2**.

- The Plan chat gets a Cherry tool, `propose_plan` (`title`, `summary`, `spec`, `tasks` in
  build order). The spec must exist in the project. It adds a `plan` chat item; the prompt and
  the Planner's AGENT.md tell it to call this when the spec or PRD and the milestone are written.
- The card shows the tasks and the spec with **Approve plan** and **Keep planning**.
- **Approve plan** (`POST /api/projects/:id/chat/plans/:itemId/approve`): the tasks join
  Development in `tasks.json` (additions only, chained), open Plan items are marked done,
  `project.json` moves to `development`, and the Development chat is sent "Build the approved
  plan … work through tN to tM, test each, tick it with stage_checklist" in **Auto**. The
  browser switches to Development and Live. The click is the user's go-ahead for that turn
  (rule 10). Refused while the Development chat is busy.
- **Keep planning** marks the card dismissed; nothing else changes.
- Docs-only stages (Plan, Design, Issues) open their chat in **Auto**: the stage guard already
  blocks code edits, so Auto only skips the cards for docs. The mode is now remembered per
  project and stage.

## Consequences

- Good: plan → approve → build is one loop, and the Development bar (ADR-0040) shows the plan
  being built.
- Bad / cost: the Builder runs in Auto after Approve; push, publish and serious commands still
  ask (ADR-0025, ADR-0033).
