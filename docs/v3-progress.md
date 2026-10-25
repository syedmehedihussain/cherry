# V3 progress

How to work: [`v3-start.md`](v3-start.md). Newest entries first. Write in ASD-STE100.

## Needs you

- Nothing yet.

## Decisions to review

- Export zips with a small ZIP writer on Node's zlib (no new dependency). Checked with
  unzip and Python's zipfile.
- ADR-0050: the brief in design/brief.json; fonts are the computer's and Geist only (no
  Google Fonts).
- ADR-0049: terminal shells live in the daemon and outlast a reload; the socket is under
  `/ws/` with the same session and Origin checks.
- ADR-0048: how Monaco is used (bundled locally, theme from tokens, Undo puts the last
  commit's text in the buffer and does not save).
- ADR-0047: where the V3 shell puts the old controls (views over the stage from the palette,
  Run in the status bar, Live does not open by itself).

## Blocked

- Nothing yet.

## r9 Design handoff — done 2026-10-25

- Built: Approve design (one confirm that lists what is written) writes `design/handoff/`:
  each screen standalone (CSS and images inside), `tokens.css`, `components.md` (the classes
  the screens share, shared first) and `README.md` (screens, colours, fonts and steps for the
  Builder). The Designer's `notes.md` is never replaced. The project phase moves to
  Development, Development opens, and the Builder's first message waits in the box (not
  sent). Export downloads `<project>-plan-and-design.zip` with CLAUDE.md, README.md, docs/
  and design/ (no secrets, no issues).
- Tests: 434 unit (new: handoff.test.ts), 61 e2e pass.
- Screens: match 02 (Export and Approve design) in Just black and Cherry light.

## r8 Design brief — done 2026-10-25

- Built: the Brief panel left of the canvas. References (drop or pick images, paste links,
  "Find more" links to Pinterest, Dribbble, Mobbin, Godly, Land-book and Behance, opened only
  on a click). Design system and components (files, or the tokens of another Cherry
  project). Images. Five colour slots with a picker and the WCAG contrast of text on surface.
  Fonts for headings, body and numbers with a live sample, from the computer (`fc-list`) and
  Cherry's Geist. "Tell the Designer" sends one message. Saved in `design/brief.json` and
  `design/{references,system,components,assets}/` (ADR-0050).
- Tests: 429 unit (new: brief.test.ts, contrast.test.ts), 60 e2e pass.
- Screens: match 02 (brief, canvas, chat) in Just black.

## r7 Design canvas — done 2026-10-25

- Built: Design is the canvas plus the Designer chat. Every `design/screens/*.html` is an
  artboard in a sandboxed frame (scripts only, no same-origin). The daemon inlines the
  screen's local CSS, fonts and images (inside the project only; no secrets, no web
  addresses), so the frame needs no cookie and loads nothing. Pan (drag, Space or the hand
  tool, wheel), zoom (Ctrl+wheel, 100%), Fit, phone and desktop sizes, light and dark
  (`data-theme` on the screen). Click a screen to focus it, double-click to open it large.
  The comment tool outlines the element under the pointer; a click opens a comment box; Send
  puts "Comment on <file>, element `<selector>`" in the Designer chat and leaves a pin.
- Changed: the Designer's AGENT.md (screens, tokens, brief and handoff paths).
- Tests: 422 unit (new: design.test.ts, frame.test.ts), 59 e2e pass (new: design.spec.ts).
- Screens: match 02 (canvas and chat) in Just black. The Brief panel comes in r8.

## r6 Terminal — done 2026-10-25

- Built: `+` → New terminal opens a real shell in the project folder as a tab (xterm.js in
  the browser, node-pty in the daemon, ADR-0049). The shell keeps running when the tab is
  hidden or the page reloads; its tab comes back with the last output. Closing the tab ends
  the shell. Colours come from the tokens. At most eight per project.
- Dependencies: node-pty 1.1 (native build; python3, make and g++ were on this machine),
  @xterm/xterm, @xterm/addon-fit. `pnpm-workspace.yaml` allows node-pty's build script.
- Tests: 416 unit (new: terminals.test.ts), 58 e2e pass.
- Screens: match 03 `?tab=term` in Just black.

## r5 Code editor — done 2026-10-25

