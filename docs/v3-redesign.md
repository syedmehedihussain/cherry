# V3 — Redesign: four stages, each its own kind of place

Written 2026-10-25 from the user's brief. This page is the plan. The tasks are in
[`roadmap.md`](roadmap.md) under **V3**; the decision is [ADR-0045](adr/0045-four-stage-redesign.md).

## Why

Cherry grew one feature at a time. Every stage now looks the same (one chat, the same side
panels, the same tabs), and the screen is full of boxes, pills, cards and text the user did not
ask for. The user's real day looks like this:

1. **Plan** in claude.ai: talk, and Claude writes a folder of documents (PRD, technical
   requirements, architecture, data model, API, roadmap, test plan, ADRs).
2. **Design** in Claude Design: references, a design system, colours, fonts, screens, then a
   design handoff.
3. **Development** in Claude Code, next to an editor like VS Code, with the plan and the
   handoff in the repo.
4. **Deployment**: run the app, test it, ship it.

V3 makes Cherry that day in one place. Each stage looks and feels like the tool the user uses
for it today. Everything else goes out of sight until the user asks for it.

## Rules for the whole redesign

- **Minimal by default.** A stage shows only what that stage needs. Every other view is one
  click or one key away (the right rail, the command palette), never on screen by default.
- **Every chat is Claude Code.** One chat component, styled and behaving like the Claude Code
  CLI (see "The Claude Code look" below), used in every stage.
- **Quiet.** No permission cards for things the user already allowed, no long tool logs in the
  main view. Work folds into one line; details open on a click.
- **Nothing is deleted from the daemon.** Old features (Magnet, background agents, scans,
  decisions, notes and tasks, status report) stay working. They move to the right rail or the
  command palette. Code that has no place any more is removed only after the stage that
  replaces it is done.
- **Every report and summary is in ASD-STE100** (ADR-0015): short sentences, technical
  facts first, readable at a glance. This covers Autopilot reports, test results, handoff
  notes and status updates.
- **The browser still never touches the disk** (rule 1), and the token rule (ADR-0022) stands.

## Shell (all stages)

```
+--------------------------------------------------------------------------------+
| cherry_  project v   Plan   Design   Development   Deployment       [?] [=]   |  top bar, 40 px
+--------------------------------------------------------------------------------+
|                                                                            |O|
|                                                                            |L|
|                     the stage's own layout                                 |G|
|                                                                            |C|
|                                                                            | |
+--------------------------------------------------------------------------------+
| main  +2 -1   Opus   ctx 34%   5h 12%                              Ctrl+K     |  status bar, 22 px
+--------------------------------------------------------------------------------+
```

- **Top bar:** brand, project switcher, the four stage tabs, settings. A stage tab shows its
  progress as a thin line under the name (ADR-0040), not a pill or a number.
- **Right rail:** a column of icons like the VS Code activity bar: Overview, Live, GitHub,
  Chat. Closed by default. A click opens that view as a panel; a second click closes it.
  `Ctrl+B` toggles it. The choice is kept per browser.
- **Status bar:** branch and changes, model, context use, plan usage, `Ctrl+K`. Each item opens
  the matching view on a click.
- **Command palette (`Ctrl+K`):** every action and every hidden view: open file, switch stage,
  new chat, history, background agents, scans, decisions, notes and tasks, status report,
  settings, run, push.
- **Stages are free.** Any stage opens at any time, at any progress. The next-step chip at 100%
  ("Plan is done. Move to Design?") is a suggestion, never a gate.

## Plan: a Claude chat that writes documents

Feels like claude.ai with artifacts, in the Claude Code look.

```
+--------------------------------------------+-----------------------------------+
|                                            | Documents            6 of 9      |
|  > I want an app that tracks my runs       |  [x] PRD             docs/prd.md |
|                                            |  [x] Technical req.  docs/trd.md |
|  * Good. A few questions first:            |  [ ] Architecture                |
|    1. Phone or web?  ...                   |  ...                             |
|                                            +-----------------------------------+
|  * Wrote docs/prd.md            [Open]     |  # PRD                           |
|                                            |  (the open document, rendered,   |
|  +--------------------------------------+  |   editable, select text to ask   |
|  | >                                    |  |   about it)                      |
|  +--------------------------------------+  |                                  |
+--------------------------------------------+-----------------------------------+
```

