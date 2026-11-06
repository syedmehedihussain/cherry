# Screens

The project workspace is drawn in [`design/screens/v3/`](design/screens/v3/). The V1 artboards
(Home, Calibration, Settings, Components) were removed on 2026-11-06; the built screens are now
the reference for those. V4 (The Office, `v4-office.md`) replaces the workspace; its screens
are in `design/screens/v4/office-prototype.html`.

Routes are hash-free client routes served by the daemon.

| Route | Screen |
| --- | --- |
| `/` | Home |
| `/p/:id/calibrate` | Calibration |
| `/p/:id` | Project workspace (V3 stages) |
| `/settings/:section` | Settings |

---

## 1. Home

- Top bar: logo, Claude Code status, Settings, Magnet.
- Soft blue glow at the top. Centred: "Good evening, Meddy" (time-aware, name from `me.md`)
  and **What are we building?**
- `PromptBox` with chips. **Start project** (white, 44 px) + hint "A short survey first. Claude
  drafts the plan before any code."
- **Recent**: 4 `ProjectCard`s, auto-fit grid, min 240 px.
- **All projects**: header "7 folders in `~/Projects`", sort button, search input,
  `ProjectTable`.

Behaviour
- Typing in the prompt with **New project** selected and pressing send = start the survey with
  that text as the idea. **Ask Magnet** sends it to Magnet (opens the panel). **Calibrate a
  folder** picks one of the projects in Cherry that is not set up yet.
- Clicking a card: Ready/cctop → workspace. Not calibrated → calibration prompt.

States
- **Loading**: cards as skeletons, table with 5 shimmer rows.
- **First run, Claude missing**: amber banner at the top; prompt and
  Start project disabled with tooltip; projects still listed.
- **Empty folder**: "Your `~/Projects` folder is empty" with **Start project**
  and **Choose another folder**.
- **Magnet open**: Home dims slightly, `MagnetPanel` slides in from the
  right (~420 px).

## 2. Calibration

Uses the workspace shell (280 | centre | 360) so the user sees it is the same project.

**A. Prompt**: "torongo isn't set up for Cherry yet." Two boxes: **What
calibration does** (3 numbered steps) and **What it will not do** (never overwrites, reads only
until you approve). **Calibrate** (primary) · **Not now** · "Usually under 2 minutes". Right
column: GitHub box (works already) and "No agents yet — available after calibration".

**B. Scan**: "Calibrating torongo · step 1 of 3 — Reading the project".
Reassurance line "Nothing is being written." `ScanProgress`. Right: "Found so far" tags.

**C. Questions** — build it: one
`DecisionCard` at a time in the centre, with the scan summary on the left.

**D. Review**: left 280 = steps + "Your answers" (Phase: Development, Users:
Clinics in Bangladesh) + **Change answers**. Then `ProposalList` (400) and the preview pane.
"5 new files and 1 change to README.md. Untick anything you don't want."

## 3. Project workspace (V3, ADR-0045) — `screens/v3/*.html`

The V3 artboards are the source of truth (`docs/design/screens/v3/`, overview in `index.html`).

**Shell (all stages):** top bar 48 px (badge, wordmark, project switcher, four numbered stage
tabs with a progress line, search with `Ctrl K`,
settings); right rail 44 px (Overview, Live, GitHub, Chat; closed by default, `Ctrl B`), its
panel 340 px; status bar 26 px (branch, ahead/behind, changed files, Run, agent, model,
context, plan use, Claude Code, `Ctrl K`). Command palette: views, stages, actions, files.

- `01-plan.html` — **Plan**: Claude Code chat; Documents panel (480 px) with the nine plan
  documents ticked when written, the open document below with Edit and Ask about this.
- `02-design.html` — **Design**: Brief (284 px: references, design system, images, colours,
  fonts) · canvas of `design/screens/*.html` (pan, zoom, fit, phone/desktop, light/dark,
  comment tool, Export, Approve design) · Designer chat (392 px).
- `03-development.html` — **Development**: Explorer (248 px) · one tabbed area: Claude pinned
  first (`?tab=chat`), Monaco file tabs with the Claude band (`?tab=file`), terminal tabs
  (`?tab=term`). No split.
- `04-deployment.html` — **Deployment cockpit**: Run, address, phone/desktop, preview; right:
  summary, checks, browser test rows with screenshots, deploy target; Deploy asks once.
- `05-side-view-open.html` — rail Overview open; next-step chip at 100%.
- `06-command-palette.html` — `Ctrl K`.
- `07-permission-and-live.html` — inline CLI permission prompt; Live open.

Views from the palette (Docs, Notes and tasks, Agents, Decisions, Status report, Run output,
scan reports) open over the stage with a title and a close button (ADR-0047).

## 4. Settings

Grid 260 | content. Nav groups as in `components.md`. Magnet page: 96 px avatar,
title, one-line description, **Read-only mode** switch; stat row (Projects tracked, Sessions this
week, Agents run); **What Magnet knows** — three editable Markdown cards (`MAGNET.md`, `me.md`,
`work.md`) with "Plain Markdown in `~/.cherry/magnet/`"; **Usage** — four stats and the
Daily/Weekly heatmap.

Other sections (simple forms): General (projects folder, port), Appearance (dark
only — show as info), Shortcuts (list), Projects folder, Claude Code (path, version, login
state, default model), GitHub (gh status), About (version, license, links).

## Global states

- **Daemon unreachable**: full-page message "Cherry isn't running. Run `cherry`." with retry.
- **WebSocket reconnecting**: small amber pill in the top bar, auto-retry with backoff.
- **Project folder gone**: workspace placeholder with link Home.
