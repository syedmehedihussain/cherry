# Daemon API

Base URL: `http://127.0.0.1:4317`. All routes except `POST /api/session` need the session cookie
(ADR-0008). The WebSocket upgrade carries the same cookie. The `Host` and `Origin` checks apply
to both.

`POST /api/session` — body `{ "code": "…" }` (the login code from the link). Sets the cookie;
`401` if the code is wrong, used or expired. `DELETE /api/session` logs out this browser.

All bodies are JSON and validated with the zod schemas in `packages/shared`.
Errors use one shape:

```json
{ "error": { "code": "not_found", "message": "No project called atlas" } }
```

Project ids come from Cherry's project list (`config.json` → `projects`, ADR-0032): the folder
name, made unique. The path guard rejects any file path that resolves outside the project's
folder (see `security.md`).

## System

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/api/health` | `{ ok, version, claude: { found, loggedIn, version }, git, gh }` |
| POST | `/api/health/recheck` | same, after re-running checks ("Check again" button) |
| POST | `/api/shutdown` | `{ ok: true }`, then the daemon stops (Home → Shut down Cherry). Stops running chats, agents and apps, like `cherry down` |
| GET | `/api/claude/usage` | `{ available, plan, fiveHour, week, fetchedAt }`; each window `{ usedPercent, resetsAt }` or null. claude.ai plan limits from the Agent SDK (experimental `/usage` call, no turn), cached 60 s |
| GET | `/api/config` | config.json |
| PATCH | `/api/config` | updated config |
| GET | `/api/folders?path=` | `{ path, parent, exists, dirs }`: sub-folder names (no hidden ones) for the welcome screen's folder picker; `path` defaults to `~` |
| POST | `/api/setup` | `{ projectsDir }`: creates the folder if missing, saves it, sets `onboarded: true`, rescans (ADR-0020) |

## Projects

| Method | Path | Returns / does |
| --- | --- | --- |
| GET | `/api/projects` | `ProjectCard[]` for the projects in Cherry's list, sorted by last worked; a folder that is gone has `missing: true` |
| POST | `/api/projects/open` | `{ path }` → `{ id }`: Open folder adds a folder from anywhere to Cherry's list (an already listed folder keeps its id). Refuses `/`, the home folder and `~/.cherry` (ADR-0032) |
| POST | `/api/projects/:id/remove` | Remove from Cherry: the project leaves the list; the disk is not touched |
| POST | `/api/projects/rescan` | starts a rescan; results arrive as events |
| GET | `/api/projects/:id` | `ProjectDetail` (card + status + docs list + git) |
| GET | `/api/projects/:id/tree?path=` | one directory level with git status per entry |
| GET | `/api/projects/:id/file?path=` | `{ path, language, size, content, truncated }` (max 1 MB) |
| PUT | `/api/projects/:id/file` | `{ path, content, baseMtime }`: built-in editor save. Existing text files under 1 MB only; 409 if the file changed since `baseMtime`; secret and binary files refused (ADR-0021) |
| GET | `/api/projects/:id/diff?path=` | unified diff vs HEAD |
| GET | `/api/projects/:id/docs` | grouped docs list |
| GET | `/api/projects/:id/status` | parsed STATUS.md |
| GET | `/api/projects/:id/tasks` | tasks.json |
| PATCH | `/api/projects/:id/tasks/:taskId` | update a task status |
| POST | `/api/projects/:id/tasks` | `{ title }` → adds a `todo` task in the current phase (first unfinished task's phase); creates tasks.json if missing; returns the tasks file |
| GET | `/api/projects/:id/source-control` | `{ author, staged, changes, hidden, autoCommit }` from `git status`; a file staged and changed again is in both lists; secret files only in `hidden` (ADR-0030) |
| POST | `/api/projects/:id/source-control/stage` · `/unstage` | `{ files }` or `{ all: true }` → `git add -A --` / `git restore --staged --`; secret files are never staged; returns the list |
| POST | `/api/projects/:id/source-control/message` | Write message: Haiku writes one commit message from the staged diff, on a click → `{ message }` |
| PUT | `/api/projects/:id/source-control/auto-commit` | `{ on }` → `{ autoCommit }`. While on, the chat has `commit_changes` and commits its work as the user |
| POST | `/api/projects/:id/commits` | `{ message }` → `git commit` of what is staged, with the user's git identity, no Claude trailer; 409 when nothing is staged, 400 when a secret file is staged; `{ hash, message }` |
| GET / PUT | `/api/projects/:id/notes` | notes.md (the only file the UI writes directly — it is the user's own notes) |
| POST | `/api/projects/:id/notes/organise` | `{ text }` → the note-taker (Haiku, no tools but `save_note`) tidies the note and picks a `##` section; the daemon adds it there (additions only). `{ content, mtime, section }`; 502 `note_failed` leaves notes.md untouched (ADR-0016) |
| POST | `/api/projects/:id/open-in-editor` | `{ path }` → runs `$EDITOR` / `code` |

