# 0058 — Client documents leave as a PDF, made in the browser

- **Status:** Accepted
- **Date:** 2026-11-06
- **Decided by:** Meddy (autonomous build, recorded for review)

## Context

At every gate the user shows the stage's client documents to the client (ADR-0052). The plan left
open how they are shared: a PDF, a shared link, or both. A link the client can open needs the
documents on a server outside this machine, which CLAUDE.md says to ask about first.

## Options

1. **PDF from a print page.** Cherry opens a clean page with the stage's client documents and the
   browser's Save as PDF makes the file. Trade-off: the user sends the file himself.
2. **A shared link.** Trade-off: one click for the client, but the documents go to a host.
3. **Both.**

## Decision

We chose **1** for now. `/p/:id/print/:stage` shows the stage's client documents (all files in
`docs/<stage>/client/`) on a white page with the project and client name, and opens the print
dialog. Nothing leaves the machine. A shared link can come later as its own decision.

## Consequences

- Good: no new dependency, nothing sent off the machine, works for every stage.
- Bad / cost: the user attaches and sends the PDF by hand.
- Follow-up: a shared link, if the user asks for it.
