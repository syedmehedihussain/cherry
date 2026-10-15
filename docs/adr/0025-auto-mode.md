# 0025 — Auto mode: Claude works without asking for most edits and commands

- **Status:** Accepted
- **Date:** 2026-10-15
- **Decided by:** Meddy

## Context

Every edit and every command in a Cherry chat waits for an approval card. That is safe, but for
trusted work it is slow: the user has to sit and click Allow many times in one turn. Claude Code
has an auto mode that runs most things without asking. The user asked for the same in Cherry.
The must-pass safety rules (docs/security.md) still have to hold.

## Options

1. **A third chat mode, Auto, next to Ask and Plan, with a short "still asks" list** — fast, and
   the risky things still stop. Trade-off: Claude can run a harmful command that the rules do
   not name.
2. **Allow everything that isn't blocked** — simplest. Trade-off: a push or a publish leaves the
   machine with no review.
3. **A classifier model that judges each call** — closest to Claude Code. Trade-off: tokens on
   every tool call, which breaks the token budget rule (ADR-0022).

## Decision

We chose **option 1**. The composer's Plan mode chip became a mode menu: **Ask** (default),
**Auto** and **Plan**. The mode is sent with each message (`mode` replaces `planMode` in
`POST /chat`) and remembered per project in the browser. In Auto mode, edits inside the
project and commands run without a card, except `git push`, GitHub writes, publishing and
deploying, and `rm -r`. Those still show the normal approval card. Blocked commands, edits
outside the project and secret files are refused in every mode. Background agents get the same
switch in their task box.

## Consequences

- Good: long tasks run with no clicks; every call still shows in the timeline.
- Good: the safety tests run in Auto mode too.
- Bad / cost: a destructive command that the rules don't name (for example `git reset --hard`)
  runs without asking. The user chooses Auto knowing this.
- Follow-up: big project choices go to the Decisions tab (ADR-0026), so Auto mode never makes
  them by itself.