- Chat in the centre, wide and calm. No file tree.
- **Documents panel** on the right: the documents this project needs (from the Planner's
  checklist, ADR-0040), each ticked when written. A click opens it below the list, rendered
  Markdown, with **Edit** (the built-in editor, rule 5).
- Every file the Planner writes shows in the chat as one line with **Open**.
- **Ask about this:** select text in a document and the selection goes into the composer as a
  quote.
- The Planner's set of documents: PRD, technical requirements (TRD), architecture, data model,
  API, roadmap with milestones, test plan, ADRs, `CLAUDE.md`. It asks before it writes; it
  writes only docs (ADR-0034 guard).
- **Approve plan** (ADR-0041) stays: it hands the roadmap to Development.

## Design: Claude Design, in Cherry

Can Cherry do what Claude Design does? **Mostly yes.** Claude Design is a chat next to a canvas
where Claude writes HTML/CSS screens. Cherry can do the same: the Designer writes each screen
as an HTML file in `design/screens/`, and Cherry renders them on a canvas in sandboxed iframes.
What Cherry cannot copy is Claude Design's own hosted features (its sharing, its built-in
image generation). Images come from the user's files and references instead.

```
+-------------+--------------------------------------------------+---------------+
| Brief       |                                                  |  Chat         |
|  References |   +--------+   +--------+   +--------+           |  (Claude Code |
|  Design sys |   | Home   |   | Detail |   | Login  |           |   look)       |
|  Components |   |        |   |        |   |        |           |               |
|  Images     |   +--------+   +--------+   +--------+           |               |
|  Colours    |                                                  |               |
|  Fonts      |   canvas: pan, zoom, click a screen to focus,    |               |
|             |   click an element to comment on it              |  > ...        |
+-------------+--------------------------------------------------+---------------+
```

- **Brief panel (left):** what the Designer works from, kept in `design/brief.json` and
  `design/references/`:
  - **References:** drop images, paste links. The Designer suggests where to look (Pinterest,
    Dribbble, Mobbin, Godly, Land-book, Behance) as links the user opens; Cherry never fetches
    those sites by itself.
  - **Design system:** attach a tokens file, a folder, a zip or an existing project's
    `docs/design/`.
  - **Components:** attach a component library's docs or screenshots.
  - **Images:** logos, photos, icons for the screens.
  - **Colours:** a picker and palette slots (primary, accent, surface, text), with contrast
    shown.
  - **Fonts:** a picker with live preview (see open question on Google Fonts).
- **Canvas (centre):** every screen as an artboard. Pan, zoom, fit. Click a screen to open it
  large; click an element to leave a comment that goes to the chat with the element's selector.
  Light/dark and phone/desktop toggles.
- **Chat (right):** the Designer, in the Claude Code look.
- **Handoff:** **Approve design** writes `design/handoff/` (screens, `tokens.css`, a component
  list, notes for the builder) and opens Development. **Export** zips plan plus handoff for use
  outside Cherry.

## Development: VS Code with Claude Code as the first tab

```
+-------------+------------------------------------------------------------------+
| EXPLORER    | [* Claude] [runs.ts x] [db.ts *] [Terminal x]              + ... |
|  > src      +------------------------------------------------------------------+
|    app.ts M |                                                                  |
|    index.css|        > add login                                               |
|  > docs     |        * Read src/app.ts                                         |
|             |          L 120 lines                                             |
|             |        * Update(src/app.ts)   L +12 -3                           |
|             |        * Simmering... (8s . esc to interrupt)                    |
|             |        +----------------------------------------------+          |
|             |        | >                                            |          |
+-------------+------------------------------------------------------------------+
```

