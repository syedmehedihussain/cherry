# Changelog

All notable changes to Cherry. Versions follow [Semantic Versioning](https://semver.org).

## Unreleased

### Added

- **Claude in Chrome** (ADR-0037). Settings → General → Claude in Chrome lets project chats
  use your Chrome to open the app and check it. Clicks, typing and page changes always ask,
  also in Auto; JavaScript and uploads ask every time. Agents never use it.
- **Start project opens Plan** (ADR-0036). The seven-step survey is gone. Start project asks
  for the idea and a folder name, makes the folder, and opens the project on the Plan stage
  with the idea in the composer: press Send and the Planner takes it from there.
- **Lifecycle stages with their own agents** (ADR-0034). The phase bar is gone: the top bar of a
  project has six tabs, Plan, Design, Preparation, Development, Deployment and Issues, in a loop.
  Each opens its own chat with its own agent: the Planner, Designer, Preparer, Builder, Shipper
  and Triager, each with its own personality, way of working and skills. The Planner, Designer
  and Triager write docs and notes only; asked to change code, they say it belongs in
  Development. Each stage lists its key files first in the file panel; Preparation shows a
  readiness checklist with **Ask the Preparer to fix**. Your existing chat is now the
  Development chat.
- **Skills ship with Cherry** (ADR-0034). Each agent loads its stage's skills: 23 bundled
  skills from Matt Pocock, Superpowers, Anthropic and Vercel (grilling, domain modeling,
  brainstorming and writing plans for Plan; frontend design and prototypes for Design;
  TDD, bug diagnosis and a real browser for Development; verification and finishing a branch
  for Deployment; tickets, triage and code review for Issues; handoff everywhere), Cherry's
  own `project-readiness`, `release` and `write-a-skill`, and your own in
  `~/.cherry/skills/<stage>/`. Click a skill in an empty chat to start it. Sources and
  licences are in `packages/daemon/stages/SOURCES.md`. Only skill folders load, never hooks or settings,
  and a skill cannot skip an approval. **Settings → Stage agents** lists every agent and skill.
- **Issues** (ADR-0035). The Issues stage keeps issues as files in `docs/issues/` (status, type,
  severity), shows the project's open GitHub issues with **Import**, and **Send to GitHub**
  after your approval. Tick issues and **Plan selected** to start the next round in Plan.
- **Auto mode asks before git commands that throw work away**: `git reset --hard`,
  `git clean -f`, `git branch -D`, `git checkout .` and `git restore .`. Agents skip them.
- **Serious commands ask instead of being blocked** (ADR-0033). `sudo`, `curl … | sh`, `rm -r`
  outside the project and force-pushing to main show a card with a red warning, every time,
  even in Auto mode, and without "Allow for this session". Background agents skip them and
  list them under Needs you.
- **Projects work like VS Code's recent projects** (ADR-0032). Cherry no longer lists every
  folder in `~/Projects`: it starts empty and lists only the projects you open or create.
  **Open folder…** on Home or `cherry .` / `cherry open <folder>` in a terminal opens a folder
  from anywhere; **Remove** takes a project out of Cherry and leaves the folder alone. A folder
  that was moved shows as "folder gone". The projects folder is now the **new projects folder**
  where Start project creates projects, and the survey can create one somewhere else. After
  this update Home is empty until you open your projects again. If you installed the `cherry`
  command before, run `scripts/install-cli.sh` again so `cherry .` knows which folder you are in.
- **Notifications**: a toast, a desktop notification while the tab is in the background
  (Settings → General, nothing leaves the machine) and a count in the tab title when an agent is
  done, fails or needs you, a scan finishes, Claude proposes a decision, a chat reply is ready,
  or something waits for your OK.
- **Auto commit** switch in the GitHub view: Claude commits its work as you, in small
  conventional commits, after each finished piece of work. Push still asks (ADR-0030).
- **Source Control** in the GitHub view, like VS Code: Staged and Changes, stage or unstage per
  file or all, a click opens the file, **Write message** (Haiku, on a click) and **Commit as
  you**. Secret files are never staged or committed (ADR-0030).
- **Merge with agent**: when an agent's branch conflicts with yours, an agent merges your branch
  into its branch, fixes the conflicts, runs the checks, and Cherry merges when they pass
  (ADR-0029).
- **Upcoming** on Home: save a project idea (name and description) for later, edit or remove it,
  and click **Start** to open the new project survey with it filled in (ADR-0027).
- **Auto mode**: the composer's Plan mode chip is now a mode menu with **Ask** (the default),
  **Auto** and **Plan**. In Auto mode, edits and most commands run without an approval card.
  `git push`, GitHub writes, publishing and deploying, and `rm -r` still ask. Blocked commands,
  edits outside the project and secret files stay refused (ADR-0025).
- **Decisions**: Claude proposes big project choices (stack, database, data format,
  architecture, a rename) with `propose_decision` instead of making them. Each one is saved as
  a Proposed ADR and waits in a new **Decisions** pill with a pending count. **Approve only**,
  **Approve & apply in chat** or **Approve & start agent**, or **Reject** with a reason. The ADR
  goes Pending → Approved (`Done: not yet`) → Done (a date), or Rejected (ADR-0026).
- **Shut down Cherry** button at the bottom of Home. It asks once, stops the daemon and shows
  how to start it again.

### Changed

- **Background agents always run on their own** (ADR-0028). The Auto switch is gone. Push,
  publish, deploy and `rm -r` are skipped instead of asked; the agent finishes the rest and ends
  as **Needs you** with **Continue in chat**, which hands those steps to the chat. Agents run the
  project's tests before they finish.
- **Decisions** (ADR-0029): the decision card also shows in the chat under Claude's proposal.
  **Approve only** adds the task "Apply ADR-NNNN: title"; ticking it marks the decision done,
  and the other way round. **Approve & run with agent** builds, tests and reports "Ready to
  merge". Apply in chat waits until Claude finishes the current reply.
- Agent **Accept** is now **Merge**.
- The Scans list in the Agents tab folds into one row, closed by default.
- **Ready to commit** and its Haiku commit groups are replaced by Source Control and Auto
  commit (ADR-0030 supersedes ADR-0018).

- Home's project table has no State column; a folder not set up in Cherry yet shows
  **Calibrate** instead.
- The centre tabs are Chat, Docs, Notes & Tasks, **Agents** (with a running count) and
  **Decisions** (with a pending count). The side panel keeps Overview, Live and GitHub; the
  Overview's task line, "See all" and quick add open the matching centre tab.

### Fixed

- Long project names in the file panel and long author names on the commit button no longer
  run out of their panel.
- A project folder removed while Home scanned no longer stops the scan.

- The new project survey showed `~/Projects/` before the folder name even when another projects
  folder was chosen. It now shows the folder from setup or Settings; so do the "already exists"
  error and Magnet's calibration card.
- The empty chat describes the chosen mode; it no longer says every edit waits for approval in
  Auto mode.
- An approved decision can be applied again after its agent was discarded or failed, or its chat
  turn ended without finishing it.
- `cherry down` could leave the daemon running: a browser tab that did not answer the
  WebSocket close kept it open for 30 s. Sockets and open requests are now cut at once, the
  daemon always exits within 10 s, and `cherry down` uses SIGKILL after 12 s.

## 1.1.0 — 2026-10-12

The first public release. It has everything planned for 1.0.0 (listed below; 1.0.0 was never
tagged on its own) and the work since. Linux only; install from a clone (ADR-0013).

### Added

- **Run button** before Status: one click runs the project's website on localhost (web dev
  scripts, a build before `preview`, Django, Flask, FastAPI, Rust or Go web servers, a static
  `index.html`) with live output, Open, Restart and Stop in a Run tab. Install scripts and
  command-line programs are never run. A site Claude or a terminal already started from the
  folder shows as a link that opens in a new tab (ADR-0024).
