# 0030 — Auto commit, and a Source Control list instead of commit groups

- **Status:** Accepted
- **Date:** 2026-10-22
- **Decided by:** Meddy

## Context

"Ready to commit" (ADR-0018) asked Haiku to group the uncommitted changes into commits, which
the user then made one by one. In use this was messy: the groups changed whenever files
changed, and committing many groups by hand was slow. The user wants two ways instead: Claude
commits by itself while it works (as Claude Code does in a terminal), or the user stages and
commits by hand like in VS Code.

## Options

1. **Keep the Haiku groups** — no change. Trade-off: the flow the user called messy.
2. **Auto commit switch with a Cherry commit tool, plus a VS Code style list** — Claude calls
   `commit_changes`, and Cherry runs git. Trade-off: one more tool in the chat while it is on.
3. **Auto commit by letting Claude run `git add` and `git commit`** — what Claude Code does.
   Trade-off: Bash commands ask in Ask mode, and nothing stops `git add -A` from staging a
   secret file.

## Decision

We chose **2**.

- **Auto commit** is a switch per project in the GitHub view, kept in Cherry's own database
  (`project_settings`, migration 006), not in the project folder. While it is on, the chat gets
  the `commit_changes` tool and a prompt line: after each finished piece of work, commit the
  files of that work with a short conventional message. Cherry runs `git add` and
  `git commit -- <files>` as the user (no Claude trailer) and refuses secret files. The tool
  runs without an approval card; push still asks.
- **Source Control** replaces Ready to commit: Staged and Changes lists from `git status`, stage
  and unstage per file or all, a click opens the file, a message box, and **Commit as you**
  (commits only what is staged). Secret files are never staged and a commit with one staged by
  hand is refused. **Write message** asks Haiku for one message from the staged diff, only on a
  click.
- The Haiku grouping and `GET /commits/plan` are removed.

## Consequences

- Good: small commits happen on their own; by hand it works the way the user already knows.
- Good: secret files stay out of commits on both paths.
- Bad / cost: with Auto commit on, Claude spends a few tokens per commit call.
- Supersedes ADR-0018.
