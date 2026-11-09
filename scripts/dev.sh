#!/usr/bin/env bash
# pnpm dev: runs the daemon and the web UI from source with reload. Both need port 4317 and
# ~/.cherry, so the always-on Cherry (ADR-0063) is paused while dev runs and started again after.
set -u
paused=0
if command -v systemctl >/dev/null && systemctl --user is-active --quiet cherry.service 2>/dev/null; then
  echo "Pausing the always-on Cherry while pnpm dev runs."
  systemctl --user stop cherry.service && paused=1
fi
resume() {
  if [ "$paused" = 1 ]; then
    echo "Starting the always-on Cherry again."
    systemctl --user start --no-block cherry.service
  fi
}
trap resume EXIT
pnpm --parallel --filter @cherry/daemon --filter @cherry/web dev
