# Roadmap

Each milestone ends with something you can use. Do them in order. A milestone is done only when
every box in its **Done when** list is ticked and `pnpm test` passes.

## M0 — Preparation (repo setup)

- [x] Create `syedmehedihussain/cherry`, push these docs (MIT, ADR-0007).
- [x] pnpm workspace with `cli`, `daemon`, `web`, `shared`; TS strict; ESLint + Prettier.
- [x] Vitest in every package; Playwright set up with the preinstalled Chromium.
- [x] GitHub Actions: lint, typecheck, test on push and PR.
- [x] `packages/web` imports `docs/design/tokens.css`; Geist fonts load.
- [x] Extract Magnet SVGs and the app mark into `packages/web/src/assets/`.
- [x] `_project/` created and excluded; `STATUS.md` filled.

**Done when:** `pnpm dev` shows an empty dark page with the top bar, and CI is green.

## M1 — Daemon and Home

- [x] `cherry` (= `up`) / `down` / `status` / `logout`, `daemon.json`, login link + session cookie (ADR-0008), Host/Origin checks.
- [x] `ProjectScanner`: classify folders, parse `project.json` + `STATUS.md`, git summary.
- [x] SQLite cache + migrations; `projects.md` generator for Magnet.
- [x] `GET /api/projects`, `/api/health`, WebSocket with `projects.updated`.
- [x] Home: prompt box (UI only), Recent cards, All projects table, search, sort.
- [x] Claude Code check + first-run banner; empty folder state.
- [x] File watcher → live updates.

**Done when:** `cherry` opens Home listing your real `~/Projects` with correct badges, phases
and git chips, in under 2 s.

## M2 — Workspace, read-only

- [x] Workspace shell (top bar with phase bar, 280 | centre | 360).
- [x] File tree with git letters, filters, ignored folders.
- [x] File viewer with syntax highlight (Shiki) and **Show changes**.
- [x] Docs tab: grouped list + Markdown reader (with ADR links).
- [x] Status block from `STATUS.md`.
- [x] GitHub box (read only: branch, ahead/behind, commits, PR count).
- [x] **Open in editor**.

**Done when:** you can browse any Ready or cctop project's files and docs without a terminal.

## M3 — Claude chat

- [x] **Spike (1 day):** confirm CLI flags / Agent SDK API, write ADR-0004 as Accepted.
- [x] ClaudeRunner + fake Claude + recorded scripts.
- [x] SessionManager with resume; transcripts as JSONL.
- [x] Chat UI: messages, timeline rows, grouping, streaming, Stop.
- [x] ApprovalBroker + `ApprovalCard` (edit and command) + toast.
- [x] `ask_decision` tool + inline `DecisionCard`.
- [x] Command rules and the must-pass safety tests.

**Done when:** you can ask Claude to make a change in a real project, see the diff, Allow it, and
the file changes — and a Deny leaves it untouched.

## M4 — Calibration

- [x] Prompt, scan (read-only session), questions, proposal, write-selected.
- [x] Append-only rule for existing `CLAUDE.md` / `README.md`.
- [x] Light calibration for cctop projects.

**Done when:** torongo goes from Not calibrated to Ready, and `git status` shows only the files
you ticked.

## M5 — New project survey

- [x] Seven steps, `survey.json` saved per answer, resume, change + stale marking.
- [x] Doc generation: `CLAUDE.md`, PRD, ADRs from decisions, architecture, data model, STATUS,
      `project.json`, `tasks.json` (Core preset).
- [x] Create folder, `git init`, exclude `_project/`, optional `gh repo create --private`.

**Done when:** a new project created from Home has all docs, a first commit, and opens in the
workspace at phase Design.

## M6 — GitHub actions

- [x] Pull (`--ff-only`), Push behind an approval, open PRs list via `gh`.

## M7 — Background agents

- [x] Worktrees, AgentManager, agent cards, approvals from agents, diff review, accept/discard,
      retry, max running.

