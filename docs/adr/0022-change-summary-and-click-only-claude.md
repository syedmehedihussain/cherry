# 0022 — Change summary, and Claude only on a click

- **Status:** Accepted
- **Date:** 2026-10-11
- **Decided by:** Meddy

## Context

After Claude edits files, the user wants to see what changed, which files, and what happened
after (tests, commands), but only when they ask, and without a report that costs tokens on its
own. The user also wants the whole app to be token efficient. One place spent tokens without a
click: the GitHub view's Ready to commit list ran Haiku every time it opened.

## Options

1. **Free summary from chat items + an Explain button** — the chat already records each edit
   (file, lines added and removed) and each command with its result. Trade-off: the free view
   has facts, not prose.
2. **Generate a summary after every turn** — Trade-off: tokens on every turn, asked for or not.
3. **Free view only** — Trade-off: no plain-words explanation when wanted.

## Decision

We chose **option 1**. Each Claude reply that edited files ends with a closed line "Changed N
files +a −r". Opening it shows the files (links to the file viewer, where Show changes has the
diff), the commands run after the first edit with passed or failed, and how the turn ended. No
Claude call. **Explain with Claude** sends one Haiku request with no tools: file list, commands,
Claude's last message (1,200 characters max) and the diff of those files (6 KB max). The answer
is cached per turn in the daemon.

Ready to commit was briefly click-only too. After the rule below was refined, the user chose to
group with Haiku automatically again when the view opens (a small job).

Rule for new features (refined by the user on 2026-10-11): small jobs may run automatically on
Haiku with small, capped prompts. Big jobs (reviews, scans, reports, explanations such as
Explain) run only on the user's click. Automatic jobs never use a bigger model than Haiku.

## Consequences

- Good: zero tokens unless the user clicks; Explain costs a few thousand input tokens at most.
- Bad / cost: the explain cache is in memory, so it is lost when the daemon restarts.
- Follow-up: none.
