# 0060 — Waiting list, model per stage, cost guard and the release card

- **Status:** Accepted
- **Date:** 2026-11-09
- **Decided by:** Meddy

## Context

The first real V4 run (iub-webapp-course, 2026-11-08) showed four gaps (findings #26, #33, #40,
#49 and the run's cost table). ADR proposals, decision cards and approvals waited in different
places, so a waiting choice could go unseen. Development on Opus cost 78% of the run, and a
two-minute follow-up that resumed a 660k-token session used 37 points of the 5-hour window.
The Designer opened the user's Chrome without the room saying it might. Nothing stopped the
DevOps Engineer from creating a public repository or publishing once it ran in Auto.

## Options

1. **Advice in the prompts only.** Trade-off: no new code, but the run showed agents do not
   always follow it, and the user still cannot see what waits or what a turn will cost.
2. **Cherry shows and checks it, with no model call.** Trade-off: a new optional field in
   `office.json`, a daemon list and a guard on publish commands.

## Decision

We chose **option 2**:

- **Waiting on you:** `GET /api/projects/:id/waiting` lists stage gates, approvals, open
  decision cards and pending ADRs, each with its room. The Office box and a count on each
  stage card use it.
- **Model per stage:** `office.json` gets an optional `models` map (no preset). The room's
  header picks it; the room's chat starts with it.
- **Cost guard:** a chat over half its context window offers Compact or a fresh session with a
  short note from Cherry. With the 5-hour window above 80%, a new job waits for Send anyway,
  Send with Sonnet or Cancel; one go-ahead covers half an hour.
- **Chrome:** when Claude in Chrome is on, the room intro and the statusline say the agent may
  open the user's Chrome. No new setting.
- **Release card:** in the Deployment room of an office project the DevOps Engineer calls
  `confirm_release` (owner, repository, public or private, what is pushed, where it goes live).
  Commands that create a repository or publish (`gh repo create`, `git push`, deploy CLIs,
  `npm publish`) are refused until the user picks Publish on the card. The approval holds for
  that turn only. Not now is the recommended option.

## Consequences

- Good: what waits and what costs is visible in one place, and nothing is published from the
  office without the user's click, even in Auto mode.
- Bad / cost: the publish list is a pattern; a command it does not know is not stopped (the
  normal approval rules still apply outside Auto). `office.json` has one more optional field.
- Follow-up: a run report export (Markdown or CSV) compares a run with plain Claude Code; check
  the cost guard thresholds after the next real run.
