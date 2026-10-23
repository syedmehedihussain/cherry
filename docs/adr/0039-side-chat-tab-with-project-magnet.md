# 0039 — A Chat tab in the side panel: Magnet for this project and the quick add box

- **Status:** Accepted
- **Date:** 2026-10-23
- **Decided by:** Meddy

## Context

The Overview ended with the Task / Note / Agent box (ADR-0016), under the agent list. The user
wanted it in its own side tab next to Overview, Live and GitHub, together with a chat with
Magnet about the open project, without leaving the stage chat in the centre. Magnet had one
conversation for everything (ADR-0011), so questions about one project mixed with the rest.

## Options

1. **Reuse Home's Magnet conversation in the tab** — Trade-off: questions about different
   projects end up in one thread, and the Home panel shows them all.
2. **One Magnet conversation per project, plus Home's** — Trade-off: more sessions rows; a
   project's thread does not see what was asked on Home.

## Decision

We chose **2**. The side panel gets a fourth view, **Chat**: `MagnetChat` for the project on top
(chips: Where are we?, What is left in this stage?, What changed today?) and the quick add box
at the bottom. The Overview keeps the agent list without the box.

Magnet keys its conversations by scope: `home`, or `project:<id>`. A project scope is stored as
`sessions.kind = 'magnet_project'` with the project id, so it cannot clash with Home's row
(`kind = 'magnet'`, `project_id = 'magnet'`). The API takes `?project=<id>` (GET, stop, new) and
`scope: 'project'` on send; events carry `scope`. Magnet stays read-only and its actions still
need Approve.

## Consequences

- Good: ask about the project while the stage agent works; the box is one click away.
- Bad / cost: the Overview no longer starts agents directly; the Chat tab does.