## Run the app (ADR-0024)

| Method | Path | Does |
| --- | --- | --- |
| GET | `/api/projects/:id/run` | `{ command, source, running, url, startedAt, exitCode, servers, output }`; `command` is null when the project is not a website Cherry can run; `servers` lists `{ url, port, command }` of sites already running from the folder that Cherry did not start (Linux /proc, HTTP-checked) |
| POST | `/api/projects/:id/run` | starts `command` in the project folder in its own process group; 409 if already running or nothing to run |
| DELETE | `/api/projects/:id/run` | SIGTERM to the whole process group, SIGKILL after 3 s; returns the stopped state |

## Git and GitHub

| Method | Path | Does |
| --- | --- | --- |
| GET | `/api/projects/:id/git` | `{ branch, ahead, behind, changes, commits[3], remote, repo, visibility, openPRs }` |
| POST | `/api/projects/:id/git/pull` | `git pull --ff-only` |
| POST | `/api/projects/:id/git/push` | creates a `push` approval first (title, command, commits); runs `git push` (never forced) only after Allow; returns `{ approvalId }` |
| GET | `/api/projects/:id/git/prs` | `{ prs: [{ number, title, url, author, branch, draft, updatedAt }], error }` from `gh pr list` |

## Chat

| Method | Path | Does |
| --- | --- | --- |
| GET | `/api/projects/:id/chat?stage=` | the stage's chat (ADR-0034; default `development`): session meta + last 200 transcript events + `plan` (Claude's checklist, in memory) |
| POST | `/api/projects/:id/chat` | `{ text, stage?, mode?, model?, effort?, attachments? }` → starts a turn in that stage's chat; `mode` is ask (default), auto or plan (ADR-0025); `effort` is low, medium, high, xhigh or max (ignored for Haiku); attachments are upload ids, listed for Claude to Read |
| POST | `/api/projects/:id/chat/stop?stage=` | interrupts the stage's running turn |
| POST | `/api/projects/:id/chat/explain?stage=` | `{ turnId }` → `{ text }`: Haiku summary of what that turn changed (diff capped at 6 KB, no tools). Only on the user's click; cached per turn (ADR-0022) |
| POST | `/api/projects/:id/chat/new?stage=` | starts a fresh session for that stage only |
| POST | `/api/decisions/:cardId` | `{ optionId? , custom? }` answer a decision card |

## Stages (ADR-0034)

| Method | Path | Does |
| --- | --- | --- |
| GET | `/api/stages` | `{ stages: [{ stage, label, name, summary, docsOnly, skills: [{ name, description, source }] }] }`: each stage agent and its skills (`source` is `bundled` or `user`) |
| GET | `/api/projects/:id/stage?stage=` | `{ files, readiness }`: the stage's key files that exist (shown first in the file panel), and for `preparation` a file-only readiness checklist `[{ id, label, ok, detail }]` (no Claude, no commands); `readiness` is null for other stages |

## Issues (ADR-0035)

| Method | Path | Does |
| --- | --- | --- |
| GET | `/api/projects/:id/issues` | `{ issues, github }`: the files in `docs/issues/` (newest first) and, with a remote, open GitHub issues (`gh issue list`, cached 1 min; `local` = the file that links to it) or `github: null` |
| POST | `/api/projects/:id/issues` | `{ title, type?, severity?, body? }` → writes the next `NNNN-name.md` (never replaces a file) |
| PATCH | `/api/projects/:id/issues/:n` | `{ status }` → rewrites the front matter, keeps the body |
| POST | `/api/projects/:id/issues/:n/github` | → `{ approvalId }`; after approval runs `gh issue create` and stores the link; notice `issue.sent` or `issue.failed` |
| POST | `/api/projects/:id/issues/import` | `{ number }` → copies an open GitHub issue into a local file with its link |

## Approvals

| Method | Path | Does |
| --- | --- | --- |
| GET | `/api/approvals?status=pending` | all pending approvals (for toasts) |
| POST | `/api/projects/:id/uploads?name=` | raw file as the body (≤ 10 MB) → `{ id, name, size }`; stored in the project's `cherry/uploads/`, and `/cherry/` is added to its `.gitignore` |
| DELETE | `/api/projects/:id/uploads/:file` | deletes an upload that was never sent (409 once it is in a message) |
| GET | `/api/projects/:id/uploads/:file` | the stored file; png/jpeg/gif/webp inline, everything else as a download (`nosniff`, sandbox CSP) |
| POST | `/api/approvals/:id` | `{ answer: "allow" \| "allow_session" \| "deny", reason? }` |

