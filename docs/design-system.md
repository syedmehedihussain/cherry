# Design system

Source of truth: the artboards in [`design/screens/`](design/screens/) and the tokens in
[`design/tokens.css`](design/tokens.css). This page explains the rules behind them.

## Feeling

Calm, quiet, precise. An engineer's control room, not "AI magic". Near-black surfaces, thin
borders, lots of breathing room, **one accent colour (blue)**, and colour used only for meaning.

## Colour

Four themes, picked in Settings → Appearance (ADR-0019). The table is **Classic**, the original
look. **Cherry dark** (ink surfaces, cream text, coral `#E07A5F` accent), **Cherry light**
(cream page, ink text, cherry `#7A1622` accent, darker status and file-type colours) and **Just black** (jet black `#000000`, white text, vivid blue `#2F7BFF` accent,
brighter status colours) override the colour tokens at the end of `docs/design/tokens.css`. In the Cherry themes the accent takes
the place of blue in the rules below.

| Role | Token | Value | Use |
| --- | --- | --- | --- |
| Page | `--bg` | `#0B0B0C` | background |
| Surface 1 | `--s1` | `#141416` | cards, panels, tables |
| Surface 2 | `--s2` | `#1C1C1F` | inputs, secondary buttons, "why" box |
| Surface 3 | `--s3` | `#26262A` | selected row, active nav, done phase pills |
| Border | `--b` | 8 % white | every hairline |
| Border strong | `--bs` | 14 % white | inputs, decision/approval cards, dashed "future" |
| Text 1 | `--t1` | `#EDEDEF` | primary text, primary button fill |
| Text 2 | `--t2` | `#A1A1AA` | secondary text |
| Text 3 | `--t3` | `#85858F` | hints (raised for 4.5:1 contrast) |
| Accent | `--accent` | `#5B8DEF` | focus ring, current phase, radio dots, selection |
| Accent text | `--accent-text` | `#8DB0F4` | links, accent words |
| Success | `--success` | `#3FB950` | Ready, Done, clean, Claude Code OK, "Ran ✓" |
| Warning | `--warning` | `#D29922` | Not calibrated, Waiting, approval needed, behind |
| Danger | `--danger` | `#F85149` | Failed, Deny, deleted |
| Edited | `--edited` | `#A371F7` | Claude's edits ("Edited" rows, "Claude touched") |

Status pills use the colour as text on a 12 % fill of the same colour, with a 6 px dot.

**Rules**
- Never use colour alone: every status also has a word ("Ready", "Failed") or a letter (M, A, U, D).
- Blue means "you / focus / now". Do not use blue for status.
- The only gradient is the soft blue glow at the top of Home (`--home-glow`).

## Type

- **Geist** for UI, **Geist Mono** for code, paths, commands, branch names, hashes, git chips.
- Weights: 400, 500, 600 only.
- Scale (px): 11 · 11.5 · 12 · 12.5 · 13 · 13.5 · 14 · 16 · 20 · 28 · 32. Base UI is 13.
- Chat body 14 / 1.65. Docs reader body 14.5 / 1.7, max width 720 px.
- Titles get `letter-spacing: -0.01em`; the Home title `-0.025em`.
- Section labels in sidebars: 11 px, 500, uppercase, `0.04em` tracking, `--t3`.

## Spacing and shape

- 4 px grid. Common gaps: 4, 6, 8, 10, 12, 14, 16, 20, 24.
- Radius: 3 (bars) · 6 (chips, tags) · 8 (nav rows) · 10 (inner boxes, options) · 12 (cards) ·
  14 (decision/approval cards) · 16 (Home prompt) · pill (all buttons and badges).
- Shadows: almost none. Depth comes from surface steps and borders. Floating things (toasts,
  Magnet slide-in) get `0 12px 32px rgba(0,0,0,.45)`.

## Layout

- Top bar 56 px, bottom border. Left: logo + breadcrumb. Centre: phase bar (workspace only).
  Right: Claude Code status dot, Settings, Magnet avatar button.
- Workspace grid: **280 px | flexible | 360 px**, each column scrolls on its own.
- Survey grid: **240 px | flexible | 300 px** (step 7: 380 px right for the file preview).
- Calibration: **280 | flexible | 360** (review step: 280 | 400 list | flexible preview).
- Settings: **260 px nav | content** (content max 920 px).
- Home: centred, max 1088 px, 72 px top padding.
- Designed at 1440 × 900. Must work from 1366 to 1920 wide. Below 1280 the right panel collapses
  to an icon rail (P1).

## Buttons

| Kind | Look | Use |
| --- | --- | --- |
| Primary | white pill (`--t1` fill, `--bg` text), 500 weight | one per view: Confirm, Allow, Start project, Create project |
| Secondary | `--s2` fill, `--b` border | Allow for this session, Pull, Review diff |
| Ghost | no fill, `--t2` text | Not now, Cancel, Change, Why Claude recommends it |
| Deny / danger | `--danger-text` text, transparent, red border on hover | Deny, Discard |
| Icon | 32 px circle, `aria-label` required | Settings, Magnet, Send |

