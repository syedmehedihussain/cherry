# 0021 — Built-in editor

- **Status:** Accepted
- **Date:** 2026-10-11
- **Decided by:** Meddy

## Context

Cherry showed code read-only (old rule 5, PRD non-goal). The user wants to edit any page in the
app without leaving it: code and docs alike. The browser still never touches the disk, so the
daemon must do the write, and it must not clobber a change Claude or another editor made.

## Options

1. **Textarea editor + `PUT /api/projects/:id/file` with an mtime check** — no new dependency.
   Trade-off: no syntax colours while editing.
2. **CodeMirror or Monaco** — Trade-off: a large new dependency (ADR-0003 says ask first).
3. **Keep read-only, rely on Open in editor** — Trade-off: not what the user asked for.

## Decision

We chose **option 1**. **Edit file** in the file viewer swaps the code view for a monospace
textarea (Tab inserts two spaces). **Save** or Ctrl+S sends the text with the mtime the viewer
loaded; the daemon refuses with 409 if the file changed since. It writes atomically and keeps
the file mode. Only existing text files under 1 MB; secret files (`isSecretFile`) and binary files
are refused; the path guard (`resolveInside`) applies. Cancel with unsaved text asks first, and
closing the tab warns.

## Consequences

- Good: quick edits without leaving Cherry; no tokens; no new dependency.
- Bad / cost: plain text while editing; no new-file or rename.
- Follow-up: a richer editor (CodeMirror) if plain text is not enough.
