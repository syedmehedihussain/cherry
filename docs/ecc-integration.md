# ECC in Cherry: plan

Status: accepted 2026-11-09, built as ADR-0061 (selection as proposed; specialists on ECC's models; Cherry's skills kept next to ECC's).

## What ECC is

[affaan-m/ECC](https://github.com/affaan-m/ECC) ("Everything Claude Code", Affaan Mustafa), MIT,
version 2.2.3 (commit d2ef268, 2026-11-06). 71 agents, 314 skills, 98 commands, 23 rule sets,
hooks and an installer. Agents are Markdown files with front matter (`name`, `description`,
`tools`, `model`), the same shape as Claude Code subagents. Skills are `SKILL.md` folders, the
same shape as the skills Cherry already bundles per stage (ADR-0034, `stages/SOURCES.md`).

## How it fits Cherry

Cherry already has the two places ECC needs:

1. **Skills per stage**: `packages/daemon/stages/<stage>/skills/`, loaded as a plugin per stage
   (`/cherry-<stage>:<name>`). Idea, Requirements and Testing have none today.
2. **Subagents**: the Agent SDK's `agents` option. Each stage's staff member (the persona in
   `AGENT.md`) stays the one the user talks to; ECC agents become specialists it can hand a
   piece of work to (a reviewer, a test runner), shown in the chat as subagent rows.

ECC is not installed with its own installer, hooks or commands: Cherry's rules come first
(nothing runs without a click, approvals, loopback only, the release card). We copy the chosen
files, as with the other bundled skills, and record each one in `stages/SOURCES.md`.

## Proposed selection (essentials only)

| Stage | ECC subagents | ECC skills |
| --- | --- | --- |
| Idea | - | product-lens |
| Requirements | - | intent-driven-development, story-lifecycle |
| Plan | planner, architect | architecture-decision-records, api-design, database-migrations, blueprint |
| Design | a11y-architect | design-system, accessibility, make-interfaces-feel-better |
| Development | code-reviewer, tdd-guide, build-error-resolver, security-reviewer, typescript-reviewer, react-reviewer | coding-standards, tdd-workflow, error-handling, frontend-patterns, backend-patterns, security-review, verification-loop |
| Testing | e2e-runner, security-reviewer | e2e-testing, browser-qa, ai-regression-testing, verification-loop |
| Deployment | doc-updater | deployment-patterns, canary-watch, github-ops |

About 12 agents and 25 skills of 71 and 314. Language-specific reviewers beyond TypeScript and
React can be added per project later (Settings, Agents).

## Adaptations Cherry makes at run time

- **Model**: each specialist runs on the model ECC sets (the user's answer; Opus for planner and
  architect).
- **Tools**: each agent keeps ECC's `tools` list, minus anything the stage may not use
  (docs-only stages cannot edit code); the release guard and approvals still apply.
- **Off-machine services**: skills that call Exa, Context7 or other web services are left out or
  have those steps removed (CLAUDE.md: nothing leaves the machine except to Claude or GitHub).
- **Rules**: from `rules/common` only what does not clash with Cherry: the TodoWrite practice
  (helps R2-1), commit conventions, testing and security basics. Not taken: "80% coverage
  required", "GitHub code search first", Exa research, ECC's hooks and Stop-hook gates.
- **Project conventions win** (as today): decisions go through propose_decision and the
  project's ADR template, issues are files in docs/issues/.

## Steps

1. User approves this plan and the selection (or changes it).
2. Read every chosen file in full; drop or trim off-machine steps; copy with ECC's LICENSE;
   rows in `stages/SOURCES.md` with commit d2ef268.
3. Daemon: load `stages/<stage>/agents/*.md` as SDK `agents` for the room (model capped,
   tools filtered); test with the fake runner.
4. Settings, Agents: list each room's specialists next to the staff persona.
5. ADR-0061; README and docs/README note the source.
6. Real run on a small project to see the agents used and the cost.

## Answers (2026-11-09)

- Selection: as proposed, plus the taste skills in Design.
- Model: ECC's own, Opus where it says so.
- Skills: keep Cherry's next to ECC's and follow ECC's order of work (plan, test first, review,
  security, verify).
- Also asked: a fresh session when a room's chat is over half its context window (ADR-0061).
