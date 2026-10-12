# 0020 — Welcome screen on first start

- **Status:** Accepted
- **Date:** 2026-10-11
- **Decided by:** Meddy

## Context

Cherry assumed `~/Projects` as the projects folder. A new user may keep projects somewhere else,
and does not know what the app does or that there are themes. The user asked for a minimal
first-start screen: a short intro, choose or create the projects folder, pick a theme. The
browser never touches the disk, so the folder picker needs the daemon.

## Options

1. **Flag in config.json + two small endpoints** — `onboarded` in config, `GET /api/folders` to
   list sub-folder names, `POST /api/setup` to create and save the folder. Trade-off: one new
   config field.
2. **Flag in localStorage** — Trade-off: every new browser would see the welcome screen again,
   and the folder is per machine, not per browser.
3. **Ask for the folder in the CLI** — Trade-off: no theme step, and the CLI prompt blocks
   `cherry` on first start.

## Decision

We chose **option 1**. A config.json the daemon creates starts with `onboarded: false`; a file
without the field is treated as onboarded, so existing installs and the test fixtures skip the
screen. The Shell sends every route to `/welcome` until setup is done. Four steps: what Cherry
is, the projects folder (path field + one-level folder list with Up; a missing folder is created
on finish), a tool check (Claude Code installed and logged in, git, and the optional `gh` CLI,
from `/api/health` with a recheck when the step opens and on "Check again"; a missing tool warns
but does not block), and the theme cards from Settings.

## Consequences

- Good: a fresh install can live anywhere; the folder list reads names only, no file contents.
- Bad / cost: the folder list can show any folder the user can read (loopback and token only).
- Follow-up: none.
