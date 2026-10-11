# 0023 — A .gitignore when a project is created

- **Status:** Accepted
- **Date:** 2026-10-11
- **Decided by:** Meddy

## Context

The survey created projects without a `.gitignore`, so caches like `__pycache__/` showed up as
changes and could be committed. The user wants a box at project creation that makes a
`.gitignore` for the chosen stack, and wants Claude to keep it current as the project grows,
without anything fancy.

## Options

1. **Haiku writes it from the stack tags, plus a prompt rule to keep it current** — one small
   automatic call. Trade-off: a few hundred tokens per new project.
2. **Fixed templates per language** — Trade-off: a table to maintain; misses mixed stacks.
3. **Ask the planning call to add `.gitignore` to the drafted files** — Trade-off: makes the big
   Opus draft longer and the box could not turn it off.

## Decision

We chose **option 1**. The Review step has **Create a .gitignore for this stack** (on by default;
hidden if the drafted files already have one). On Create, Haiku gets only the stack tags and
answers with the file content; Cherry strips code fences, drops `_project/` (it is excluded per
clone) and always puts `.env`, `.env.*`, `!.env.example`, `.DS_Store` and `*.log` first. If Haiku
gives nothing, those base lines are written. The file goes into the first commit and is never
written over an existing one.

The chat and agent prompts now say: keep `.gitignore` current when a change makes build output,
caches, dependencies, local env files or secrets.

## Consequences

- Good: new projects start clean; Claude keeps the file up to date.
- Bad / cost: one Haiku call per new project.
- Follow-up: none.