- Built: file tabs use Monaco (ADR-0048), bundled with its workers; no CDN. The theme comes
  from the tokens, so all four themes work. Ctrl+S saves with the unchanged-on-disk check; a
  conflict offers Reload or Overwrite. Unsaved tabs show a dot and survive a tab switch;
  closing one asks first. Lines that differ from the last commit have a gutter mark. A file
  Claude changed shows "Claude changed this file" with Show diff (inline diff) and Undo.
  Markdown files have Preview. Footer: line, column, indent, encoding, language.
- Dependencies: monaco-editor 0.57, @monaco-editor/react 4.7 (approved; ADR-0003 updated).
- Tests: 413 unit, 57 e2e pass. `pnpm --filter @cherry/web build` passes.
- Screens: match 03 `?tab=file` in Just black.

## r4 Development layout — done 2026-10-25

- Built: Development is the explorer (VS Code style: EXPLORER, the project as the root row,
  find a file) and one tabbed area. Claude is the first tab and is pinned; files open as tabs
  and switch back and forth; the chat stays mounted so its scroll and draft stay. Middle
  click or × closes a tab; an unsaved tab asks first. `+` opens a file, `…` has New chat,
  Chat history and Close all tabs. File tabs are kept per project in this browser.
- A file link from any stage (palette, chat) opens Development with its tab. No split.
- Tests: 413 unit, 56 e2e pass (new: dev-tabs.spec.ts).
- Screens: match 03 (tab bar and explorer) in Just black.

## r3 Plan — done 2026-10-25

- Built: Plan is the chat plus a Documents panel. The panel lists the nine plan documents
  (PRD, TRD, architecture, data model, API, roadmap, test plan, ADRs, CLAUDE.md) and ticks
  each one when its file exists, "writing…" while the Planner writes it. Other docs (specs)
  show under More. A click reads the document; Edit and Save (Ctrl+S) use the
  unchanged-on-disk check. Select text: Ask about this (Ctrl L) quotes it in the composer.
  Every file the Planner writes is one line with Open in the chat. No file tree in Plan.
- Changed: the Planner's AGENT.md names the nine documents and their paths;
  project-standard.md lists trd.md, api.md and test-plan.md.
- Tests: 410 unit, 54 e2e pass (new: plan.spec.ts).
- Screens: match 01 in Just black and Cherry light.

## r2 Claude Code chat — done 2026-10-25

- Built: one chat in the CLI look for every stage. `>` user band, `●` text and tool calls
  (`Update(src/app.ts)`, `Bash(pnpm test)`), `⎿` result lines, diffs under allowed edits,
  folded steps (`▸ Read 3 files · 48s`), `✻ Thought for 3s`, a turning-star spinner with a
  verb and the time. Permission prompts inline with numbered answers (1, 2, 3, ↑ ↓ Enter,
  Esc says No and asks why). The input: `>` box, hint line with the mode (Shift+Tab cycles),
  model and effort, context, `/ commands`, `@ files`, `? shortcuts`.
- Kept: slash commands, @ mentions, compact, history, rewind, attachments, Esc stops.
- Tests: 407 unit, 53 e2e pass.
- Screens: match 01, 03 and 07 in Just black and Cherry light.

## r1 Shell — done 2026-10-25

- Built: top bar with four numbered stage tabs and progress lines, project switcher, search.
  Right rail (Overview, Live, GitHub, Chat), closed by default, Ctrl+B. Status bar (branch,
  changes, Run, agent, model, context, plan use). Command palette (Ctrl K) with views, stages,
  actions and files (`>` for files only). Old centre tabs open as views over the stage.
- Removed: Preparation and Issues tabs (old chats load in History), the Readiness box.
- Tests: 396 unit, 53 e2e pass. Fixed a test that broke when /tmp has a folder named "*up*".
- Screens: shell matches 01, 05, 06 in Just black and Cherry light. The Overview content keeps
  its old cards; r12 makes it flat.

## r0 Artboards — done 2026-10-25

- Built: 10 artboards and an overview page in `docs/design/screens/v3/` (Plan, Design,
  Development with tabs, Deployment, side view open, command palette, permission prompt,
  Autopilot ask, flying and report).
- Checked: screenshots at 1440 × 900 in Just black, Classic and Cherry light.
- Decisions: ADR-0045 (four stages), ADR-0046 (Autopilot). The user approved the screens.
- Next: r1 Shell.
