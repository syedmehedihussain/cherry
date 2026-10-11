# 0016 — Overview quick add and the note-taker

- **Status:** Accepted
- **Date:** 2026-10-11
- **Decided by:** Meddy

## Context

The box at the bottom of the Overview could only start an agent. The user wants the same box to
add a task, save a note, or start an agent, and the Magnet pill in the right column is a
duplicate of the Magnet button in the top bar. Notes should be tidied by Claude before they
land in `_project/notes.md`, which is the user's own file (CLAUDE.md rule 3: existing files get
additions, never replacement).

## Options

1. **Claude rewrites notes.md** — best organisation. Trade-off: Claude replaces the user's file;
   a bad turn can lose notes.
2. **Claude tidies the note and picks a section; the daemon inserts it** — notes.md only ever
   gets additions. Trade-off: older notes are never reorganised.

## Decision

We chose **option 2**. The box has a kind picker (Task, Note, Agent; the model picker shows only
for Agent). Task appends to tasks.json in the current phase. Note runs a short Haiku turn with
no tools but `save_note { section, markdown }`; the daemon adds the note at the end of that `##`
section, or as a new section, re-reading the file first. Notes run one at a time per project.
After each action the right column switches to the Tasks, Notes or Agents view. The Magnet
pill becomes a Tasks pill; Magnet stays in the top bar.

## Consequences

- Good: no note text is ever removed or rewritten; a failed turn changes nothing.
- Bad / cost: a note uses a little of the Claude plan (one Haiku turn, about 10 to 15 s).
- Follow-up: a "tidy all notes" action would need an approval card (rule 3).
