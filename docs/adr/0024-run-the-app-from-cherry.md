# 0024 — Run the project's app from Cherry

- **Status:** Accepted
- **Date:** 2026-10-12
- **Decided by:** Meddy

## Context

While building a project in Cherry, the user had to leave for a terminal to start the dev server
and see the app. They asked for a Play button near Status that runs the whole app on localhost,
holding the terminal and dev server inside Cherry. It must cost no tokens and must not need a new
dependency or a change to `project.json`.

## Options

1. **Detect the command from the project's files, plain pipes** — no tokens, no new dependency.
   Trade-off: not a real terminal (no input, no TTY colours); unusual projects are not detected.
2. **Ask Claude how to run it** — handles anything. Trade-off: tokens on every new project.
3. **A full terminal with node-pty** — interactive. Trade-off: a native dependency (not in ADR-0003).
4. **A `run` field in project.json** — user-set command. Trade-off: changes the data model format.

## Decision

We chose **option 1**, for websites only: Run must start something that serves a page on
localhost, never an install script or a command-line program that runs and exits. The daemon
picks the first match: a `dev`, `start`, `serve` or `preview` script in package.json whose text
names a web tool (vite, next, astro, react-scripts, serve …) or whose package depends on a web
server (express, fastify, next, vite …), run with the lockfile's package manager, installing
first when `node_modules` is missing and building first for `preview`; Django `manage.py`;
Flask or FastAPI (`app.py`/`main.py` with the dependency listed); a Rust or Go project that
depends on a web framework; or `python3 -m http.server` for a static `index.html`. Makefiles,
shell scripts and other programs are never run. It spawns `sh -c <command>` in its own process
group with `BROWSER=none`, `NO_COLOR=1` and `PYTHONUNBUFFERED=1`, keeps 64 KB of output in
memory, strips colour codes and finds the first local address the app prints. One run per
project.

A site that is already running from the project folder (a dev server Claude started in a chat,
or one from a terminal) is found too: the daemon reads the local listening ports from
`/proc/net/tcp*`, keeps those whose process works inside the folder, and checks each answers
HTTP. The button then is a link to it that opens in a new tab. The UI asks every 5 seconds while
the page is visible; it is local file reads only, no tokens.

The Run button sits before Status in the top bar and is hidden when nothing is detected. A click
starts the app and opens the Run tab (status, command, Open, Restart, Stop, live output). While
it runs, the button shows the address.

## Consequences

- Good: one click from code to a running app; no tokens; Stop ends the whole process tree.
- Bad / cost: output only, no typing into the process; a project with an unusual setup has no
  button. Output is lost when the daemon restarts (the app is stopped then too).
- Follow-up: finding running sites needs /proc, so on macOS (ADR-0013) only Run-started apps
  show until an `lsof` fallback is added. A `run` override in project.json and a real terminal (node-pty) if needed; both
  need the user's yes (data model format, new dependency).