- **Built-in editor**: Edit any text file in the file viewer, Save or Ctrl+S; refused if the
  file changed on disk; secret and binary files stay blocked (ADR-0021).
- **Change summary** under every Claude reply that edited files: files, lines, the commands
  after the change and how they went, at no token cost. **Explain with Claude** asks Haiku for
  a plain-words explanation only when you click (ADR-0022).
- **Ready to commit** on the GitHub view: Haiku groups your changes into small conventional
  commits and you commit as yourself (ADR-0018).
- **.gitignore for the stack** when a project is created, kept current by Claude (ADR-0023).
- **Welcome screen** on first start: what Cherry is, the projects folder (pick or create), a
  check of Claude Code, git and GitHub, and a theme (ADR-0020).
- **Themes**: Just black (default), Cherry dark, Cherry light and Classic (ADR-0019).
- **Brand**: the Cherry badge, the `cherry_` wordmark with its cursor, favicons and app icons.
- **Markdown preview** in the file viewer with a Source toggle.
- **Live view** follows Claude's task plan step by step (ADR-0017); a **Status report** tab
  from the Status pill; Notes & Tasks in one view; quick add for tasks, notes and agents;
  Claude Code plan usage (5-hour and week) on the Overview (ADR-0016).
- Agent and scan reports written in ASD-STE100 Simplified Technical English (ADR-0015).
- An About page with credits and contact links.
- A landing page (`site/`, GitHub Pages) and reproducible demo media (`scripts/media/`).

