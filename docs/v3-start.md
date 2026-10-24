# Start work of version 3

This page is for Claude Code. When the user says **"start work of version 3"** (or "continue
version 3"), follow it from top to bottom and keep going task by task until V3 is done. The user
may not be at the screen: the work runs on a headless server. Do not wait for answers; decide
as written here, write the decision down, and go on.

## 0. For the user: start it on the server

```bash
git clone https://github.com/syedmehedihussain/cherry.git && cd cherry
tmux new -s cherry-v3          # so it keeps running when you disconnect (Ctrl B, D to leave)
claude --permission-mode acceptEdits
# then type:  start work of version 3
```

`acceptEdits` lets Claude edit files without asking; it still asks before commands it has not
been allowed. To let it run fully alone, allow the commands it needs in `.claude/settings.json`
(pnpm, git, mise, python3, node) or start it with `--dangerously-skip-permissions` on a server
that holds nothing else of value. Come back with `tmux attach -t cherry-v3`; progress is in
`docs/v3-progress.md` and on the `v3` branch on GitHub.

## 1. Read first (in this order)

1. `CLAUDE.md`: the project rules. They all still apply, except where this page says otherwise.
2. `docs/v3-redesign.md`: what V3 is, stage by stage, and the user's answers.
3. `docs/roadmap.md`, section **V3**: the task list (r0 to r15) and the **Done when**.
4. `docs/adr/0045-four-stage-redesign.md` and `docs/adr/0046-autopilot-magnet-flies-the-stage.md`.
5. `docs/v3-progress.md`: what earlier sessions finished, and what they left open. Start from
   the first unticked task in the roadmap.
6. The artboards in `docs/design/screens/v3/` (see section 4). They are the source of truth
   for layout, as rule 6 says.

`_project/` is not in git, so it is not on the server. Everything you need is in `docs/`.

## 2. Setup on a fresh clone

```bash
mise install                 # Node 22, pnpm 12 (mise.toml)
mise exec -- pnpm install
mise exec -- pnpm test       # must pass before you change anything
mise exec -- pnpm typecheck
mise exec -- pnpm lint
```

- e2e tests use `/usr/bin/chromium`, or the path in `CHERRY_CHROMIUM`. If neither exists, run
  `mise exec -- pnpm exec playwright install chromium` once, then use that.
- `node-pty` (r6) builds a native module: it needs `python3`, `make` and a C++ compiler. If the
  build fails, install them (`build-essential` on Debian/Ubuntu) and write it in the progress log.
- The real `claude` CLI may be logged in on the server, but tests use the fake Claude
  (`docs/testing.md`). Do not run real Claude in tests.

## 3. Branch, commit, push

- Work on the branch **`v3`** (create it from `main` the first time; later sessions continue
  it). Never commit V3 work straight to `main`.
- One task = one or more small commits, conventional messages (`feat(web): …`), as rule 11 says.
- **The words "start work of version 3" are the user's permission to push the `v3` branch.**
  Push after every finished task (`git push -u origin v3`). Never push `main`, never
  force-push, never open or merge a PR, never deploy or publish. Merging `v3` into `main` is
  the user's job.

## 4. How to check a screen against the artboards

The artboards are static HTML. Serve the repo and take screenshots with Playwright:

```bash
python3 -m http.server 4400 --bind 127.0.0.1   # from the repo root, in the background
# artboards: http://127.0.0.1:4400/docs/design/screens/v3/<file>.html?theme=just-black
# overview:  http://127.0.0.1:4400/docs/design/screens/v3/
```

| Artboard | Shows |
| --- | --- |
| `01-plan.html` | Plan: chat and Documents panel with reader |
| `02-design.html` | Design: brief, canvas, Designer chat |
| `03-development.html` | Development: explorer and one tabbed area (`?tab=chat`, `?tab=file`, `?tab=term`) |
| `04-deployment.html` | Deployment cockpit: preview, checks, browser test, deploy |
| `05-side-view-open.html` | Right rail with Overview open; next-stage chip |
| `06-command-palette.html` | Ctrl K palette |
| `07-permission-and-live.html` | CLI-style permission prompt; Live open |
| `08-autopilot-ask.html`, `09-autopilot-flying.html`, `10-autopilot-report.html` | Autopilot |

For every task that changes the UI: start `pnpm dev`, take a 1440 × 900 screenshot of your
screen and of the artboard, in **Just black** and **Cherry light** at least, and compare them.
Fix differences before you tick the task. Shared values (top bar 48 px, rail 44 px, status bar
26 px, chat font and so on) are at the top of `docs/design/screens/v3/v3.css`; move them into
`docs/design/tokens.css` in r1 rather than copying numbers into components.

Colours do not change in V3. Use the existing tokens for everything.

## 5. The loop, for each task

1. Read the task in the roadmap and the matching section of `v3-redesign.md`.
2. Look at the code it touches before you change it. Reuse what exists (the chat, approvals,
   stages, checklists, Magnet, agents); V3 changes the layout and the look, not the daemon's
   job.
3. Build it. Add or update unit tests and e2e tests for it.
4. Run `pnpm test`, `pnpm typecheck`, `pnpm lint` and the e2e tests that touch it. All must
   pass. Never skip, delete or weaken a test to make it pass; fix the cause.
5. Check the screen against the artboard (section 4).
6. Tick the box in `docs/roadmap.md`. Add an entry to `docs/v3-progress.md` (section 7).
7. Commit, push `v3`, and start the next task. Do not stop between tasks to ask.

If a task fails in a way you cannot fix after a fair try (two real attempts), write it in the
progress log under **Blocked**, with what you tried, and go on to the next task that does not
depend on it.

## 6. Decisions you may make alone

The user decided these already. Do not ask again:

- Four stages: plan, design, development, deployment. **Preparation and Issues are removed**
  (their old chats stay readable in History; `docs/issues/` stays on disk). See
  `packages/shared/src/schemas/common.ts` and `workspace.ts`, `packages/daemon/src/routes/stages.ts`,
  `packages/daemon/stages/` and `packages/web/src/pages/Workspace/`.
- Development: **one tabbed area**, Claude pinned as the first tab, files and terminals open as
  tabs. **No split.**
- Editor: **Monaco**. Terminal: **xterm.js + node-pty**, as tabs. Browser tests: **Claude in
  Chrome** (ADR-0037, 0038). These dependencies are approved: `monaco-editor` (and
  `@monaco-editor/react` if it helps), `@xterm/xterm`, `@xterm/addon-fit`, `node-pty`. Write
  an ADR for each (r5, r6) and add them to the ADR-0003 list.
- Autopilot as in ADR-0046, in Plan, Design and Development, not Deployment.
- Every report and summary in ASD-STE100 (ADR-0015).
- Fonts in Design (r8): **only fonts installed on the computer and the self-hosted Geist
  fonts**. No Google Fonts (it sends data off the machine). Write it in the r8 ADR.

For any other real choice (rule 8): pick the option you recommend, write the ADR with
**Status: Accepted** and the line `- **Decided by:** Claude (V3 server run), for review`, and
list it in the progress log under **Decisions to review**. Do not stop to ask.

What still needs the user, always: anything in CLAUDE.md "Ask before" that is **not**
approved above (a dependency outside the list, a file format change in `project-standard.md` or
`data-model.md`, sending data to a new service). Do not do it. Find a way without it if you
can; if not, write it under **Needs you** and go on.

Claude in Chrome cannot run on a headless server. Build r11 against the fake Claude and the
existing Chrome plumbing, test it that way, and note in **Needs you** that the user must try it
with real Chrome.

## 7. Progress log: `docs/v3-progress.md`

Keep it short, in ASD-STE100, newest first. After each task add:

```markdown
## r1 Shell — done 2026-10-26

- Built: four stage tabs, right rail, status bar, command palette.
- Tests: 412 unit, 58 e2e pass.
- Screens: match 01, 05, 06 in Just black and Cherry light.
- Commits: abc1234..def5678
```

Keep three lists at the top and update them: **Needs you**, **Decisions to review**,
**Blocked**.

## 8. When V3 is done

When every V3 box is ticked and the **Done when** in the roadmap holds: write a final report at
the top of `docs/v3-progress.md` (Result, Needs you, Decisions to review, Next) in ASD-STE100,
push `v3`, and stop. Do not merge into `main`.
