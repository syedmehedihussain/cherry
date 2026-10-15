# 0027 — Project ideas wait on Home in ~/.cherry/ideas.json

- **Status:** Accepted
- **Date:** 2026-10-15
- **Decided by:** Meddy

## Context

The user often has a project idea but no time to start it. Home only offers **Start project**,
which runs the survey at once and makes a folder in `~/Projects`. The user wants to write down
a name and a description, see the idea in an **Upcoming** list on Home, and start it later with
one click.

## Options

1. **`~/.cherry/ideas.json`, Cherry's own state** — nothing appears in the projects folder until
   the user starts the idea. Trade-off: other tools (cctop) do not see the ideas.
2. **A folder per idea with `_project/STATUS.md` `status: idea`** — the cctop convention, so
   cctop lists them too. Trade-off: empty folders in `~/Projects`, they show as projects in All
   projects, and the survey refuses a folder that already has files.
3. **Notes in Magnet** — no new file. Trade-off: no list, no Start button.

## Decision

We chose **option 1**. `~/.cherry/ideas.json` (`{ schema: 1, ideas: [{ id, name, description,
createdAt, updatedAt }] }`, mode 600, newest first) holds the ideas. Home shows them under
**Upcoming**, between Recent and All projects, with **Add idea**, edit and remove. **Start** opens
the new project survey with the idea text filled in and the name as the folder name; once the
survey has made its folder, the idea is removed. A broken ideas.json is never overwritten.

## Consequences

- Good: an idea costs no tokens and no folder until the user starts it.
- Bad / cost: cctop's Projects tab does not list these ideas.
- Follow-up: let Magnet add an idea ("remember this idea for later").
