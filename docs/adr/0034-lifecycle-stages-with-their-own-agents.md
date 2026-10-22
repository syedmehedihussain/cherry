# 0034 — Lifecycle stages as tabs, each with its own agent

- **Status:** Accepted
- **Date:** 2026-10-22
- **Decided by:** Meddy

## Context

Every project had one `phase` in `_project/project.json` (plan, design, preparation,
development, deployment), shown as a bar in the top bar. Calibration or the survey set it once
and nothing moved it again: Cherry is deployed and on version 2 but showed "Preparation", and
researcher has working code but showed "Design". The model was also a straight line, while real
work loops: ship, collect issues, plan the next round. The chat prompt even told Claude "do not
write production code in the design phase" on a project whose code was already running.

The user wants each stage to be a place you open, with an agent that is good at that stage:
its own personality, rules and skills, and the skills ship with Cherry.

## Options

1. **Keep one phase, let the user set it by hand** — small change. Trade-off: still a straight
   line, still one generic chat.
2. **Derive the phase from the repo** (milestones, releases) — no clicks. Trade-off: still one
   label for work that happens in several stages at once.
3. **Stages as tabs, one agent per stage, in a loop** — Plan, Design, Preparation, Development,
   Deployment, Issues, and Issues feeds the next Plan. Trade-off: a bigger change to the chat, the top bar
   and the side panels.

## Decision

We chose **3**.

- **Six stages, a loop.** `plan → design → preparation → development → deployment → issues →
  plan`. The top bar shows them as tabs (Plan · Design · Preparation · Development · Deployment ·
  Issues) in
  place of the phase bar. Any tab opens at any time; there is no "current phase" to keep right.
- **One chat per stage.** Each project keeps a separate conversation per stage, so the planner
  and the builder each keep a short, focused context. They hand work to each other through the
  project's files (PRD, design docs, roadmap, STATUS.md, issues), not through one long chat.
- **An agent profile per stage** (`packages/daemon/stages/<stage>/AGENT.md`): the persona and
  the way it works, in markdown so it can be read and tuned. The rules are code, not prompt:
  Plan, Design and Issues may only write docs and notes (`docs/`, `design/`, `_project/`,
  top-level `*.md`); an edit to code is refused with "switch to Development". Preparation,
  Development and Deployment may edit anything, with the usual approvals.
- **Skills ship with Cherry.** `packages/daemon/stages/<stage>/skills/<name>/SKILL.md` are
  bundled; `~/.cherry/skills/<stage>/<name>/` are the user's own. For each turn Cherry builds a
  plugin folder (`~/.cherry/plugins/<stage>/`) holding **only skill folders** and passes it with
  the SDK's `plugins` option. No settings files load (ADR-0004 stands), and no hooks, commands
  or MCP servers from a skill folder ever load, so approvals cannot be bypassed. A skill's
  scripts run through Bash and still ask like any command.
- **Bundled third-party skills keep their licence.** Only skills under a licence that allows
  redistribution (MIT, Apache-2.0, BSD, CC-BY) are bundled, with their LICENSE file next to
  them and a line in `packages/daemon/stages/SOURCES.md` (name, source URL, licence, commit).
- **Background agents** use the Development profile. Calibration, the survey and scans are unchanged.
- **`phase` in project.json** is no longer shown or sent to Claude, and calibration no longer
  asks for it. The field keeps its format (calibration and the survey still fill it with a
  best guess), so no file format changes.

## Consequences

- Good: the screen matches how the user works; each agent is better at its stage; the label can
  never be wrong because there is no label to keep up to date.
- Good: skills travel with Cherry, so every install gets the same agents.
- Bad / cost: six conversations per project instead of one; the sessions table gets a `stage`
  column (migration). Old chats become the Development chat.
- Bad / cost: bundled skills must be checked by hand before they ship (licence, no surprises in
  scripts).
- Follow-up: how Issues are stored (GitHub issues, a local file, or both) is decided when that
  task starts. The Plan section milestone (V2) is folded into the Plan stage.