Heights: 30 (panels), 32/36 (cards), 44 (main page CTAs). Disabled = 40 % opacity, no hover.

## Icons

Inline stroke SVG, 1.6–1.8 stroke, round caps, 14–16 px. Use **Lucide** in code (same style).
No emoji anywhere.

## Motion

Small and functional. 120–200 ms with `--ease`.
- Spinner (`ap-spin` 0.8 s) for Running.
- Pulse (`ap-pulse` 1.4 s) for the status dot while Claude works and the amber "waiting" dot.
- Indeterminate bar (`ap-slide` 1.6 s) under "Claude is working" and the calibration scan.
- Shimmer (`ap-shimmer`) for "Drafting options…" skeleton rows.
- Respect `prefers-reduced-motion`.

## Accessibility

- Text contrast 4.5:1 (that is why `--t3` and `--accent-text` were raised).
- Real `<button>`, `<a>`, `<input>` + `<label>`. Icon buttons have `aria-label`.
- Decision options are a radio group (`role="radiogroup"`, arrow keys move, Enter confirms).
- Approval cards get focus when they appear; **Allow** is not the default focus — the card is,
  so a stray Enter never approves.
- Keyboard: `⌘/Ctrl+K` command palette (P1), `⌘/Ctrl+Enter` send, `Esc` closes panels.

## Magnet

Original robot butler: round visor head with two eyes, one antenna, bow tie, small body, one
wheel. Sizes 96, 48, 24, and a 16 px mono glyph (bow tie and arms drop out below 24 px). The
SVG source is in `design/screens/Components.dc.html` — extract it into
`packages/web/src/assets/magnet/*.svg`.

## Brand

The brand kit comes from the user's brand sheet ("Combined v1"). The sheet itself is a local,
git-ignored reference in `design-reference/brand-combined-v1/`; the files below are made from
it. Brand colours are tokens (`--brand-*` in `tokens.css`) and are only for the logo, wordmark
and icons, never for UI states.

| Token | Hex | Use |
| --- | --- | --- |
| `--brand-cherry` | `#5A0F17` | badge, icon tile, wordmark on cream |
| `--brand-cream` | `#F5EEE4` | wordmark on dark, icon branch, app icon tile |
| `--brand-coral` | `#E07A5F` | the typing cursor |
| `--brand-leaf` | `#2F5D3A` | branch cherry stems |
| `--brand-ink` | `#1E1414` | dark brand card |

**Pieces**

- **Badge**: the user's "CHERRY" lettering in a burgundy cherry (`docs/design/brand/cherry-badge.png`,
  the original). The UI uses a 192 px copy (`packages/web/src/assets/brand/cherry-badge.png`).
  Use it above 32 px, and in the top bar (28 px; the user chose the badge there).
- **Branch cherry icon**: a cream branch cherry on a burgundy tile (radius 25 %). At 32 px and
  below the badge letters blur, so this icon takes over: favicon
  (`icon-32.svg`, `icon-16.svg`; the 16 px one has thicker strokes). The full-colour branch
  cherry (leaf stems, coral bud) is `branch-cherry.svg`.
- **Wordmark**: `cherry` in lower case, JetBrains Mono, tracking -0.05 em, then an underscore
  cursor in coral that blinks (1.1 s, on for 55 %). It is drawn as outlines
  (`components/Brand/wordmark-path.ts`, `wordmark.svg`, `wordmark-cream.svg`), so the app loads
  no font. The outlines use the Bold weight (the sheet shows ExtraBold; Bold is the weight
  installed here). Cream on dark, burgundy on cream. The cursor stops blinking with
  `prefers-reduced-motion`.
- **Lockup**: badge + wordmark (`lockup-light.svg`, `lockup-dark.svg`; the cursor blinks in
  the SVG). The README shows the one that fits the reader's theme.
- **Tagline**: `$ cherry-pick your workflow` with a coral block cursor (login gate, CLI help).
- **App icons**: the badge on a cream tile with a thin `#E3D6C8` ring: `apple-touch-icon.png`
  (180), `icon-192.png`, `icon-512.png` (web manifest), `docs/design/brand/app-icon-512.png`.

**Where they are used**

| Place | Piece |
| --- | --- |
| Top bar, every page | lettered badge 28 px + wordmark 15 px with cursor (theme colours) |
| Home, above "What are we building?" | cream wordmark 44 px with cursor, no logo |
| Login and "not running" gate | badge 56 px + wordmark + tagline |
| Browser tab | `favicon.svg`, `favicon-32.png`, `favicon-16.png` |
| Home screen / installed app | `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `site.webmanifest` |
| README | `lockup-dark.svg` / `lockup-light.svg` + tagline |
| `cherry --help` | first line ends with the tagline |

The artboards show an "H" (for Harness) in the badge's place; build it with these pieces.
