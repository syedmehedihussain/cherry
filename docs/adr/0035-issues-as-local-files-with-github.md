# 0035 — Issues are local files, with GitHub alongside

- **Status:** Accepted
- **Date:** 2026-10-22
- **Decided by:** Meddy

## Context

The Issues stage (ADR-0034) collects bugs and feedback after a release and hands them to Plan
for the next round. Issues need a home that every project has, that the stage agents can read
and write like any other document, and that also fits projects that already use GitHub Issues.

## Options

1. **Local files only** (`docs/issues/*.md`) — works everywhere, offline. Trade-off: GitHub
   issues stay invisible.
2. **GitHub Issues only** — the open-source standard. Trade-off: only projects with a GitHub
   remote, and every write is an outward action.
3. **Local files, GitHub alongside** — local files are the source of truth; a project with a
   GitHub remote also shows its open GitHub issues, can import one, and can send a local issue
   to GitHub after an approval.

## Decision

We chose **3** (the user's choice).

- One issue per file: `docs/issues/NNNN-short-name.md`, front matter `title`, `status`
  (`open | planned | done`), `type` (`bug | improvement | idea`), `severity`
  (`blocks | annoying | cosmetic`), `cycle` (the spec that took it, or empty), `github` (the
  issue URL once sent or imported, or empty); the body is the report. Committed with the project.
- The Issues stage shows the list, New issue, status changes, and **Plan selected**, which
  opens Plan with a message naming the chosen issue files. The Planner marks them `planned` and
  sets `cycle` when it writes the spec; the Builder or Shipper marks them `done`.
- With a GitHub remote: open GitHub issues are listed (`gh issue list`, cached a minute);
  **Import** writes a local file with the `github` link; **Send to GitHub** runs
  `gh issue create` only after an approval card, then stores the link.

## Consequences

- Good: Plan reads issues as files, the same way it reads everything else; every project gets
  issues, GitHub or not.
- Bad / cost: a local issue and its GitHub copy can drift; Cherry does not sync them both ways.
- Follow-up: two-way sync, if it is ever needed.
