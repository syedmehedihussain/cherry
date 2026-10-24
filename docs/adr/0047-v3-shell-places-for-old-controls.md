# 0047 — Where the V3 shell puts the old controls

- **Status:** Accepted
- **Date:** 2026-10-25
- **Decided by:** Claude (V3 server run), for review

## Context

V3 (ADR-0045) removes the centre tabs, the top-bar Run and Status pills and the always-open
side panel. The artboards show where most things go (rail, palette, status bar) but not every
control. The rule is "no stage shows a panel the user did not open".

## Options

1. **Put each old control back on screen in a quieter form.** Trade-off: the screen fills
   again.
2. **Move each control to the rail, the palette or the status bar, and open a view over the
   stage only on request.** Trade-off: some features need one more key or click.

## Decision

We chose **2**:

- Docs, Notes and tasks, Agents (with scans), Decisions, Status report, Run output and scan
  reports open from the palette (Ctrl K) as a **view over the stage**, with a title and a
  close button. The URLs stay the same (`/p/:id/notes` and so on).
- **Run** is a small item in the status bar (Run, the address while running, or a link to a
  site already up). The palette also has Run and Stop.
- **Live does not open by itself** when Claude uses Chrome (this changes ADR-0038). The rail's
  Live icon shows a dot while Claude works; the chat's Chrome row opens Live.
- **New chat** and **History** are in the palette and the composer (`/clear`, `/resume`);
  History opens as a menu over the chat.
- The status bar shows the number of changed files, not added and removed lines, because the
  API gives file counts only.

## Consequences

- Good: the stage shows only what the stage needs; every old feature still has one way in.
- Bad / cost: the e2e tests open views through the palette and the rail.
- Follow-up: the Deployment cockpit (r10) gets its own Run and preview.
