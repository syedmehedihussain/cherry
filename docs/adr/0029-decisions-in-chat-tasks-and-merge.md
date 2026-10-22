# 0029 — Decisions: approve in the chat, wait as a task, run with an agent, merge with an agent

- **Status:** Accepted
- **Date:** 2026-10-22
- **Decided by:** Meddy

## Context

Decisions (ADR-0026) waited only in the Decisions tab. When Claude proposed one in the middle
of a chat, the user had to leave the chat to approve it. "Approve only" changed the ADR and
nothing else, so the approved work was easy to forget. An agent that applied a decision ended
with a plain "Done", and when its branch conflicted with the user's branch, Accept said "merge
in a terminal". The user wants: approve where you are, approved-for-later work in the tasks,
an agent that says "tested, ready to merge", and a Merge that gets the work in.

## Options

1. **Keep the Decisions tab as the only place** — no new code. Trade-off: the user leaves the
   chat for every decision and handles conflicts by hand.
2. **Same card in the chat, task link by title, agent conflict fix in its own worktree** — the
   ADR file stays the record; tasks.json keeps its format. Trade-off: the link between a task and
   its decision is the title prefix "Apply ADR-NNNN:".
3. **New task field for the ADR number** — a firm link. Trade-off: changes the tasks.json format
   in project-standard.md, which every project shares.

## Decision

We chose **2**.

- **In the chat:** under Claude's "Proposed decision" row the chat shows the same card as the
  Decisions tab (Approve menu, Reject). If Claude is still replying, "apply in chat" waits and
  is sent when the turn ends (ChatService queues messages Cherry sends for the user).
- **Approve only** adds the task "Apply ADR-NNNN: title" to `_project/tasks.json`. Mark done on
  the decision ticks the task; ticking the task marks the approved decision done. Reject removes
  the open task.
- **Run with agent** (was "Start agent"): the prompt asks the agent to build, run the tests, and
  end with "Ready to merge" only when they pass. The notification then says
  "Ready to merge: ADR-NNNN title".
- **Merge** (was Accept) runs `git merge` as before. A conflict now answers `409 merge_conflict`
  and the card offers **Merge with agent**: Cherry merges the user's branch into the agent branch
  in the agent's worktree; with no conflicts it merges at once, otherwise the same agent fixes
  the conflict files and runs the checks. When it reports "Ready to merge" and no markers are
  left, Cherry merges and notifies "Merged"; otherwise the agent fails with the reason.

## Consequences

- Good: a decision goes from proposal to merged work without leaving the chat or a terminal.
- Good: tasks.json and the ADR format do not change.
- Bad / cost: renaming an "Apply ADR-…" task by hand breaks its link (it is then a normal task).
- Bad / cost: Merge with agent uses an agent run (tokens) on the user's click.
- Amends ADR-0026 (labels, task link) and ADR-0010 (Accept is now Merge, plus Merge with agent).
