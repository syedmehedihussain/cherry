# 0019 — Three themes: Classic, Cherry dark, Cherry light

- **Status:** Accepted
- **Date:** 2026-10-11
- **Decided by:** Meddy

## Context

Cherry had one dark theme built from the design tokens. The brand sheet
(design-reference/brand-combined-v1) brings its own colours: ink `#1E1414`, cream `#F5EEE4`,
cherry `#5A0F17`, coral `#E07A5F`, muted `#6B5A55`. The user wants the app in those colours
too, as a dark and a light theme, and wants to keep the current look as "Classic". Only colours
and accents change; layout, type and spacing stay the same.

## Options

1. **Override colour tokens per theme with `data-theme` on `<html>`** — one `:root` block per
   theme in `tokens.css`. Trade-off: every raw hex in component CSS must become a token first.
2. **Separate stylesheet per theme, swapped at runtime** — Trade-off: duplicates every
   non-colour token and needs a load step.
3. **Store the choice in the daemon config** — Trade-off: an API change for a per-browser
   preference.

## Decision

We chose **option 1**, with the choice kept in `localStorage` (`cherry.theme`, default
`classic`). The theme blocks also match a nested `[data-theme]`, so the Appearance cards preview
each theme with the real tokens. Raw colours in component CSS became tokens (`--tint`,
`--code-bg-deep`, `--s-float`, `--t-gutter`, `--primary-hover`, `--t-on-accent`, `--knob`,
`--git-untracked`, `--wordmark`); accent tints use `color-mix()` on `--accent`. In Classic each
token has the old value, so Classic looks exactly as before. Code highlighting uses
`github-light-default` in Cherry light.

## Addendum (2026-10-11)

A fourth theme, **Just black**, was added at the user's request: jet black `#000000` page,
white text, a vivid blue accent `#2F7BFF` and brighter status colours.

## Consequences

- Good: one switch in Settings → Appearance; new themes are one token block each.
- The cherry_ wordmark follows the theme: Classic uses `--t1` text and the blue accent cursor;
  the Cherry themes keep the brand cream or cherry text and the coral cursor.
- Bad / cost: the choice is per browser, not per machine.
- Follow-up: status-tint `rgba()` values in component CSS still use the dark-theme hues; they read
  fine on cream but could become tokens if a theme needs it.
