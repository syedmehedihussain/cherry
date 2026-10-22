# Cherry — Agent Skills Setup

This file lists the skills Cherry's Claude Code agent should have, grouped by work stage.
Each entry says what the skill does in plain words, how to install it, and any catch.

All skills come from [skills.sh](https://www.skills.sh). Install counts and security results were checked on 22 Oct 2026.

---

## How to install

**Option A — run it yourself.** Open a terminal in the Cherry repo root and run the commands in each section. The CLI may ask which agent to install for. Pick **Claude Code**.

**Option B — let Claude Code do it.** Paste this into a Claude Code session opened in the Cherry repo:

```
Read CHERRY_SKILLS.md. Install every skill marked [CORE] using the npx commands listed,
plus any extra setup steps (like the agent-browser CLI). Install for Claude Code only.
After installing, run /setup-matt-pocock-skills and walk me through its questions.
Report anything that failed. Do not install skills marked [OPTIONAL] unless I ask.
```

**After installing:** restart Claude Code so it picks up the new skills, then run `/setup-matt-pocock-skills` once (see Prep).

---

## Stage overview

| Stage | Core skills | Optional |
|---|---|---|
| Prep | setup-matt-pocock-skills, git-guardrails-claude-code | setup-pre-commit |
| Plan | grill-with-docs, grilling, domain-modeling, research | to-spec, brainstorming |
| Design | frontend-design, prototype | design-taste-frontend, web-design-guidelines |
| Dev | tdd, agent-browser, diagnosing-bugs | webapp-testing, improve-codebase-architecture |
| Deploy | finishing-a-development-branch, verification-before-completion | vercel-deploy (see warning) |
| Issue | to-tickets, triage | code-review |
| Content | hyperframes-cli, media-use | product-launch-video, pr-to-video |
| Extra (Magnet) | find-skills, write-a-skill, handoff | skill-creator |

---

## 1. Prep — set up the repo before anything else

### `setup-matt-pocock-skills` [CORE]
One-time setup. It asks 3 questions (where issues live, which labels you use, where docs go), then writes a small config into `CLAUDE.md` and `docs/agents/`. Many of Matt Pocock's skills below read this config. Without it, `to-tickets` and `triage` won't know where to put things.
```bash
npx skills add https://github.com/mattpocock/skills --skill setup-matt-pocock-skills
```
Then in Claude Code: `/setup-matt-pocock-skills`

### `git-guardrails-claude-code` [CORE]
Adds a Claude Code hook that blocks risky git commands: `git push`, `reset --hard`, `clean -f`, `branch -D`, `checkout .`. Good safety net since Cherry runs Claude Code on real repos. It asks if you want it for this project only or all projects.
```bash
npx skills add https://github.com/mattpocock/skills --skill git-guardrails-claude-code
```

### `setup-pre-commit` [OPTIONAL]
Sets up pre-commit checks (lint, format, tests) so broken code doesn't get committed.
```bash
npx skills add https://github.com/mattpocock/skills --skill setup-pre-commit
```

---

## 2. Plan — figure out what to build

### `grill-with-docs` [CORE]
The agent questions you hard about a plan, one branch at a time, until it's clear. It also reads the code, fixes fuzzy wording, and writes a glossary (`CONTEXT.md`) and decision records (ADRs) as you go. This fits Cherry's "survey, document, plan" job well.
```bash
npx skills add https://github.com/mattpocock/skills --skill grill-with-docs
```

### `grilling` + `domain-modeling` [CORE — required by grill-with-docs]
`grill-with-docs` is only a wrapper. Its instructions just say "call `grilling` and `domain-modeling`". Without these two, it does nothing.
```bash
npx skills add https://github.com/mattpocock/skills --skill grilling
npx skills add https://github.com/mattpocock/skills --skill domain-modeling
```
> Skipped `grill-me` on purpose. It's the same questioning without the docs, so `grill-with-docs` covers it.

### `research` [CORE]
Starts a background agent that researches a question using primary sources (official docs, source code, specs), then saves the findings with sources as a Markdown file in the repo. You keep working while it reads.
```bash
npx skills add https://github.com/mattpocock/skills --skill research
```

### `to-spec` [OPTIONAL]
Turns a plan or conversation into a written spec.
```bash
npx skills add https://github.com/mattpocock/skills --skill to-spec
```

### `brainstorming` [OPTIONAL]
Structured idea generation for when you don't have a plan yet.
```bash
npx skills add https://github.com/obra/superpowers --skill brainstorming
```

---

## 3. Design — make it look good

### `frontend-design` [CORE]
Anthropic's official design skill. It pushes the agent away from generic "AI-looking" UI toward clear visual choices in type, colour, and layout.
```bash
npx skills add https://github.com/anthropics/skills --skill frontend-design
```

### `prototype` [CORE]
Builds throwaway code to answer one design question. Either it makes several very different UI versions you can switch between, or it makes a small interactive page to test if some logic or state flow feels right. You delete it after you decide.
```bash
npx skills add https://github.com/mattpocock/skills --skill prototype
```

### `design-taste-frontend` [OPTIONAL]
A stronger "taste" layer for UI, from the taste-skill pack (~650K installs). Use it if `frontend-design` still feels plain. Don't stack too many design skills, or they will fight each other.
```bash
npx skills add https://github.com/leonxlnx/taste-skill --skill design-taste-frontend
```

### `web-design-guidelines` [OPTIONAL]
Vercel's web UI rules (spacing, accessibility, interaction patterns). Good as a review checklist.
```bash
npx skills add https://github.com/vercel-labs/agent-skills --skill web-design-guidelines
```

---

## 4. Dev — build and test

### `tdd` [CORE]
Test-driven development done properly. Write one test, make it pass, repeat. Tests check behaviour through public interfaces, so they don't break when you refactor. It agrees with you first on *what* to test, so you don't end up with pointless tests. It also reads the glossary from `grill-with-docs`, so test names match project language.
```bash
npx skills add https://github.com/mattpocock/skills --skill tdd
```

### `agent-browser` [CORE]
Gives the agent a real browser: open pages, click, fill forms, take screenshots, pull data.
```bash
npx skills add https://github.com/vercel-labs/agent-browser --skill agent-browser
```
> ⚠️ **Extra step needed.** The skill is only a pointer. The real tool is a separate CLI:
> ```bash
> npm i -g agent-browser && agent-browser install
> ```

### `diagnosing-bugs` [CORE]
Structured debugging: reproduce, isolate, find the cause, then fix. Stops the agent from making random edits until something works.
```bash
npx skills add https://github.com/mattpocock/skills --skill diagnosing-bugs
```

### `webapp-testing` [OPTIONAL]
Anthropic's skill for testing a *local* web app with Python Playwright scripts. It starts your dev server for you. It overlaps with `agent-browser`, so only add it if you want proper Playwright test scripts. Note: Socket and Snyk both gave it a warning.
```bash
npx skills add https://github.com/anthropics/skills --skill webapp-testing
```

### `improve-codebase-architecture` [OPTIONAL]
Reviews the codebase and suggests structural cleanups. Run it now and then, not every session.
```bash
npx skills add https://github.com/mattpocock/skills --skill improve-codebase-architecture
```

---

## 5. Deploy — finish and ship

### `verification-before-completion` [CORE]
Makes the agent actually check its work (run tests, confirm output) before it says "done". Cuts down on false "it works!" claims.
```bash
npx skills add https://github.com/obra/superpowers --skill verification-before-completion
```

### `finishing-a-development-branch` [CORE]
When work is done, it runs the full test suite. If tests pass, it gives you 4 choices: merge locally, open a PR, keep the branch, or discard it. Then it does the git steps and cleans up.
```bash
npx skills add https://github.com/obra/superpowers --skill finishing-a-development-branch
```
> Works with `git-guardrails-claude-code`: the guardrail blocks `git push`, so you approve pushes yourself.

### `vercel-deploy` [OPTIONAL — read first]
Deploys a project to Vercel and returns a preview URL. **Warning:** several copies of this skill exist, and some were flagged CRITICAL in skills.sh audits, because the script uploads your project to an outside endpoint. If you want it, check its security page on skills.sh first. Or simply ask Claude Code to run `vercel deploy` with the official Vercel CLI, which needs no skill.
```bash
npx skills add openai/skills --skill vercel-deploy
```

---

## 6. Issue — turn plans into work and keep it sorted

### `to-tickets` [CORE]
Breaks a plan or spec into small vertical-slice tickets. Each ticket lists which other tickets block it. It publishes them to your tracker (GitHub Issues etc.). Needs `setup-matt-pocock-skills` done first.
```bash
npx skills add https://github.com/mattpocock/skills --skill to-tickets
```

### `triage` [CORE]
Sorts and labels incoming issues using the labels you set during setup.
```bash
npx skills add https://github.com/mattpocock/skills --skill triage
```

### `code-review` [OPTIONAL]
Reviews changes for bugs and code quality before merging.
```bash
npx skills add https://github.com/mattpocock/skills --skill code-review
```

---

## 7. Content — videos and media

### `hyperframes-cli` [CORE if Cherry makes videos]
Drives HeyGen's HyperFrames video tool: start a project from a template, check for layout problems (like text going off-screen), live preview, and render to MP4/WebM.
```bash
npx skills add https://github.com/heygen-com/hyperframes --skill hyperframes-cli
```
> Needs **Node.js 22+** and **FFmpeg** installed.

### `media-use` [CORE if using hyperframes-cli]
Finds or makes the stuff that goes inside the video: music, sound effects, images, icons, voiceover, avatars, transcripts, background removal. Saves everything into `assets/` so renders work offline.
```bash
npx skills add https://github.com/heygen-com/hyperframes --skill media-use
```
> The AI parts (voice, avatars) likely need a HeyGen account and may cost credits. Socket gave it a warning.

### `product-launch-video` / `pr-to-video` [OPTIONAL]
Ready-made HyperFrames workflows. One makes a launch video for a product, the other turns a pull request into a short demo video.
```bash
npx skills add https://github.com/heygen-com/hyperframes --skill product-launch-video
npx skills add https://github.com/heygen-com/hyperframes --skill pr-to-video
```

---

## 8. Extra — for Magnet

These let Magnet grow by finding and making its own skills.

### `find-skills` [CORE]
The most installed skill on skills.sh (4M). When you ask "is there a skill for X?", it searches skills.sh and can install a skill in the middle of a session without a restart. It prefers popular, well-starred, official sources. Snyk gave it a warning, so let it suggest skills, but approve installs yourself.
```bash
npx skills add https://github.com/vercel-labs/skills --skill find-skills
```

### `write-a-skill` [CORE]
Helps write new skills in 4 steps: ask what it's for, draft `SKILL.md`, review with you, then finalize. It splits long skills into extra files and writes clear trigger words so the agent knows when to use them. Useful for turning Cherry's own workflows into skills.
```bash
npx skills add https://github.com/mattpocock/skills --skill write-a-skill
```

### `handoff` [CORE]
Squeezes the current session into a short handoff document, so a fresh agent (or Magnet) can continue the work without re-reading everything. It lists which skills the next agent should use and removes API keys and passwords.
```bash
npx skills add https://github.com/mattpocock/skills --skill handoff
```

### `skill-creator` [OPTIONAL]
Anthropic's official version of `write-a-skill`. It goes further: it can test and measure a skill. Pick this or `write-a-skill`, not both.
```bash
npx skills add https://github.com/anthropics/skills --skill skill-creator
```

---

## Full core install (copy-paste)

```bash
# Prep
npx skills add https://github.com/mattpocock/skills --skill setup-matt-pocock-skills
npx skills add https://github.com/mattpocock/skills --skill git-guardrails-claude-code

# Plan
npx skills add https://github.com/mattpocock/skills --skill grill-with-docs
npx skills add https://github.com/mattpocock/skills --skill grilling
npx skills add https://github.com/mattpocock/skills --skill domain-modeling
npx skills add https://github.com/mattpocock/skills --skill research

# Design
npx skills add https://github.com/anthropics/skills --skill frontend-design
npx skills add https://github.com/mattpocock/skills --skill prototype

# Dev
npx skills add https://github.com/mattpocock/skills --skill tdd
npx skills add https://github.com/vercel-labs/agent-browser --skill agent-browser
npm i -g agent-browser && agent-browser install
npx skills add https://github.com/mattpocock/skills --skill diagnosing-bugs

# Deploy
npx skills add https://github.com/obra/superpowers --skill verification-before-completion
npx skills add https://github.com/obra/superpowers --skill finishing-a-development-branch

# Issue
npx skills add https://github.com/mattpocock/skills --skill to-tickets
npx skills add https://github.com/mattpocock/skills --skill triage

# Content (needs Node 22+ and FFmpeg)
npx skills add https://github.com/heygen-com/hyperframes --skill hyperframes-cli
npx skills add https://github.com/heygen-com/hyperframes --skill media-use

# Extra (Magnet)
npx skills add https://github.com/vercel-labs/skills --skill find-skills
npx skills add https://github.com/mattpocock/skills --skill write-a-skill
npx skills add https://github.com/mattpocock/skills --skill handoff
```

Then restart Claude Code and run `/setup-matt-pocock-skills`.

---

## Notes

- **Don't overload.** Every skill's description sits in the agent's context. Around 20 skills is fine. Past that, the agent may pick the wrong one. Add optional skills only when you actually need them.
- **Dependencies:** `grill-with-docs` → needs `grilling` + `domain-modeling`. `to-tickets` and `triage` → need `/setup-matt-pocock-skills` run first. `agent-browser` → needs its CLI. `hyperframes-cli` → needs Node 22+ and FFmpeg.
- **Security:** most core skills passed all 3 skills.sh audits. Warnings: `find-skills` (Snyk), `agent-browser` (Snyk), `hyperframes-cli` (Snyk), `media-use` (Socket), `to-tickets` (Snyk), `webapp-testing` (Socket + Snyk). A warning isn't a fail, but read the skill before trusting it with secrets.
- **Replaced from the first list:** `grill-me` → covered by `grill-with-docs`. `to-issues` / `diagnose` → newer `to-tickets` / `diagnosing-bugs`.

---

## What Cherry bundled (22 Oct 2026)

These skills now ship inside Cherry, in `packages/daemon/stages/<stage>/skills/`, so every
install gets them without `npx skills add`. Each was read in full and its licence checked; the
full list with sources, licences and commits is in `packages/daemon/stages/SOURCES.md`.

- **Plan:** grill-with-docs, grilling, domain-modeling, research, to-spec, brainstorming,
  writing-plans
- **Design:** frontend-design, prototype, web-design-guidelines
- **Preparation:** setup-matt-pocock-skills, setup-pre-commit, project-readiness (Cherry)
- **Development:** tdd, codebase-design, diagnosing-bugs, agent-browser, prototype,
  improve-codebase-architecture, verification-before-completion, write-a-skill (Cherry)
- **Deployment:** verification-before-completion, finishing-a-development-branch, release
  (Cherry)
- **Issues:** to-tickets, triage, grilling, domain-modeling, code-review
- **Every stage:** handoff

Left out, with the reason in SOURCES.md: git-guardrails-claude-code (Cherry asks before the
same git commands itself), find-skills, skill-creator, vercel-deploy, design-taste-frontend,
webapp-testing, and the Superpowers execution chain. The HyperFrames video skills wait for a
decision because they send media to paid outside services. The `agent-browser` CLI still has to
be installed by hand: `npm i -g agent-browser && agent-browser install`.

