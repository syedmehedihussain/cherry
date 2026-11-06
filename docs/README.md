# Cherry docs — map

Read this page, then open only what your task needs.

## Product

| File | What it answers |
| --- | --- |
| [`prd.md`](prd.md) | What are we building, for whom, what is in and out of the MVP? |
| [`screens.md`](screens.md) | What does each screen do, and what are its states? |
| [`roadmap.md`](roadmap.md) | In what order do we build, and when is each milestone done? |
| [`v3-redesign.md`](v3-redesign.md) | The V3 redesign: four stages, each with its own layout, and the Claude Code look. |
| [`v4-office.md`](v4-office.md) | V4, The Office: seven gated stages, staff agents, client sign-off, Maintenance. |

## Engineering

| File | What it answers |
| --- | --- |
| [`architecture.md`](architecture.md) | How do the CLI, daemon, web UI and local tools fit together? |
| [`project-standard.md`](project-standard.md) | What does a project folder look like? How are folders sorted into states? |
| [`data-model.md`](data-model.md) | Exact shapes of `project.json`, `survey.json`, `tasks.json`, the SQLite cache, Magnet's folder. |
| [`api.md`](api.md) | The daemon's HTTP routes and WebSocket events. |
| [`claude-runner.md`](claude-runner.md) | How we spawn `claude`, read its stream, handle approvals and decision cards. |
| [`security.md`](security.md) | Threat model, token, path rules, what Claude may do without asking. |
| [`testing.md`](testing.md) | What we test, how, and the fake `claude` binary. |
| [`adr/`](adr/) | Every real decision, one file each. |

## Design

| File | What it answers |
| --- | --- |
| [`design-system.md`](design-system.md) | Colours, type, spacing, radius, icons, motion. |
| [`components.md`](components.md) | Every reusable part, its props and states. |
| [`design/tokens.css`](design/tokens.css) | The tokens as CSS variables. Import this; never hard-code hex. |
| [`design/screens/`](design/screens/) | `v4/office-prototype.html` (V4 source of truth) and the V3 artboards (`v3/`). |


## Outside docs/

| Path | What it is |
| --- | --- |
| [`../site/`](../site/) | The landing page, deployed to GitHub Pages by `.github/workflows/pages.yml`. |
| [`../scripts/media/`](../scripts/media/) | The made-up demo used for README screenshots, the video and the landing page. |
| [`images/`](images/) | Screenshots and the demo GIF used in the README. |