## Project ideas (ADR-0027)

| Method | Path | Does |
| --- | --- | --- |
| GET | `/api/ideas` | `{ ideas: Idea[] }`, newest first |
| POST | `/api/ideas` | `{ name, description? }` → `{ idea }` |
| PATCH | `/api/ideas/:id` | `{ name, description? }` → `{ idea }` |
| DELETE | `/api/ideas/:id` | removes the idea; Home calls it once the survey for it has started |

## Survey

| Method | Path | Does |
| --- | --- | --- |
| POST | `/api/survey` | `{ name, idea, quick }` → creates the draft folder with only `_project/survey.json`, returns the survey state (id = folder name) |
| GET | `/api/survey/:id` | survey state |
| POST | `/api/survey/:id/next` | `{ fresh? }` asks Claude to draft the current card (or the files at review); `fresh` drops the kept draft |
| POST | `/api/survey/:id/answer` | `{ step, optionId? , custom? }`, or `{ step: 1, idea, quick }` |
| POST | `/api/survey/:id/change` | `{ step }` reopen a step |
| POST | `/api/survey/:id/create` | `{ createRepo, gitignore = true }` writes every proposed file, a `.gitignore` for the stack (Haiku, unless one exists; ADR-0023), `git init`, first commit, optional `gh repo create --private` |

The survey state (`GET /api/survey/:id`) carries the current card, the drafting flag, the
proposal and the create progress, and is pushed as `survey.updated` on every change.

## Calibration

| Method | Path | Does |
| --- | --- | --- |
| POST | `/api/projects/:id/calibrate` | starts the scan (read-only session) |
| POST | `/api/projects/:id/calibrate/cancel` | stops it, writes nothing |
| POST | `/api/projects/:id/calibrate/answer` | answer a question card |
| GET | `/api/projects/:id/calibrate/proposal` | `{ files: [{ path, action: "create"\|"append", diff }] }` |
| POST | `/api/projects/:id/calibrate/write` | `{ paths: string[] }` writes only the ticked files |

## Agents

| Method | Path | Does |
| --- | --- | --- |
| GET | `/api/projects/:id/agents` | agent list |
| POST | `/api/projects/:id/agents` | `{ task, model }` → the agent (queued when all slots are busy). Agents always run in Auto; push, publish, deploy and rm -r are skipped and listed in `needsYou` (ADR-0028). `auto` is accepted and ignored |
| GET | `/api/agents/:agentId/diff` | `{ files: [{ path, isNew, added, removed, lines }] }`, agent branch vs where it started |
| POST | `/api/agents/:agentId/accept` | Merge: `git merge --no-edit` into the current branch, then remove worktree and branch (ADR-0010). A conflict answers 409 with code `merge_conflict` and changes nothing |
| POST | `/api/agents/:agentId/resolve` | Merge with agent: merges the current branch into the agent branch in its worktree; no conflicts → merged at once; conflicts → the agent fixes them and runs the checks, and Cherry merges when it reports "Ready to merge" (ADR-0029) |
| POST | `/api/agents/:agentId/discard` | remove worktree + branch |
| POST | `/api/agents/:agentId/retry` | new run with the same task |
| POST | `/api/agents/:agentId/stop` | interrupt |
| POST | `/api/agents/:agentId/continue` | Continue in chat: sends the branch, summary and skipped commands to the project chat as a new turn; 409 unless the agent is done with `needsYou` (ADR-0028) |

## Decisions (ADR-0026)

A decision is an ADR in the project's ADR folder (`docs/adr/` unless `project.json` `docs.adr`
says otherwise), addressed by its number. The file holds the state; see
`docs/project-standard.md` → ADR format.

| Method | Path | Does |
| --- | --- | --- |
| GET | `/api/projects/:id/decisions` | `{ dir, decisions: Adr[] }`, newest number first; `state` is pending, approved, done or rejected; `applying` names the chat turn or agent making an approved change |
| POST | `/api/projects/:id/decisions/:n/approve` | `{ apply: none\|chat\|agent }` → Status Accepted, `Done: not yet`. `none` adds the task "Apply ADR-NNNN: title" to tasks.json; chat or agent also starts the change (chat waits for the running turn to end). Returns `{ decision, warning }`; `warning` says why the change was not started (ADR-0029) |
| POST | `/api/projects/:id/decisions/:n/apply` | `{ apply: chat\|agent }` → starts an approved change again |
| POST | `/api/projects/:id/decisions/:n/reject` | `{ reason? }` → Status Rejected, `Rejected because: …`; the file stays |
| POST | `/api/projects/:id/decisions/:n/done` | approved → `Done: YYYY-MM-DD`; its "Apply ADR-NNNN:" task is ticked. Ticking that task (PATCH tasks) also marks the decision done |

