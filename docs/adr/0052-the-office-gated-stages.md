# 0052 — The Office: gated stages, staff agents, client sign-off

- **Status:** Accepted
- **Supersedes:** 0046; parts of 0045 (open stages, stage tabs)
- **Date:** 2026-11-06
- **Decided by:** Meddy

## Context

V3 (ADR-0045) has four stages that are always open, and Autopilot (ADR-0046) lets Magnet run a
stage alone. The user wants Cherry to work like a software company that builds an app for a
client: stages in order (Idea, Requirements, Plan, Design, Development, Testing, Deployment),
an expert agent in each, client approval at each gate, and a maintenance mode after the app is
live. He also wants nothing to run without him, because he is on a $20 plan. The full plan is
in `docs/v4-office.md`.

## Options

1. **Keep V3 and add documents.** Trade-off: small change, but stages stay open and nothing
   makes the work go in order or keeps the client in the loop.
2. **The Office.** Seven gated stages with a staff agent each, client and technical documents,
   sign-off gates, change control, a stage home instead of tabs, and a maintenance mode after
   deployment. Trade-off: a big change to the web package and new project state in the daemon.

## Decision

We chose **2**.

- Stages: idea, requirements, plan, design, development, testing, deployment. Only Idea is
  open in a new project. Each stage opens when the one before it is signed off.
- The agent says when a stage is ready; the user signs it off; a client approval (or
  "internal only") is needed.
- Stages are windows on the project home, not tabs.
- After Deployment the project is Live and the home becomes Maintenance (support, QA, issues,
  bug fixing, upgrades, new version). A new version runs a new cycle while the old one stays
  live.
- Changes after sign-off: small changes are logged; big changes are change requests with an
  impact note, and affected stages get a "needs update" flag.
- **Nothing runs without the user.** An agent starts work only when the user gives it a job.
  Autopilot (ADR-0046) is removed, and there are no background or scheduled runs.
- **Auto mode stays** (ADR-0025). Once the user gives a job, the agent may finish it without an
  approval for each command. Deploy, push and publish always ask.

## Consequences

- Good: the work follows real software engineering; the client sees each step; the code
  follows a fixed plan; tokens are spent only when the user asks.
- Bad / cost: supersedes parts of ADR-0045 (open stages, tabs) and all of ADR-0046; new
  daemon state (stage status, sign-offs, approvals, change requests, versions); new screens.
- Follow-up: ADRs for the project-state data model, the client-document export, and the
  Maintenance screen; new agents and skills for Idea, Requirements and Testing; artboards for
  the home and stage windows.