**Done when:** "write tests for X" runs on the side while you chat, and Accept lands it on your
branch.

## M8 — Magnet

- [x] `~/.cherry/magnet/` with starter files; Settings → Magnet page.
- [x] Magnet session (read-only tools across projects), panel on Home and workspace.
- [x] Proposed-action cards that call real routes after Approve.
- [x] Suggestion chips.

**Done when:** "What's stuck this week?" gives a correct answer from your real projects.

## V2.1 — Workspace polish

From using Cherry day to day (2026-10-23): each stage says how far it is, Plan hands a plan to
Development in one click, the chat gets quieter, and the chat gains Claude Code CLI features.
New feedback is added here in build order.

- [x] w0 Start project is one form and opens Plan (ADR-0036); project chats may use Claude in
      Chrome (ADR-0037).
- [x] w1 Claude in Chrome runs without asking when the setting is on.
- [x] w2 Chrome steps show in one box in Live; the chat shows one compact row.
- [x] w3 Side panel Chat tab: Magnet chat for this project and the Task / Note / Agent box.
- [x] w4 File panel per stage: stage files open, project files folded, Collapse all.
- [x] w5 Stage progress on Overview: a checklist per stage kept by its agent (stage_checklist),
      a bar with what is left, Recheck, Move to the next stage, progress on the stage tabs.
- [ ] w5b Approve plan: the Planner proposes the plan as a card; Approve writes the tasks,
      opens Development in Auto and starts the Builder. Docs-only stages default to Auto.
- [ ] w6 A calmer chat: a finished reply folds its tool rows into one "Worked … · N steps" line.
- [ ] w7 Claude Code CLI parity: slash commands, @ file mentions, context meter and compact,
      thinking, subagents, chat history and resume, remembered allow rules, keys
      (Esc, ↑, paste image); later rewind.

**Done when:** in Plan you say "next I want X", the Planner fills the Plan bar, Approve plan
opens Development and the Builder works through the tasks while the Development bar fills;
Chrome checks the app without one approval card and its steps show in Live; the side Chat tab
answers questions about the project.

## After the MVP: scan agents

- [x] Ready-made scan agents (Security review, Test runner, Code health, Dependency audit),
      custom ones from `~/.cherry/agents/`, reports in `cherry/reports/` read in the centre
      (ADR-0012).

**Done when:** one click on Run in the Agents view scans the project without asking anything,
and Report opens the result in its own centre tab with the history of earlier runs.

## M9 — First public release: 1.1.0 (ADR-0013)

1.0.0 was held back (2026-10-11) for more work; the first public release is 1.1.0
(2026-10-12) and includes it.

- [x] CI green again (daemon EPIPE crash outside git repos; fake Claude reports Claude ready).
- [x] Fix the security review findings: agent/Magnet edit guard through symlinks (high), read
      tools outside the project and narrow secret list (medium), editor fallback (low).
- [ ] Run Test runner, Code health and Dependency audit on Cherry; fix anything high.
- [x] README rewritten for users: what it is, requirements, install, first run, features, skill;
      screenshots and a demo GIF from `scripts/media/`.
- [x] `CHANGELOG.md` (1.1.0).
- [x] Version 1.1.0 in every package and `cherry --version` (in the release commit).
- [x] Fresh install check: clone into a temp folder, empty `CHERRY_HOME`, install, first run
      (2026-10-11: works; the first-run UI build is now quiet).
- [x] Landing page in `site/`, deployed to GitHub Pages and linked from the repo.
- [x] Tag `v1.1.0` and publish the GitHub release (the user asked, 2026-10-12).

**Done when:** someone on Linux follows the README from a fresh clone, opens Cherry, and every
check in CI is green on the tagged commit.

## V2 — Auto mode and Decisions (ADR-0025, ADR-0026)

- [x] Auto mode in the chat: Ask / Auto / Plan menu; push, publish and `rm -r` still ask.
- [x] Auto switch for background agents.
- [x] Decisions: Claude proposes big choices as ADRs (`propose_decision`); approve, reject and
      done routes; Approve only / apply in chat / start an agent.
