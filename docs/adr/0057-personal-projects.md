# 0057 — Personal projects use the same stages

- **Status:** Accepted
- **Date:** 2026-11-06
- **Decided by:** Meddy

## Context

The user also builds things for himself as a solo developer. These have no client, no approval
to wait for and no invoice.

## Options

1. **Same seven stages, the user signs off himself.** Trade-off: one pipeline to build and learn.
2. **A lighter pipeline for personal projects.** Trade-off: two flows to keep in step.

## Decision

We chose **1**. A project is `client` or `personal`. Personal projects skip client fields, the
"waiting for client" state and client approvals; the client documents are called **Summary**; the
Invoice tab is **Costs** (services, Claude share, time). Everything else is the same.

## Consequences

- Good: one pipeline; a personal project can become a client project by adding a client.
- Bad / cost: small conditional differences in the sign-off modal, labels and Invoice.
- Follow-up: `kind` in the office state (ADR-0054).
