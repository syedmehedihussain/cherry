# 0050 — The Design brief, and local fonts only

- **Status:** Accepted
- **Date:** 2026-10-25
- **Decided by:** Claude (V3 server run), for review. Fonts: decided for the build in
  docs/v3-start.md ("only fonts installed on the computer and the self-hosted Geist fonts").

## Context

Design (r8) has a Brief panel: references, a design system, components, images, colours and
fonts the Designer works from. It needs a place on disk the Designer can read, and a font list.
ADR-0045 left open whether to offer Google Fonts.

## Options

1. **Google Fonts in the picker.** Trade-off: a big choice of fonts, but the browser and the
   screens would fetch them from Google, which sends data off the machine (CLAUDE.md "Ask
   before").
2. **Fonts installed on the computer, and Cherry's self-hosted Geist.** Trade-off: a smaller
   list, but nothing leaves the machine.

## Decision

We chose **2**.

- `GET /api/fonts` lists the families `fc-list` reports, and Geist and Geist Mono. When
  `fc-list` is missing (macOS without fontconfig), the list is Geist only.
- The brief is `design/brief.json` (schema 1: references, system, components, images as
  `{ kind: file|link, value, note }`; colours primary, accent, surface, text, muted as
  `#rrggbb`; fonts heading, body, numbers as `{ family, weight }`). Dropped files go to
  `design/references/`, `design/system/`, `design/components/` and `design/assets/`.
- Links are kept as text and never fetched. "Find more" opens Pinterest, Dribbble, Mobbin,
  Godly, Land-book and Behance searches in a new tab, only on a click.
- Colours show the WCAG contrast of text on surface.
- "Tell the Designer" sends one message; nothing runs on its own (ADR-0022).
- The Designer's profile says: no web font links in the screens.

## Consequences

- Good: no request leaves the machine; the brief is a plain file the Designer can read.
- Bad / cost: no Google Fonts. The user can change this later with a new ADR.
- Follow-up: the handoff (r9) copies the brief's colours and fonts into the handoff notes.
