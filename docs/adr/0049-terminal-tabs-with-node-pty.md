# 0049 — Terminal tabs: xterm.js in the browser, node-pty in the daemon

- **Status:** Accepted
- **Date:** 2026-10-25
- **Decided by:** Claude (V3 server run), for review. The user chose xterm.js and node-pty
  (docs/v3-redesign.md, answer 3); this records how they are used.

## Context

Development in V3 opens terminals as tabs next to the pinned Claude tab (ADR-0045). A real
shell needs a pseudo-terminal, which a browser cannot make (rule 1), so the daemon runs it.

## Options

1. **The daemon owns each shell; the browser attaches over a WebSocket.** Trade-off: shells
   keep running when the tab is hidden or the page reloads, so they must be closed on purpose.
2. **One shell per socket, killed when the socket closes.** Trade-off: simpler, but a reload
   or a tab switch loses the shell and its screen.

## Decision

We chose **1**.

- `TerminalService` spawns `$SHELL` (or `/bin/bash`) with node-pty in the project folder,
  `TERM=xterm-256color`, and keeps the last 256 KB of output to replay when a browser attaches.
- Routes: `GET/POST /api/projects/:id/terminals`, `DELETE /api/projects/:id/terminals/:tid`, and
  the socket `/ws/term/:id/:tid`. The socket is under `/ws/`, so the same checks as the event
  socket apply: loopback, Host, Origin and the session cookie (docs/security.md).
- A terminal belongs to one project; another project's routes cannot reach it. At most eight
  per project. All shells end when the daemon stops.
- The web shows each one with xterm.js (fit addon), coloured from the tokens. Hidden tabs stay
  mounted. After a reload, the tabs come back from the daemon's list.
- No Claude is involved: a terminal costs no tokens (ADR-0022).

## Consequences

- Good: a real terminal in the project, like VS Code's.
- Bad / cost: node-pty is a native module (python3, make, a C++ compiler to build). A shell in
  the browser is as strong as the user's own terminal, so the session cookie protects it.
- Follow-up: none.