### Changed

- New installs use **Opus** for chat and agents; small automatic jobs use Haiku with capped
  prompts, and big jobs (reviews, reports, explanations) run only on a click (ADR-0022).
- Paths show as `~/…` from the daemon's real home folder.

### Security

- Claude's file tools are kept inside the project, agent and Magnet path guards resolve
  symlinks, the secret-file list is wider, and Open in editor falls back to opening the folder.

## 1.0.0 — not released on its own

The planned first release; it ships as part of 1.1.0. Linux only; install from a clone with
`./scripts/install-cli.sh` (ADR-0013).

### The app

- `cherry` command: start, stop, status, open a project, doctor, logout, systemd user service.
  Loopback-only daemon with a one-time login link and session cookie (ADR-0005, ADR-0008).
- **Home**: every project in your projects folder with state, phase, git and next step; search
  and sort; live updates when files change.
- **New project survey**: seven decision cards, then CLAUDE.md, PRD, ADRs, architecture,
  data model, STATUS, `project.json`, `tasks.json`, `git init`, a first commit and an optional
  private GitHub repo.
- **Calibration** for existing projects: read-only scan, questions, a proposal you tick file by
  file; existing files only get additions.
- **Workspace**: file tree with git letters and coloured type tags, read-only file viewer with
  diffs, Docs reader with ADR links, Notes & Tasks, Status notch, and Open in editor.
- **Chat with Claude**: streaming, plan mode, model and effort pickers, file and image
  attachments, approval cards for every edit and command, decision cards, Stop, resume.
- **Scan agents**: one-click read-only Security review, Test runner, Code health and
  Dependency audit with reports in the centre and a history per agent; custom agents from
  `~/.cherry/agents/` (ADR-0012).
- **Background agents**: tasks in their own git worktree and branch, approvals for commands,
  diff review, Accept (merge) or Discard, retry, a running limit (ADR-0010).
- **GitHub**: branch, ahead/behind, recent commits, pull, push after approval, open PRs.
- **Magnet**: a read-only assistant across all projects with proposed actions you approve
  (ADR-0011).
- **Claude Code skill** in `.claude/skills/cherry`, with `scripts/api.sh` to drive a running
  Cherry.

### Safety

- Every chat edit and command needs approval; `sudo`, force pushes to main or master,
  `curl | sh` and `rm -rf` outside the project are blocked outright.
- Secret files (`.env`, keys) are never read; a path guard with symlink resolution protects
  every file route.
