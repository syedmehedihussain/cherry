# 0063 — Always-on Cherry: a login service, and a session that stays while you use it

- **Status:** Accepted
- **Date:** 2026-11-10
- **Decided by:** Meddy

## Context

To use Cherry the user had to open a terminal and type `cherry` every time, then open the login
link it printed. The user wants Cherry to behave like other local apps: install it once, and it
is always there at a bookmark, also after a reboot. `cherry install-service` already wrote a
systemd user unit, but the unit had a bare PATH (the daemon could not find `claude` from mise),
did not rebuild the UI after an update, and the session still ended 30 days after login even
for daily use. The user also runs `pnpm dev`, which needs the same port and `~/.cherry`.

## Options

1. **Keep `cherry` in the terminal.** Trade-off: nothing changes; one command and a link each time.
2. **A systemd user service that starts at login, plus a session that renews while used.**
   Trade-off: a background process all the time (idle, loopback only); a stolen cookie stays
   valid as long as it is used, not only 30 days.
3. **A system service that starts at boot (linger).** Trade-off: runs without anyone logged in,
   which Cherry does not need, and needs `loginctl enable-linger`.

## Decision

We chose **option 2**:

- `cherry start` writes `~/.config/systemd/user/cherry.service`, enables it and starts it. The
  unit keeps the PATH `cherry start` ran with (so it finds `claude`, `git`, `gh`), runs
  `cherry build-ui` before each start (rebuilds the UI only when the source is newer), and
  restarts on failure. `cherry stop` stops it and turns always-on off; `cherry restart` restarts
  it, so an update is `git pull && cherry restart`. `install-service` stays as another name for
  `start`. Plain `cherry` starts the service when it is enabled, then prints the login link.
- A session in use is renewed to 30 days from now, at most once a day, with a fresh cookie. A
  session not used for 30 days still ends; `cherry logout` still ends every session.
- `pnpm dev` (scripts/dev.sh) stops the service while dev runs and starts it again on exit.
  `cherry start` refuses while `pnpm dev` runs instead of stopping it.

## Consequences

- Good: Cherry is at http://127.0.0.1:4317 after every login; the terminal is needed only for
  the first login link, updates, and after 30 days without use.
- Bad / cost: an idle Node process all the time. A copied cookie works as long as someone uses
  it; the loopback, Host/Origin and SameSite checks (ADR-0008) still apply.
- Follow-up: macOS (launchd) when Cherry supports macOS (ADR-0013).