- [x] Decisions tab in the centre with a pending count.

**Done when:** in Auto mode, Claude proposes a database switch instead of making it, the
proposal waits in Decisions, and approving it updates the ADR and applies the change.

## V2 — Works on its own

Agents work without approval clicks and report back; Cherry tells you when it needs you.
Built before the Plan section (the user's order, 2026-10-22).

- [x] Scans list folds into one row in the Agents tab, closed by default.
- [x] Notifications: desktop notification and tab title count for agent done, failed or
      needs you, scan done, decision proposed, and a chat reply while the tab is hidden.
- [x] Background agents always run in Auto. Push, publish and `rm -r` are skipped, not asked;
      the agent finishes the rest and ends as "needs you" with **Continue in chat**.
- [x] Decisions: approve in the chat card; Approve only adds a task; Run with agent builds,
      tests and reports "ready to merge"; Merge tries `git merge`, an agent resolves conflicts.
- [x] Git: an Auto commit switch (Claude commits after each finished piece of work); off, a
      Source Control list with stage, unstage, message and Commit. The Haiku grouping goes.
- [x] Open any folder: **Open folder…** on Home and `cherry .` / `cherry open <path>`, next to
      the projects folder.
- [x] Tests, docs, CHANGELOG; hands-on run on a scratch project.

**Done when:** an agent runs a decision to the end without one approval click, says it is
tested and ready, Merge lands it, and a notification told you each step; commits happen on
their own with Auto commit on and by hand like VS Code with it off; a folder outside
`~/Projects` opens with `cherry .`.

## V2 — Lifecycle (ADR-0034)

The phase bar becomes six stage tabs in a loop: Plan, Design, Preparation, Development,
Deployment, Issues, and Issues feeds the next Plan. Each stage has its own agent (persona,
rules, skills) and its own chat. Replaces the planned "Plan section"; its ideas (plan review,
specs, exit checks) become Plan stage work.

- [x] l1 Agent profiles: one AGENT.md persona per stage, edit rules in code (Plan, Design and
      Issues write docs only), the chat prompt built from the profile, no phase line.
- [x] l2 One chat per stage: sessions get a `stage` (migration), the chat API and events take
      a stage, old chats become Development.
- [x] l3 Skills: bundled `stages/<stage>/skills/`, the user's `~/.cherry/skills/<stage>/`,
      loaded as a skills-only plugin per turn; SOURCES.md for licences.
- [x] l4 Stage tabs in the top bar replace the phase bar; the chat follows the stage; each
      stage remembers its chat; Home cards drop the phase bar.
- [x] l5 Each stage's panels: the file panel and the side panel show what that stage needs
      (Plan: PRD, roadmap, decisions; Design: design docs; Preparation: readiness checklist;
      Development: files, Source Control, agents; Deployment: GitHub, releases, CI).
- [x] l6 Issues stage and the loop: write issues, Plan this starts the next cycle in Plan
      (storage decided with the user first).
- [x] l7 Bundle the skills the user picked (docs/skill_link.md): 23 third-party skills, each read
      and licence-checked, plus Cherry's own three; sources in `packages/daemon/stages/SOURCES.md`.
      Open: the HyperFrames video skills (user decision) and installing the agent-browser CLI.
- [x] l8 Tests, docs, CHANGELOG; real-Claude check (Plan guard refuses code, Deployment uses its
      skill); the Issues → Plan loop is covered end to end in e2e (lifecycle.spec.ts).

**Done when:** each stage tab opens its own chat with its own agent; the Plan agent refuses to
edit code and says to switch to Development; a bundled skill is used by its stage's agent; an
issue written in Issues becomes the next plan in Plan.

## After the MVP

Notes & Tasks polish · usage heatmap · terminal tab · Tailscale access · light theme · runner
adapters for other agent CLIs (ADR-0006) · npm publish as `cherry-cli`.
