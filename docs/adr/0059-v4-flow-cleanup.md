# 0059 — V4 flow clean-up: one gate per step, one name per role

- **Status:** Accepted
- **Date:** 2026-11-09
- **Decided by:** Meddy

## Context

The first real V4 run (iub-webapp-course, 2026-11-08) showed V3 parts still active inside the
V4 stage rooms (findings #21, #22, #31, #35, #38, #41, #42, #48, #50 in the run log). Design had
two gates (Approve design and Sign off). ADR cards in docs-only rooms offered "apply in chat" and
"run with agent", and wrote "Done: not yet", although those rooms cannot change code. Stage
agents had V3 names (Planner, Builder) next to the office titles. Development and Testing opened
in "ask before edits" while the earlier rooms were Auto. The Development Gate ticked its steps
only from user clicks, and the prototype approval had no who, date or notes.

## Options

1. **Keep the V3 parts and explain them in the room intro.** Trade-off: two ways to do one step
   stay; the run showed users take the wrong one (#34).
2. **Remove or merge each V3 part into the V4 step it duplicates.** Trade-off: the V3 workspace
   (projects without an office) keeps its own Approve design and apply menu, so both code paths
   stay.

## Decision

We chose **option 2**:

- **Design:** Sign off is the one gate. Signing off Design writes `design/handoff/` (when there
  are screens) and opens the Development room with the Development Team's first message. The
  Design room has no Approve design button; the V3 workspace keeps it.
- **ADRs in docs stage rooms** (Idea, Requirements, Plan, Design) of an office project: Approve,
  Reject, Discuss. Approve accepts the decision on paper (`apply: paper`): Status Accepted, no
  Done line, no task. Discuss puts the ADR in the message box. Development, Testing and
  Deployment keep Apply in chat and Run with agent.
- **One name per role:** the bundled agents use the office titles (System Architect, UI/UX
  Designer, Development Team, DevOps Engineer).
- **Permission mode:** a room with no mode of its own takes the mode last picked in any room of
  the project. Before any pick, docs rooms start in Auto and code rooms in Ask, as before.
- **Development Gate:** before the prototype is approved, `stage_ready` in Development marks the
  prototype ready (`prototypeReady` in `office.json`), not the stage. Client wants changes
  clears it. Record approval asks who, date and notes like a sign-off and logs it in
  `changelog`. The Full build step ticks when the stage is marked ready.

## Consequences

- Good: each step has one control, the names match the Office, and the gate shows what the
  Development Team reported.
- Bad / cost: `office.json` has a new optional field (`prototypeReady`, default false); the
  approve API has a fourth mode.
- Follow-up: the V3 workspace still uses the old Approve design and the apply menu; remove them
  when V3 projects are retired.
