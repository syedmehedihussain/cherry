# Changelog

All notable changes to Cherry. Versions follow [Semantic Versioning](https://semver.org).

## Unreleased

### Added

- **Upcoming** on Home: save a project idea (name and description) for later, edit or remove it,
  and click **Start** to open the new project survey with it filled in (ADR-0027).
- **Auto mode**: the composer's Plan mode chip is now a mode menu with **Ask** (the default),
  **Auto** and **Plan**. In Auto mode, edits and most commands run without an approval card.
  `git push`, GitHub writes, publishing and deploying, and `rm -r` still ask. Blocked commands,
  edits outside the project and secret files stay refused. Background agents have the same
  Auto switch (ADR-0025).
- **Decisions**: Claude proposes big project choices (stack, database, data format,
  architecture, a rename) with `propose_decision` instead of making them. Each one is saved as
  a Proposed ADR and waits in a new **Decisions** pill with a pending count. **Approve only**,
  **Approve & apply in chat** or **Approve & start agent**, or **Reject** with a reason. The ADR
  goes Pending → Approved (`Done: not yet`) → Done (a date), or Rejected (ADR-0026).
- **Shut down Cherry** button at the bottom of Home. It asks once, stops the daemon and shows
  how to start it again.

### Changed

- Home's project table has no State column; a folder not set up in Cherry yet shows
  **Calibrate** instead.
- The centre tabs are Chat, Docs, Notes & Tasks, **Agents** (with a running count) and
  **Decisions** (with a pending count). The side panel keeps Overview, Live and GitHub; the
  Overview's task line, "See all" and quick add open the matching centre tab.

### Fixed

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
