# 0061 — ECC specialists and skills in the rooms

- **Status:** Accepted
- **Date:** 2026-11-09
- **Decided by:** Meddy

## Context

Each V4 room has one staff agent and a few bundled skills (ADR-0034). Idea, Requirements and
Testing had no skills, and no room had reviewers or test runners to hand work to.
[ECC](https://github.com/affaan-m/ECC) (MIT, v2.2.3, commit d2ef268) ships 71 agents and 314
skills in the same shapes Cherry already uses: Markdown agents with front matter and `SKILL.md`
folders. The run-2 cost table showed that long chats are expensive: every reply reads the whole
session again. The plan and the selection are in `docs/ecc-integration.md`.

## Options

1. **Install ECC with its own installer.** Trade-off: everything at once, but its hooks,
   commands and rules clash with Cherry's (nothing runs without a click, approvals, loopback).
2. **Bundle a chosen set in Cherry's repo.** Trade-off: about 12 agents and 25 skills to keep
   up to date by hand, recorded in `stages/SOURCES.md`.

## Decision

We chose **option 2**, with the user's answers to the plan's questions:

- **Selection as proposed:** agents in `packages/daemon/stages/<stage>/agents/`, skills in
  `stages/<stage>/skills/`, ECC's LICENSE next to them. Three small edits, listed in SOURCES.md.
  The Design room also gets tasteskill 2.5.1 (`design-taste-frontend`), `high-end-visual-design`
  and `minimalist-ui`.
- **Specialists are SDK subagents** (`agents` option). The staff agent stays the one the user
  talks to and hands pieces of work to them with the Agent tool. Docs-only rooms take the edit
  tools away; the stage guard, approvals and the release card apply to them as to the room.
- **Each specialist runs on the model ECC sets** (Opus for planner and architect, Sonnet for
  most, Haiku for doc-updater), not the room's model.
- **Cherry's skills stay next to ECC's**, and each AGENT.md follows ECC's order of work: plan,
  test first, review, security, verify.
- **Fresh session at half the window:** when the last turn left the room's chat over 50% of the
  context window, the next message ends that chat (it stays in History) and starts a new Claude
  session. Cherry puts a short note before the user's text: the last topic and where to read
  what is done. No model call (ADR-0055). Not after a rewind or for `/compact`; **Keep this
  session** in the chat turns it off for that chat.
- Settings, Agents lists each room's specialists and their model.

## Consequences

- Good: reviewers, a TDD guide and test runners in the rooms; skills in every room; long chats
  stop re-reading hundreds of thousands of tokens.
- Bad / cost: Opus specialists in Plan cost more when used; the repo grows by about 40 MB
  (tasteskill images). A fresh session loses the chat's memory beyond the note and the files.
- Follow-up: a real run to see how often the specialists are used and what they cost; update
  the bundled copies when ECC changes.
