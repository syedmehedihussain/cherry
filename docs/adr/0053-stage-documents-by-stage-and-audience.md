# 0053 — Stage documents: one folder per stage, split client and technical

- **Status:** Accepted
- **Date:** 2026-11-06
- **Decided by:** Meddy

## Context

In V4 (ADR-0052) every stage writes two kinds of documents: client documents (plain language,
for the client to read and approve) and technical documents (for the next agents). The user
shows one stage's documents to the client at each gate, so they must be easy to find and share
per stage. The V3 layout keeps the plan documents flat in `docs/`.

## Options

1. **`docs/<stage>/client/` and `docs/<stage>/technical/`.** Trade-off: deeper paths, but one
   stage's client documents sit in one folder, ready to share or export.
2. **`docs/client/` and `docs/technical/`, a file per stage.** Trade-off: fewer folders, but
   the client and technical sides of one stage are far apart.

## Decision

We chose **1**. Stage folders are `idea`, `requirements`, `plan`, `design`, `development`,
`testing`, `deployment`. ADRs stay in `docs/adr/`. The Design stage's screen files stay in
`design/` (the canvas reads them there); its client and technical write-ups go in
`docs/design/`.

## Consequences

- Good: one folder per gate to show the client; the next agent reads `technical/` only.
- Bad / cost: V3 projects have flat plan documents in `docs/`; Cherry must read them where
  they are and not move them without approval (rule 3).
- Follow-up: the stage agents' prompts name these paths; the project-state data model
  (stage status, sign-offs, approvals) gets its own ADR.
