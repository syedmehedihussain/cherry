---
name: write-a-skill
description: Write a new skill for a Cherry stage agent (Plan, Design, Preparation, Development, Deployment or Issues), or improve an existing one. Use when the user wants to turn a workflow they repeat into a skill, or asks to make, edit or review a SKILL.md.
---

# Write a skill

A skill is a folder with a `SKILL.md`: front matter with `name` and `description`, then the
instructions an agent follows. Cherry gives each stage agent its own skills.

## Where it goes

- The user's own skills: `~/.cherry/skills/<stage>/<name>/SKILL.md`, where `<stage>` is `plan`,
  `design`, `preparation`, `development`, `deployment` or `issues`. That folder is outside the
  project, so Cherry will not let you write there: write the skill in the project at
  `_project/tmp/skills/<stage>/<name>/` and tell the user the one command that moves it:
  `mkdir -p ~/.cherry/skills/<stage> && mv _project/tmp/skills/<stage>/<name> ~/.cherry/skills/<stage>/`.
- A skill for everyone who installs Cherry (only when working on Cherry itself):
  `packages/daemon/stages/<stage>/skills/<name>/`, with a row in
  `packages/daemon/stages/SOURCES.md`.

Pick the one stage whose agent needs it. A skill that helps several stages can be copied into
each, but most belong to one.

## Steps

1. **Ask what it is for**, one question at a time: what the user does by hand today, when the
   agent should use the skill (the words or situations that should trigger it), and what a
   good result looks like. Read an example of the work if the user has one.
2. **Draft the description first.** It is the only part the agent sees before choosing the
   skill, so it says what the skill does and when to use it, with the trigger words, in one or
   two sentences.
3. **Draft the body**: the steps in order, each one checkable; the project's conventions it
   must follow; what to do when something is missing; how to report the result. Keep it short.
   Move long reference material (templates, checklists, examples) into separate files next to
   `SKILL.md` and link them, so they load only when needed.
4. **Review it with the user.** Read it back as the agent would: is every step something the
   agent can actually do with its tools? Does it ask before anything outward-facing (push,
   publish, sending to a service)?
5. **Finalize** in the right folder and say how to try it: open that stage's tab; the skill is
   listed in the empty chat and in Settings, Stage agents.

## Rules

- No `allowed-tools`: Cherry removes it, and every command a skill runs still asks.
- No secrets, tokens or personal data in a skill.
- Scripts are fine, but the skill must say what each one does, and it must not send data to
  other services without saying so.
- Never write hooks, settings or MCP servers: Cherry loads only the skill folder.
