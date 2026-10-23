# 0038 — Claude in Chrome runs without asking, and its steps show in Live

- **Status:** Accepted
- **Date:** 2026-10-23
- **Decided by:** Meddy
- **Amends:** 0037 (its approval rules)

## Context

ADR-0037 made Chrome actions ask in every mode and JavaScript ask every time. In use, a check of
the app is dozens of steps, so the user clicked Allow over and over, mostly on `javascript_tool`.
Cherry has one user on a loopback daemon, and the Chrome tools load only after that user turns
the setting on. Each step also added a row to the chat, which buried Claude's text.

## Options

1. **Keep the cards, add Allow for this session everywhere** — Trade-off: still a card per
   new kind of step, in every chat.
2. **No cards once the setting is on, like the CLI after "don't ask again"** — Trade-off: Claude
   can act in the signed-in browser without a check per step.

## Decision

We chose **2**. With Settings → General → Claude in Chrome on, every `mcp__claude-in-chrome__*`
tool runs without an approval card, in every mode. The prompt rule stays (new tab, other tabs
untouched, no payments, passwords or messages). Agents, scans, Magnet and calibration still run
with `--no-chrome`.

The chat shows one row per reply, "Used Chrome · N steps", with the last step. The Live view
has a **Chrome** box: the page Chrome is on, the latest steps with what Chrome answered, and
failures. The side panel switches to Live once when Chrome starts in a reply.

## Consequences

- Good: a browser check runs on its own, like in the CLI; the chat stays readable.
- Bad / cost: the only check on Chrome is the switch and the prompt rule. Turn the switch off
  when you do not need it.
