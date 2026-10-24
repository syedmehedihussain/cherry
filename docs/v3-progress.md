# V3 progress

How to work: [`v3-start.md`](v3-start.md). Newest entries first. Write in ASD-STE100.

## Needs you

- Nothing yet.

## Decisions to review

- ADR-0047: where the V3 shell puts the old controls (views over the stage from the palette,
  Run in the status bar, Live does not open by itself).

## Blocked

- Nothing yet.

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
