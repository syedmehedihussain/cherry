We are starting V4 of Cherry: "The Office". This task is a design prototype only. Do not change any code in `packages/`.

## Read first
1. `CLAUDE.md`
2. `docs/v4-office.md` (the plan) and `docs/adr/0052-the-office-gated-stages.md` (the decision)
3. `docs/design-system.md`, `docs/design/tokens.css` and `docs/design/brand/` (colours, type, the Cherry badge)
4. `docs/design/screens/v3/` and the "Claude Code look" section of `docs/v3-redesign.md`. The chat in every stage keeps this look.

If `docs/v4-office.md` or ADR-0052 is missing, stop and tell me.

## What to build
Build one standalone, interactive HTML prototype of the new Cherry UI:
`docs/design/screens/v4/office-prototype.html`

- One file. All CSS and JS go inline. No CDN or network calls. Copy the token values from `tokens.css` into a `:root` block, and use system fonts if the local fonts can't be inlined.
- Use fake data only. No real Claude calls. The example project is **Fitness Master**, a gym that wants a mobile app for its members to track their subscription, diet plan, workouts and progress.
- It must open with a double-click and work fully offline.

## Screens and flows (every button should do something)
1. **Projects list**: a few projects, plus a "New project" button.
2. **Project home** (replaces the stage tabs). Show the seven stages as windows: Idea, Requirements, Plan, Design, Development, Testing, Deployment. Each window shows its agent (Business Analyst, System Analyst, System Architect, UI/UX Designer, Development Team, QA Engineer, DevOps Engineer) and its state: locked, active, waiting for client, signed off, or needs update. Show the project status at the top. A new project starts with only Idea open.
3. **Stage window**: click a stage to open it.
   - A chat with that stage's agent, in the Claude Code look, with a realistic mock conversation for Fitness Master.
   - A documents panel split into **Client documents** and **Technical documents**, filled with sample content (for example the project brief, SRS, system design and a simple diagram).
   - An Auto mode toggle.
   - A "back to home" control.
4. **Gate flow**:
   - The agent says "The stage is ready."
   - The user clicks **Sign off**.
   - A modal records the client approval (client name, date, notes) or an "internal only" checkbox.
   - The stage becomes signed off, and the next stage unlocks with a small animation.
5. **Development inside gate**: the client approves the prototype before the full build.
6. **Change request flow**: from a signed-off stage, the user starts a change and picks small or big.
   - **Small**: one line is added to the change log.
   - **Big**: show an impact note listing the affected stages, then Approve. The affected stages get a "needs update" flag. Re-signing a stage clears its flag.
7. **Deployment sign-off**: the status becomes **Live** and the home turns into **Maintenance**, with Support, QA, Issues, Bug fixing, Upgrades and New version.
   - "Start v2.0" opens a new cycle (Requirements → Deployment) shown next to the live v1.
8. **Demo controls**: a small floating panel to jump to any state (new project, mid-build, waiting for client, Live) and to reset. This makes review fast.

## How to work
- Follow `docs/design-system.md`. Keep the screens calm and minimal, as in V3, with no clutter.
- Work without stopping to ask. Where the plan doesn't decide something, choose and continue, then list your choices at the end.
- Open the file in a browser to check it. Fix any console errors and broken flows.
- When you're done, commit on a new branch `v4-office-prototype` with a conventional commit (`docs:`), then tell me:
  1. how to open the prototype
  2. the choices you made
  3. questions for me
