# 0018 — Ready to commit, as the user

- **Status:** Superseded by 0030
- **Date:** 2026-10-11
- **Decided by:** Meddy

## Context

The user wants the GitHub view to list the uncommitted changes as commits that are ready to
make. A click opens one and explains it in ASD-STE100; Commit must be made by the user (their
git identity), not by Claude.

## Options

1. **Claude groups and commits** (a chat turn running `git commit`). Trade-off: commits get
   Claude's trailer and need command approvals; the commit is Claude's action, not the user's.
2. **Claude only suggests; the daemon commits on the user's click.** Trade-off: one Haiku turn
   per new set of changes (up to about a minute on a big diff).
3. **No Claude: one commit with all files.** Trade-off: no grouping, no explanation.

## Decision

We chose **option 2**. Haiku gets the diff (secret files left out, cut to 60 000 characters)
and only the `propose_commits` tool; every changed file ends up in exactly one group, and files
it leaves out go into a last "other changes" group. The plan is cached per project by a
fingerprint of `git status` and `git diff HEAD`; file events do not re-run it, the view has a
Refresh button and a "files changed since" link. Commit runs `git add -A -- <files>` and
`git commit -m … -- <files>` with the user's own `user.name` / `user.email`, no trailer, and
keeps the other suggestions. Secret files are never offered and the route refuses them.

## Consequences

- Good: commits are the user's; the explanation makes each commit easy to check.
- Bad / cost: Haiku usage on each new set of changes; git hooks run as on any commit.
- Follow-up: let the user move a file between groups.
