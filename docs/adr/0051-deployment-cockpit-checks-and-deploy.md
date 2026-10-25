# 0051 — The Deployment cockpit: checks run the project's scripts, Deploy goes to the Shipper

- **Status:** Accepted
- **Date:** 2026-10-25
- **Decided by:** Claude (V3 server run), for review

## Context

The cockpit (r10, artboard 04) shows the app, a list of checks, and one Deploy button. Cherry
must decide which commands the checks run, and how Deploy works without a new way to leave
the machine.

## Options

1. **Checks from package.json, Deploy hands a precise order to the Shipper.** Trade-off: only
   JavaScript and TypeScript projects get checks; deploy still goes through the chat.
2. **Cherry runs the deploy itself (gh, vercel, npm publish).** Trade-off: a second deploy path
   next to the Shipper's skills, and Cherry would need each tool's login.

## Decision

We chose **1**.

- Checks: the scripts `typecheck` (or `tsc --noEmit` with a tsconfig), `lint`, `test:unit` or
  `test`, `build`, and an audit with the project's package manager when there is a lockfile and
  node_modules. They run one after another in the project folder, only on a click (Run all,
  Run again), with CI=1 and no colour, each in its own process group, ten minutes at most. The
  row shows one fact read from the output (passed, KB, high, errors); the output opens on a
  click.
- A failed check has **Fix in Development**: it sends the check, its command and the end of its
  output to the Builder and opens Development.
- The deploy target comes from the files: a Pages workflow, `vercel.json`, `netlify.toml`, a
  public package.json, else a tag and a GitHub release. **Deploy** asks once (what, where,
  version, failed checks, uncommitted files), then sends one order to the Shipper in Ask mode.
  The Shipper's push and publish still ask in the chat (ADR-0033).

## Consequences

- Good: nothing runs without a click; deploys use the Shipper's skills and the existing guards.
- Bad / cost: two asks before a push (the cockpit's summary, then the chat's prompt).
- Follow-up: the browser test (r11) adds its row to the checks summary.
