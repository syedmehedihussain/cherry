# Bundled skills

Skills in `stages/<stage>/skills/` ship with Cherry (ADR-0034). Only skills whose licence allows
redistribution are bundled, each with its LICENSE file kept next to its SKILL.md. Every bundled
skill has a row here. Third-party skills are copied as published (only the Codex
`agents/openai.yaml` is left out) and are not linted or reformatted. Each one was read in full
before it was added (2026-10-22).

Cherry adapts them at run time, not in the files: `allowed-tools` is removed from each copied
SKILL.md, telemetry of the tools they start is turned off (`DO_NOT_TRACK`,
`SUPERPOWERS_DISABLE_TELEMETRY`, `HYPERFRAMES_NO_TELEMETRY`), and the chat prompt tells agents
that the project's conventions win and that temp files go in `_project/tmp/`.

Skills marked `disable-model-invocation` run only when the user starts them: click the skill in
the empty chat, or type `/cherry-<stage>:<name>`.

| Stage | Skill | Source | Licence | Version |
| --- | --- | --- | --- | --- |
| preparation | project-readiness | Cherry (written for Cherry) | MIT, Cherry's own | 2026-10-22 |
| deployment | release | Cherry (written for Cherry) | MIT, Cherry's own | 2026-10-22 |
| plan | grill-with-docs | https://github.com/mattpocock/skills | MIT | 5beb35b |
| plan | grilling | https://github.com/mattpocock/skills | MIT | 5beb35b |
| plan | domain-modeling | https://github.com/mattpocock/skills | MIT | 5beb35b |
| plan | research | https://github.com/mattpocock/skills | MIT | 5beb35b |
| plan | to-spec | https://github.com/mattpocock/skills | MIT | 5beb35b |
| plan | brainstorming | https://github.com/obra/superpowers | MIT | 2ce8aa1 |
| plan | writing-plans | https://github.com/obra/superpowers | MIT | 2ce8aa1 |
| design | frontend-design | https://github.com/anthropics/skills | Apache-2.0 | dbd4588 |
| design | prototype | https://github.com/mattpocock/skills | MIT | 5beb35b |
| design | web-design-guidelines | https://github.com/vercel-labs/agent-skills | MIT | 063bee9 |
| preparation | setup-matt-pocock-skills | https://github.com/mattpocock/skills | MIT | 5beb35b |
| preparation | setup-pre-commit | https://github.com/mattpocock/skills | MIT | 5beb35b |
| development | tdd | https://github.com/mattpocock/skills | MIT | 5beb35b |
| development | codebase-design | https://github.com/mattpocock/skills | MIT | 5beb35b |
| development | diagnosing-bugs | https://github.com/mattpocock/skills | MIT | 5beb35b |
| development | prototype | https://github.com/mattpocock/skills | MIT | 5beb35b |
| development | improve-codebase-architecture | https://github.com/mattpocock/skills | MIT | 5beb35b |
| development | agent-browser | https://github.com/vercel-labs/agent-browser | Apache-2.0 | 468c052 |
| development | verification-before-completion | https://github.com/obra/superpowers | MIT | 2ce8aa1 |
| deployment | verification-before-completion | https://github.com/obra/superpowers | MIT | 2ce8aa1 |
| deployment | finishing-a-development-branch | https://github.com/obra/superpowers | MIT | 2ce8aa1 |
| issues | to-tickets | https://github.com/mattpocock/skills | MIT | 5beb35b |
| issues | triage | https://github.com/mattpocock/skills | MIT | 5beb35b |
| issues | grilling | https://github.com/mattpocock/skills | MIT | 5beb35b |
| issues | domain-modeling | https://github.com/mattpocock/skills | MIT | 5beb35b |
| issues | code-review | https://github.com/mattpocock/skills | MIT | 5beb35b |
| plan | handoff | https://github.com/mattpocock/skills | MIT | 5beb35b |
| design | handoff | https://github.com/mattpocock/skills | MIT | 5beb35b |
| preparation | handoff | https://github.com/mattpocock/skills | MIT | 5beb35b |
| development | handoff | https://github.com/mattpocock/skills | MIT | 5beb35b |
| deployment | handoff | https://github.com/mattpocock/skills | MIT | 5beb35b |
| issues | handoff | https://github.com/mattpocock/skills | MIT | 5beb35b |
| development | write-a-skill | Cherry (written for Cherry) | MIT, Cherry's own | 2026-10-22 |

## Looked at and left out

| Skill | Why |
| --- | --- |
| git-guardrails-claude-code | Installs a settings-file hook, which Cherry never loads. Cherry asks before the same git commands itself (Auto mode included). |
| find-skills | Installs skills globally for Claude Code with `-g -y`; Cherry's agents load only their stage folders. Add skills in `~/.cherry/skills/<stage>/`. |
| skill-creator | Its scripts run nested `claude -p` sessions outside Cherry's approvals. Cherry's own `write-a-skill` covers writing skills. |
| write-a-skill (mattpocock) | No longer in the upstream repository; Cherry ships its own. |
| executing-plans, subagent-driven-development | Depend on Superpowers' worktree, subagent and review scripts; the Development Team executes plans in Development. |
| webapp-testing | Optional; overlaps agent-browser. |
| vercel-deploy | Copies were flagged critical: the script uploads the project to an outside endpoint. Use the official Vercel CLI. |
| hyperframes-cli, media-use | Waiting for the user: they send media to paid outside services (HeyGen, Gemini). |
| product-launch-video, pr-to-video | Not in the upstream repository any more. |

