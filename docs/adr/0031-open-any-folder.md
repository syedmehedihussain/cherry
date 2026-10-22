# 0031 — Open any folder, next to the projects folder

- **Status:** Superseded by 0032
- **Date:** 2026-10-22
- **Decided by:** Meddy

## Context

Cherry treats every direct sub-folder of one projects folder (`~/Projects`) as a project. Code
that lives elsewhere (a work checkout, a clone in `~/src`) could not be opened without moving
it. The user asked for something like VS Code's Open Folder. Every project lookup already goes
through `projectDir()`, and the path, secret-file and `rm -r` guards are scoped to each
project's own folder, so a folder elsewhere is safe once Cherry knows it.

## Options

1. **Several projects folders** — a list of roots. Trade-off: every folder in each root becomes
   a project, which is more than asked for.
2. **A list of opened folders next to the one projects folder** — like VS Code. Trade-off: ids
   must stay unique across both.
3. **Symlinks into `~/Projects`** — no code. Trade-off: the realpath checks refuse links that
   point outside, by design.

## Decision

We chose **2**. `config.json` gets `openFolders: [{ id, path }]`. **Open folder…** on Home
(the welcome screen's folder picker) and `cherry .` / `cherry open <path>` in a terminal add a
folder; its id is the folder name, made unique (`core-2`) when a project already has it.
`projectDir()` looks in this list first. The scanner adds a card with `opened: true`, the
watcher watches these folders too, and Magnet may read them. **Remove from list** forgets the
folder and never touches the disk. A folder inside the projects folder is already a project and
keeps its id. Cherry refuses `/`, the home folder, `~/.cherry` (or anything holding it), the
projects folder, and any folder that holds the projects folder, because Claude may read and
edit anything inside a project.

## Consequences

- Good: code anywhere on the machine can use chat, agents, scans and decisions.
- Good: the guards stay as they are; each still checks the project's own folder.
- Bad / cost: two folders with the same name get ids `name` and `name-2`; the second keeps its
  id even if the first goes away.
- Amends ADR-0011 (Magnet also reads opened folders) and ADR-0020 (the welcome screen still
  picks the one projects folder; more folders can be opened later).
