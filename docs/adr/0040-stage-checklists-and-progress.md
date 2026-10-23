# 0040 — Each stage has a checklist its agent keeps, shown as progress

- **Status:** Accepted
- **Date:** 2026-10-23
- **Decided by:** Meddy

## Context

The Overview said "3/15 tasks" across the whole project and nothing about the open stage. The
user wanted each stage to say how far it is ("Plan is 80% done, this is left") and to move on
when it is done, with Claude working that out from the conversation and the project files, not
from a fixed list.

## Options

1. **Parse the docs** (does prd.md have a Scope section?) — Trade-off: brittle, and blind to
   what was agreed in the chat.
2. **Ask Haiku to grade the stage on a timer** — Trade-off: automatic Claude calls (rule 10)
   and numbers that jump around.
3. **A checklist per stage that its agent keeps current while it works** — Trade-off: the bar
   is only as good as the agent's updates; Recheck fixes a stale list on click.

## Decision

We chose **3**. The checklist is the stage's phase items in `_project/tasks.json` (no format
change). Project chats get a Cherry tool, `stage_checklist`, with `add`, `done` and `drop`
for the open stage only; it runs without approval (Cherry's own file). The chat prompt tells
the agent to read it first, add what is left, tick what the files cover, drop what does not
apply, and never tick what the files do not show. New projects start with a preset list per
stage (Plan: problem and users, v1 scope, requirements, stack ADR, risks, first milestone).

Progress = finished (done or dropped) / all items; Preparation also counts its readiness
checks; Issues shows open / planned / done counts. The Overview card shows the bar, what is
left (a click asks the agent about one), **Recheck** (asks the agent to re-read and update,
on click) and, at 100%, **Move to <next stage>** (`PATCH /api/projects/:id/phase`, opens the
next stage with a handoff message in the composer). Each stage tab has a thin progress line.

## Consequences

- Good: the bar moves while you talk, with no extra Claude call.
- Good: Development progress is its tasks, so adding tasks lowers it and finishing them fills it.
- Bad / cost: projects made before this keep their old preset items until the agent edits them.