## ECC and taste skills (2026-11-09, ADR-0061)

Cherry's own skills and agents from now on: they ship in this repository, so whoever installs
Cherry has them, with no separate install. ECC is "Everything Claude Code" by Affaan Mustafa;
the taste skills are by Leonxlnx. Each folder keeps the upstream LICENSE. Only the essentials
per stage were taken (docs/ecc-integration.md). ECC's installer, hooks, commands and rules are not
used. The files were screened before they were added: every chosen file was checked for calls
to services off the machine (Exa, Context7, cloud browsers), MCP tools, hooks and ECC-only
scripts, and the hits were read; not every line of the longer skills was read.

Changes to the copies (the rest is as published):

- `deployment/skills/github-ops`: the ECC maintainer release checklist
  (`references/ecc-release-checklist.md`) and the paragraph pointing to it are removed; they are
  for releasing ECC itself.
- `development/skills/tdd-workflow`: step 0.1 called ECC's package-manager detector script,
  which is not bundled; it now reads `packageManager` and the lockfile instead.
- `design/skills/design-taste-frontend`: tasteskill 2.5.1 (Leonxlnx/taste-skill, f6b7657),
  complete with its assets (about 40 MB of photographs, objects, icons and demos) and scripts.
  Its scripts fetch icons and photographs from a CDN (cdn.jsdelivr.net); the user accepted that
  on 2026-11-09. Nothing changed.

| Stage | Skill | Source | Licence | Version |
| --- | --- | --- | --- | --- |
| idea | product-lens | https://github.com/affaan-m/ECC | MIT | d2ef268 |
| requirements | intent-driven-development | https://github.com/affaan-m/ECC | MIT | d2ef268 |
| requirements | story-lifecycle | https://github.com/affaan-m/ECC | MIT | d2ef268 |
| plan | architecture-decision-records | https://github.com/affaan-m/ECC | MIT | d2ef268 |
| plan | api-design | https://github.com/affaan-m/ECC | MIT | d2ef268 |
| plan | database-migrations | https://github.com/affaan-m/ECC | MIT | d2ef268 |
| plan | blueprint | https://github.com/affaan-m/ECC | MIT | d2ef268 |
| design | design-system | https://github.com/affaan-m/ECC | MIT | d2ef268 |
| design | accessibility | https://github.com/affaan-m/ECC | MIT | d2ef268 |
| design | make-interfaces-feel-better | https://github.com/affaan-m/ECC | MIT | d2ef268 |
| design | design-taste-frontend | https://github.com/Leonxlnx/taste-skill | MIT | f6b7657 |
| design | high-end-visual-design | https://github.com/Leonxlnx/taste-skill-classics | MIT | 5e08c93 |
| design | minimalist-ui | https://github.com/Leonxlnx/taste-skill-classics | MIT | 5e08c93 |
| development | coding-standards | https://github.com/affaan-m/ECC | MIT | d2ef268 |
| development | tdd-workflow | https://github.com/affaan-m/ECC | MIT | d2ef268 |
| development | error-handling | https://github.com/affaan-m/ECC | MIT | d2ef268 |
| development | frontend-patterns | https://github.com/affaan-m/ECC | MIT | d2ef268 |
| development | backend-patterns | https://github.com/affaan-m/ECC | MIT | d2ef268 |
| development | security-review | https://github.com/affaan-m/ECC | MIT | d2ef268 |
| development | verification-loop | https://github.com/affaan-m/ECC | MIT | d2ef268 |
| testing | e2e-testing | https://github.com/affaan-m/ECC | MIT | d2ef268 |
| testing | browser-qa | https://github.com/affaan-m/ECC | MIT | d2ef268 |
| testing | ai-regression-testing | https://github.com/affaan-m/ECC | MIT | d2ef268 |
| testing | verification-loop | https://github.com/affaan-m/ECC | MIT | d2ef268 |
| deployment | deployment-patterns | https://github.com/affaan-m/ECC | MIT | d2ef268 |
| deployment | canary-watch | https://github.com/affaan-m/ECC | MIT | d2ef268 |
| deployment | github-ops | https://github.com/affaan-m/ECC | MIT | d2ef268 |

### Agents (Cherry's specialists)

`stages/<stage>/agents/*.md` are ECC agents (https://github.com/affaan-m/ECC, MIT, d2ef268),
unchanged, with ECC's LICENSE in each `agents/` folder. The room's staff member hands work to
them as subagents; Cherry keeps each agent's `model` (as ECC sets it) and removes Edit and Write
in the docs-only stages.

| Stage | Agents |
| --- | --- |
| plan | planner, architect |
| design | a11y-architect |
| development | code-reviewer, tdd-guide, build-error-resolver, security-reviewer, typescript-reviewer, react-reviewer |
| testing | e2e-runner, security-reviewer |
| deployment | doc-updater |

