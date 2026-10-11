# 0015 — Agent reports in ASD-STE100

- **Status:** Accepted
- **Date:** 2026-10-11
- **Decided by:** Meddy

## Context

Scan agents, background agents and subagents write reports that the user reads later, often
quickly. Free-form model prose varies in length and clarity from run to run. ASD-STE100
(Simplified Technical English) is a controlled language for technical text: short sentences,
active voice, a limited vocabulary with one meaning per word.

## Options

1. **Free prose** — no rule. Trade-off: reports vary and can be long-winded.
2. **ASD-STE100 for all agent reports** — one rule in every agent prompt and in the skill.
   Trade-off: the model follows the rule approximately; no checker enforces the dictionary.

## Decision

We chose **ASD-STE100 for all agent reports** because the user asked for it and it makes
reports short and consistent. The rule is in the scan report format, the background agent
prompt and the Cherry skill (which also tells Claude to pass it to any subagent).

## Consequences

- Good: reports are shorter and read the same across agents.
- Bad / cost: approximate compliance only; code, paths and names stay unchanged.
- Follow-up: chat and Magnet replies are not reports and are not covered.
