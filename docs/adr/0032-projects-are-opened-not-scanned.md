# 0032 — Projects are opened or created, not scanned from a folder

- **Status:** Accepted
- **Date:** 2026-10-22
- **Decided by:** Meddy

## Context

Version 1 treated every direct sub-folder of one projects folder (`~/Projects`) as a project
(ADR-0007, ADR-0020). ADR-0031 added Open folder next to that. The user wants Cherry to work
like VS Code instead: Cherry starts empty, lists only the projects you open or create, keeps
them as recent projects, and lets you remove one from Cherry without touching its folder.

## Options

1. **Keep the scan and Open folder side by side** (ADR-0031) — no new work. Trade-off: every
   folder in `~/Projects` shows on Home, wanted or not, and cannot be removed.
2. **A project list only** — Cherry lists what you open (Open folder, `cherry .`) or create
   (Start project). Trade-off: existing users see an empty Home after the update.
3. **A project list, with today's projects imported once** — no empty Home. Trade-off: the
   user asked for a clean start.

## Decision

We chose **2**, and everyone starts empty, including existing installs (the user's choice).

- `config.json` → `projects: [{ id, path }]` is the list. `projectDir()` finds a project only
  there. The scanner builds a card for each listed folder; a folder that is gone shows as
  **folder gone** so it can still be removed.
- **Remove from Cherry** (every row on Home) takes a project off the list; nothing on disk
  changes. Opening the folder again brings it back, with its chats and agents, when it gets the
  same id.
- `projectsDir` stays in config.json with a new meaning: the **new projects folder**, where
  Start project creates projects. The welcome screen asks for it ("Where should new projects
  go?"), Settings can change it, and the survey can create one project somewhere else. Cherry
  never scans it.
- Open folder and `cherry .` stay as in ADR-0031. Cherry still refuses `/`, the home folder and
  `~/.cherry`; the rules about the projects folder are gone.
- The watcher watches the listed folders. Magnet reads only the listed folders, and
  `projects.md` shows each project's folder.

## Consequences

- Good: Home shows only what the user works on, like VS Code's recent projects.
- Good: projects can live anywhere; nothing about a folder location is special.
- Bad / cost: after this update Home is empty until the user opens their projects again.
- Supersedes ADR-0031 and the projects-folder parts of ADR-0007 and ADR-0020; amends ADR-0011
  (Magnet reads the listed projects).
