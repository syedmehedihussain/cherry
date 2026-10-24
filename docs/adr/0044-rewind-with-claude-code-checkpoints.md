# 0044 — Rewind with Claude Code's checkpoints

- **Status:** Accepted
- **Date:** 2026-10-24
- **Decided by:** Meddy

## Context

The Claude Code CLI can rewind (Esc Esc or `/rewind`): pick an earlier message and put back the
code, the conversation, or both. Cherry's chat should do the same (V2.1 w7.9). Cherry runs each
turn as its own Agent SDK query that resumes the Claude session, and keeps its own transcript of
the chat. A spike on 2026-10-24 with Haiku showed that the SDK's file checkpoints still work from
a fresh resume after the turn ended (`rewindFiles`), and that `resumeSessionAt` makes Claude
forget the turns after a given entry.

## Options

1. **Claude Code's own checkpoints** — turn on file checkpointing for project chats, keep each
   user message's checkpoint id and each turn's last session entry, rewind files with
   `rewindFiles` and the chat with `resumeSessionAt`. Trade-off: only Edit/Write changes are
   tracked; what a shell command changed stays, as in the CLI.
2. **Git stash or commits per turn.** Trade-off: touches the user's git state and history, and
   mixes Claude's work with the user's own changes.
3. **Cherry keeps its own copies** of files before each approved edit. Trade-off: a second
   checkpoint system to keep right, while Claude Code already has one.

## Decision

We chose **1** because it is what the CLI does, it never touches git, and the spike showed it
works across Cherry's one-query-per-turn model. The chat transcript is cut by rewriting the
JSONL file; the resume point is kept in `sessions.resume_at` (migration 009) until the next turn
uses it. Rewinding to the first message starts a fresh Claude session.

## Consequences

- Good: Rewind on any sent message (or `/rewind`) offers Code and chat, Chat only, Code only;
  the message goes back into the composer, like the CLI.
- Bad / cost: shell command changes are not undone, and the panel says so. Chats from before this
  change have no checkpoints: only their chat can be rewound, and only after a turn that recorded
  its session entry.
- Follow-up: background agents work in their own worktrees and do not need rewind.
