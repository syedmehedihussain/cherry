# 0045 — Four stages, each its own kind of place

- **Status:** Accepted
- **Date:** 2026-10-25
- **Decided by:** Meddy

## Context

Cherry has six stage tabs (ADR-0034) that all look the same: one chat, the same centre tabs and
the same side panel, always open. The user finds it too full. Their real work is four steps in
four tools: plan in claude.ai, design in Claude Design, build in Claude Code next to VS Code,
then run, test and ship. They want each stage of Cherry to feel like that tool, every chat to
feel like the Claude Code CLI, and every other panel hidden until they open it. The full plan
is in `docs/v3-redesign.md`.

## Options

1. **Restyle the current layout** — keep six tabs and the panels, make them calmer. Trade-off:
   small, but every stage still looks the same.
2. **Four stages, a layout each, one shared Claude Code chat** — Plan (chat and documents),
   Design (brief, canvas, chat), Development (explorer, agent, editor), Deployment (preview,
   checks, deploy). Side views move to a closed right rail and a command palette. Trade-off: a
   big rebuild of the web package; new dependencies for the editor (and maybe a terminal).

## Decision

We chose **2** (the user's answers of 2026-10-25 are in `docs/v3-redesign.md`).

- Stages: plan, design, development, deployment. Preparation and Issues are dropped; their
  old chats stay readable in History and `docs/issues/` stays on disk.
- Any stage opens at any time; progress suggests the next stage and never blocks.
- One chat component in the Claude Code CLI look for every stage.
- Right rail (Overview, Live, GitHub, Chat) is closed by default; everything else is in the
  command palette.
- The daemon API and file formats do not change in this ADR; any change gets its own ADR.

## Consequences

- Good: each stage fits its job; the screen is quiet; one chat to keep right.
- Bad / cost: most of `packages/web` changes; e2e tests need rewriting; new artboards first.
- Follow-up: ADRs for Monaco (r5), the terminal with xterm.js and node-pty (r6), the Design
  canvas (r7) and Google Fonts (r8). Browser tests use Claude in Chrome (ADR-0037, 0038).
