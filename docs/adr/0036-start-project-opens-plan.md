# 0036 — Start project opens the Plan stage instead of a survey

- **Status:** Accepted
- **Date:** 2026-10-23
- **Decided by:** Meddy

## Context

Start project ran a seven-step survey (ADR-0009): Claude drafted a question card for problem,
scope, stack, data and quality, then wrote CLAUDE.md, a PRD and other docs at a review step.
Since ADR-0034 the Plan stage has its own agent, the Planner, which does the same work better:
it asks one question at a time with options, writes `docs/prd.md` and `docs/roadmap.md`, and
turns real choices into ADRs. Two places that plan a project is one too many, and the survey
made the user answer fixed questions before they could talk to anyone.

## Options

1. **Keep the survey, then open Plan** — one line. Trade-off: the same questions twice.
2. **One form, then Plan** — idea, folder name and folder only; the Planner does the rest.
   Trade-off: no docs exist until the user plans in the chat.
3. **One form, then send the idea to the Planner at once** — Trade-off: a Claude turn the user
   did not click (ADR-0022, rule 10).

## Decision

We chose **2**. Start project is one card: the idea, the folder name (suggested from the idea)
and **Change where it is created**. **Start planning** calls `POST /api/projects/start`, which
makes the folder with `_project/STATUS.md` (the idea under `## Idea`), `project.json` in the
Plan phase and `tasks.json`, runs `git init` with `_project/` excluded, and adds the folder to
Cherry's list (ADR-0032). The browser then opens the project on the **Plan** stage with the
idea in the composer, so one more click (Send) starts the Planner.

## Consequences

- Good: one way to plan; the user talks to the Planner straight away.
- Good: nothing in the folder but `_project/` and `.git` until the Planner writes docs.
- Bad / cost: no `.gitignore` drafted on create (ADR-0023) and no GitHub repo toggle; the
  Preparation stage sets up the repository, CI and `.gitignore`.
- Follow-up: the survey code, its API (`/api/survey/*`, `survey.updated`) and its screens are
  removed. A folder with an unfinished `_project/survey.json` now shows as not set up
  (Calibrate). Supersedes ADR-0009; ADR-0023 no longer applies to new projects.
