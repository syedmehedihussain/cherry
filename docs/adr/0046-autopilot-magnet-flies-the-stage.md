# 0046 — Autopilot: Magnet flies the stage

- **Status:** Accepted
- **Date:** 2026-10-25
- **Decided by:** Meddy

## Context

When the plan and the design are ready, the user wants to say "do the work" once, leave, and
come back to finished work and a short report. Auto mode (ADR-0025) only removes approval
cards; someone still has to give each next instruction and answer the agent's questions.
Background agents (ADR-0028) work alone but on a side branch, one task each. The user asked
for a button in Plan, Design and Development, not a slash command or a composer mode, and
for Magnet, the assistant, to take over while it is on.

## Options

1. **A longer prompt in Auto mode** ("do every task"). Trade-off: the stage agent decides and
   checks its own work; nobody answers its questions from the documents.
2. **Autopilot: Magnet takes the user's seat.** Magnet gives the stage agent one order at a
   time, answers its questions from the project's documents, decides what they do not say,
   checks each result, and reports. Trade-off: two models talk, so a run costs more tokens.
3. **A queue of background agents, one per task.** Trade-off: many branches to merge, and no
   one keeps the whole picture.

## Decision

We chose **2**.

- **One button per stage** in the top bar: Plan, Design and Development. Not in Deployment:
  deploying leaves the machine and always asks (ADR-0033).
- **Magnet asks first, then waits.** Turning Autopilot on shows Magnet asking "What should I
  do, sir?" with suggestions (for example "Finish M1"). Nothing runs and no tokens are used
  until the user answers. The user answers once; Magnet does the rest.
- **Magnet drives the stage agent.** Its orders show in the chat in place of the user's
  messages, marked MAGNET → BUILDER (or Planner, Designer). The stage agent runs in Auto
  mode. Magnet answers the agent's questions from the PRD, TRD, design handoff, roadmap and
  ADRs, and names the source.
- **Decisions.** When the documents do not decide something, Magnet picks the recommended
  option, writes an ADR with Status Accepted and "Decided by: Magnet (Autopilot)", and lists
  it in Decisions (ADR-0026) for review. The report shows each one with Keep and Change.
- **Limits.** Push, publish, deploy and serious commands are never run; they go to "Needs
  you" (ADR-0028, ADR-0033). Each task must pass its tests before Magnet moves on. A task that
  fails twice stops the run and is reported.
- **Visible.** While on, the top bar pill shows Magnet working (a small bobbing avatar and
  typing dots) and the task count; Esc or a click on the pill stops it after the current step.
- **Report** when the run ends, in ASD-STE100 (ADR-0015): Result, Decisions Magnet made,
  Needs you, Next; links to the tasks, the changes and the full log. A desktop notification
  says it is done (ADR, t12 notifications).
- **Tokens.** Autopilot is a big job and starts only on the user's click (ADR-0022). Magnet
  uses the project's default model; the stage agent uses its own.

## Consequences

- Good: "plan ready, design ready, go" works without the user at the screen.
- Good: every choice Magnet made is written down and easy to undo.
- Bad / cost: more tokens per task than a single agent; a wrong answer from Magnet can carry
  through several tasks before the user sees it, so tests gate every task.
- Follow-up: the Magnet prompt for Autopilot and a stop rule for loops (same order twice).
