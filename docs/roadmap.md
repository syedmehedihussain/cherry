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
- [ ] Notifications: desktop notification and tab title count for agent done, failed or
      needs you, scan done, decision proposed, and a chat reply while the tab is hidden.
- [ ] Background agents always run in Auto. Push, publish and `rm -r` are skipped, not asked;
      the agent finishes the rest and ends as "needs you" with **Continue in chat**.
- [ ] Decisions: approve in the chat card; Approve only adds a task; Run with agent builds,
      tests and reports "ready to merge"; Merge tries `git merge`, an agent resolves conflicts.
- [ ] Git: an Auto commit switch (Claude commits after each finished piece of work); off, a
      Source Control list with stage, unstage, message and Commit. The Haiku grouping goes.
- [ ] Open any folder: **Open folder…** on Home and `cherry .` / `cherry open <path>`, next to
      the projects folder.
- [ ] Tests, docs, CHANGELOG; hands-on run on a scratch project.

**Done when:** an agent runs a decision to the end without one approval click, says it is
tested and ready, Merge lands it, and a notification told you each step; commits happen on
their own with Auto commit on and by hand like VS Code with it off; a folder outside
`~/Projects` opens with `cherry .`.

## V2 — Plan section

Built last, after "Works on its own". Plan mode taken to the highest level.

Make planning in Cherry fit real software engineering, from the Plan phase to Plan mode in the
chat. The scope is agreed first; the items after the proposal are candidates until then.

- [ ] Audit planning today (survey, PRD and ADRs, plan-phase tasks, Plan mode, Live plan) and
      list the gaps.
- [ ] Agree the scope with the user.
- [ ] Proposal and ADR: requirements with acceptance criteria, non-functional needs, risks,
      scope and milestones.
- [ ] Plan review card: comment on Claude's plan, Approve and build, or Send notes.
- [ ] New feature spec: requirements, design and tasks with IDs and dependencies.
- [ ] Analyze: check a plan or spec against CLAUDE.md and the ADRs.
- [ ] Plan phase checklist and exit gate.
- [ ] Next task from dependencies; start an agent from a task.

**Done when:** a new feature on an existing project goes from idea to reviewed spec and ordered
tasks inside Cherry, and Claude's plans can be reviewed and sent back with comments.

## After the MVP

Notes & Tasks polish · usage heatmap · terminal tab · Tailscale access · light theme · runner
adapters for other agent CLIs (ADR-0006) · npm publish as `cherry-cli`.
