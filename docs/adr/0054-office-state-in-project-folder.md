# 0054 — Office state lives in `_project/office.json`

- **Status:** Accepted
- **Date:** 2026-11-06
- **Decided by:** Meddy

## Context

V4 (ADR-0052) needs per-project state the V3 app does not have: each stage's status, sign-offs
with client approvals, change requests and the change log, the version cycle, costs, time spent
and the token budget. Client names and money must not end up in the client's git repository.

## Options

1. **`_project/office.json`.** Trade-off: personal and never committed (cctop convention), but
   it does not travel to another machine with the code.
2. **A committed file in the repo** (for example `docs/office.json`). Trade-off: travels with the
   code, but client and invoice data land in git.

## Decision

We chose **1**. The daemon reads and writes `_project/office.json` through its API (the browser
never touches the disk); the SQLite cache may index it. The exact shape goes in
`docs/data-model.md` with task o1.

## Consequences

- Good: client and invoice data stay private; same place as STATUS.md.
- Bad / cost: a fresh clone has no office state; Cherry starts it at Idea (or offers to mark
  stages done for an existing project).
- Follow-up: schema and API in o1.