- **Explorer (left):** the file tree as VS Code shows it: git letters, folders, filter.
- **One place in the middle, with tabs.** The Claude chat is the first tab and is pinned.
  Opening a file or a terminal adds a tab next to it and switches to it; switching tabs goes
  back and forth between chat, files and terminals. No split (the user's choice, 2026-10-25).
  With only the Claude tab open, the chat fills the space in a centred column.
- **File tabs:** Monaco (the editor inside VS Code) with line numbers, VS Code keys, find,
  multi-cursor, and Save with the unchanged-on-disk check (ADR-0021). A file Claude changed
  shows a band with Show diff and Undo, and the changed lines are marked.
- **Terminal tabs:** a real shell in the project folder (xterm.js, node-pty). `+` opens another.
- Source control stays in the right rail (GitHub view).

## Deployment: the cockpit

```
+--------------------------------------------------------------------------------+
|  [> Run]  http://127.0.0.1:5173            [phone|desktop]   [Test]  [Deploy]  |
+-------------------------------------------------+------------------------------+
|                                                 |  Checks                      |
|                                                 |   [ok] typecheck             |
|        live preview of the app                  |   [ok] unit tests 385        |
|        (iframe of localhost)                    |   [..] browser test 3/7      |
|                                                 |   [ ] build                  |
|                                                 |  Browser test                |
|                                                 |   [ok] home loads   (shot)   |
|                                                 |   [x] login fails   (shot)   |
|                                                 |  Deploy                      |
|                                                 |   target: GitHub Pages       |
|                                                 |   last: v1.1.0, 13 days ago  |
+-------------------------------------------------+------------------------------+
```

- **Run** starts the app (ADR-0024) and the preview shows it. Phone and desktop sizes.
- **Checks:** typecheck, lint, unit tests, build, each one row with a result. Click a row for
  its output.
- **Test:** Claude in Chrome walks through the app from the test plan and shows one row per
  step, pass or fail, with a screenshot. No permission prompts, no stream of text: the full log
  opens on a click.
- **Deploy:** the target (from the Deployer's skill: GitHub Pages, Vercel, npm, a tag and
  release), the last deploy, and one button. Deploy always asks once with a short summary
  (what, where, version), because it leaves the machine.
- A failed check or test gives **Fix in Development**, which sends it to the Builder.

## Autopilot: Magnet flies the stage (ADR-0046)

A button in the top bar of Plan, Design and Development (not Deployment).

1. Click **Autopilot**. Magnet asks "What should I do, sir?" with suggestions such as
   "Finish M1". He waits: nothing runs until you answer.
2. Answer once, for example "Finish M1", and leave.
3. Magnet takes your seat. He gives the stage agent one order at a time (shown as MAGNET →
   BUILDER), answers its questions from the documents and names the source, picks the
   recommended option when the documents do not decide and logs it as an ADR for review.
   Each task must pass its tests. Push, publish and deploy go to "Needs you".
4. The top bar pill shows Magnet working (small bobbing avatar, typing dots, task count).
   Esc or a click stops him after the current step.
5. When you come back: "Welcome back, sir", then a short report in ASD-STE100: Result,
   Decisions Magnet made (Keep / Change), Needs you, Next.

## The Claude Code look

One chat component for every stage, as close to the Claude Code CLI as a browser allows:

- Monospace (Geist Mono). Colours stay the theme tokens; the spinner star uses the brand coral
  (the cherry accent in Cherry light, where coral is too faint).
- `>` for the user's message, `●` for Claude's text and each tool call, `⎿` under a tool call
  for its result (`Read 120 lines`, `+12 -3`), the tool name and argument as the CLI prints
  them: `Update(src/app.ts)`, `Bash(pnpm test)`.
- The spinner: a turning star (`· ✢ ✳ ✶ ✻ ✽`) with a changing verb (Simmering, Pondering,
  Brewing, Noodling ...) and `(8s · ↑ 1.2k tokens · esc to interrupt)`.
- Todos as `☐` / `☒` lines, diffs with red and green line numbers, thinking as a dim `✻
  Thinking` line.
- The input box: a rounded border, `>` prompt, `? for shortcuts` under it, and the mode
  (`⏵⏵ accept edits on`) as the CLI shows it. Shift+Tab cycles the mode.
- Permission prompts inline like the CLI: "Do you want to make this edit? 1. Yes 2. Yes, and
  don't ask again 3. No", answered with keys 1/2/3 or Esc.
- Everything from V2.1 w7 (slash commands, @ mentions, compact, history, rewind) keeps working.

## What leaves the default screen

| Today | In V3 |
| --- | --- |
| Six stage tabs | Four. Preparation and Issues are dropped. |
| Centre tabs (Chat, Docs, Notes & Tasks, Agents, Decisions) | Gone from the stage. Docs is the Plan documents panel; the rest is in the palette. |
| Side panel always open | Right rail, closed by default. |
| Overview boxes, usage, status notch | Status bar items; Overview in the rail. |
| Approval cards for Chrome, folded tool cards | CLI-style inline prompts, quiet browser tests. |
| Magnet panel on the workspace | Rail Chat view and Home only. |

## Task list

The same list is in `roadmap.md` (V3) with check boxes.

- **r0 Artboards.** New screens for the shell and the four stages in
  `docs/design/screens/v3/`, made before code, and approved by the user. ADR-0045 accepted.
- **r1 Shell.** Four stage tabs, minimal top bar, right rail, status bar, command palette.
  Preparation and Issues removed. Old centre tabs reachable from the palette.
- **r2 Claude Code chat.** One chat component with the CLI look and inline permission prompts,
  used in every stage.
- **r3 Plan.** Chat plus Documents panel, document reader and editor, Ask about this, the
  document checklist.
- **r4 Development layout.** Explorer, one tabbed area: Claude pinned first, files and
  terminals as tabs.
- **r5 Code editor.** Monaco with tabs, Save, diff of Claude's edits (new dependency, ADR).
- **r6 Terminal.** xterm.js and node-pty, as tabs in Development.
- **r7 Design canvas.** Screens as HTML in `design/screens/`, canvas with pan and zoom, click to
  comment.
- **r8 Design brief.** References, design system, components, images, colours, fonts.
- **r9 Design handoff.** Approve design, `design/handoff/`, Export zip.
- **r10 Deployment cockpit.** Run and preview, checks, Deploy with one confirm.
- **r11 Quiet browser test.** Claude in Chrome tests the app from the test plan; step rows with
  screenshots, no Cherry prompts, a one-time hint to give the extension localhost access.
- **r12 Stage moves.** Next-step chip at 100%, Haiku handoff note between stages, Stuck? hint
  (from V2.1 suggestions).
- **r13 Autopilot.** Magnet flies the stage: asks once, drives the stage agent, decides from
  the documents, logs decisions, reports in ASD-STE100 (ADR-0046).
- **r14 Clean-up.** Remove code with no place left, update docs, screens.md, e2e tests.
- **r15 Real run.** One small new project from Plan to Deploy in Cherry, fix what hurts.

**Done when:** a new idea goes from a Plan chat to a folder of documents, to screens and a
handoff on the Design canvas, to code built in the Development layout with the editor, to a
tested and deployed app from the cockpit, and no stage shows a panel the user did not open.

## Answers (2026-10-25)

1. **Preparation and Issues are dropped.** Four stages only. Old Preparation and Issues chats
   stay readable in History; `docs/issues/` files stay on disk and are not shown.
2. **Code editor: Monaco**, the editor inside VS Code, served locally.
3. **Terminal: yes**, xterm.js and node-pty, as tabs in Development (r6).
4. **Browser tests: Claude in Chrome**, the user's real Chrome. To keep it quiet, Cherry
   pre-allows the Chrome tools (ADR-0038), shows the steps as rows with screenshots in the
   cockpit, and the first run tells the user to give the extension permanent access to
   localhost so it stops asking.

## Decided for the build

5. **Fonts in Design.** Decided for the V3 build: only fonts installed on the computer and the
   self-hosted Geist fonts; no Google Fonts, because it sends data off the machine. The user
   can change this later (r8 ADR).