Claude proposes with the `propose_decision` tool (chat and agents) and closes an applied one with
`decision_done` (chat only; an agent's decision is done when the user accepts its work).

## Scan agents and reports (ADR-0012)

| Method | Path | Does |
| --- | --- | --- |
| GET | `/api/projects/:id/scans` | `{ agents: [{ id, name, description, icon, source, model, commands, run, last }], problems }`; `problems` lists custom agent files that could not be read |
| POST | `/api/projects/:id/scans/:agentId/run` | starts a read-only scan → `{ id, agentId, startedAt, activity }`; 409 if that agent is already running here |
| POST | `/api/projects/:id/scans/:agentId/stop` | interrupt; nothing is saved |
| GET | `/api/projects/:id/reports/:agentId` | `{ reports: ReportMeta[] }`, newest first |
| GET | `/api/projects/:id/reports/:agentId/:reportId` | `{ meta, markdown }` |

Event `scan.updated { projectId, agentId }` on the project topic when a scan starts, makes
progress or saves a report.

## Magnet

| Method | Path | Does |
| --- | --- | --- |
| GET | `/api/magnet` | profile files, read-only flag, stats and usage (Settings → Magnet) |
| PUT | `/api/magnet/files/:name` | save `MAGNET.md`, `me.md` or `work.md` |
| GET | `/api/magnet/chat` | `{ conversationId, running, items, readOnly, projects }` |
| POST | `/api/magnet/chat` | `{ text, projectId? }` |
| POST | `/api/magnet/chat/stop` · `/new` | stop the answer · start a new conversation |
| POST | `/api/magnet/actions/:id/approve` | runs the proposed action (ADR-0011), returns it with `result` and `href` |
| POST | `/api/magnet/actions/:id/cancel` | marks it cancelled |

## WebSocket events

One socket at `/ws`. Every event: `{ type, at, ...payload }`. The client subscribes to topics:

```json
{ "type": "subscribe", "topics": ["projects", "project:core", "approvals"] }
```

| Event | Payload | Topic |
| --- | --- | --- |
| `projects.updated` | `{ cards: ProjectCard[] }` | projects |
| `health.updated` | health object | projects |
| `chat.item` | `{ projectId, stage, conversationId, item: ChatItem }` (upsert by `item.id`: user message, text, tool row, decision, approval, turn end) | project:id |
| `chat.delta` | `{ projectId, stage, conversationId, itemId, turnId, text }` streamed text appended to a text item | project:id |
| `chat.state` | `{ projectId, stage, conversationId, running, turnId, touched }` | project:id |
| `chat.plan` | `{ projectId, stage, conversationId, plan: [{ id, title, activeForm, status }] }` — Claude's checklist changed (ADR-0017) | project:id |
| `project.changed` | `{ projectId, paths }` files changed on disk | project:id |
| `approval.requested` | `{ approval }` | approvals + project:id |
| `approval.resolved` | `{ approval }` (with its final status) | approvals + project:id |
| `git.result` | `{ projectId, action: pull\|push, ok, message }` | project:id |
| `tree.changed` | `{ paths: string[] }` | project:id |
| `agent.updated` | `{ projectId, agent }` (status, last timeline rows, waiting approval, change size) | project:id |
| `decisions.updated` | `{ projectId }` a decision was proposed, approved, rejected or done; re-fetch the list | project:id |
| `survey.updated` | `{ projectId, state }` (full survey state) | project:id |
| `calibrate.progress` | `{ step, rows, found }` | project:id |
| `calibrate.proposal` | proposal | project:id |
| `run.state` | `{ projectId, state }` the app started, stopped or printed its local address (no output, no servers) | project:id |
| `run.output` | `{ projectId, text }` new output, colour codes removed, sent at most every 100 ms | project:id |
| `notice` | `{ projectId, kind, title, body, link }` work ended or needs you: `agent.done`, `agent.failed`, `scan.done`, `scan.failed`, `decision.proposed`, `chat.done`, `chat.failed`; `link` is the web route. The web shows a toast, a desktop notification while the tab is in the background, and a count in the tab title | notices |
| `magnet.item` / `magnet.delta` / `magnet.state` | Magnet's conversation (items include `projects` and `action`) | magnet |

On reconnect the client re-subscribes and re-fetches state with GET calls. Events are not replayed.
