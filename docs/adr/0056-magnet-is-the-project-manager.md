# 0056 — Magnet is the project manager

- **Status:** Accepted
- **Date:** 2026-11-06
- **Decided by:** Meddy
- **Amends:** 0011; supersedes 0046 (Autopilot) together with 0052

## Context

In V3 Magnet was a general assistant and, with Autopilot, could drive a stage. In V4 the staff
agents only work on the user's jobs. The user wants one place to ask how a project is going.

## Options

1. **Magnet as project manager.** Answers about progress, costs, time and what is next, from the
   project's files and office state. Never gives a job to a stage agent.
2. **No Magnet in the office.** Trade-off: fewer moving parts, but no overview.

## Decision

We chose **1**. Magnet is available from every project screen and runs the Meeting tab. It reads;
it never starts or drives an agent. Its answers are one small turn on the user's question.

## Consequences

- Good: a clear role; the overview without opening each stage.
- Bad / cost: Magnet's prompt and tools change; its old proposed actions go.
- Follow-up: Magnet's file in Settings, Agents (`~/.cherry/agents/magnet.md`).
