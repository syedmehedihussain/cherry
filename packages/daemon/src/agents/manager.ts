import { DECISIONS_PROMPT, type AdrService } from '../adr/service.ts';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import type { Agent, AgentStart, AgentStatus, ApprovalFile, ChatItem } from '@cherry/shared';
import type { ConfigStore } from '../config.ts';
import type { Db } from '../db.ts';
import { notify, projectLink, type EventHub } from '../events.ts';
import { git, gitStatus } from '../git.ts';
import { HttpError, conflict, notFound } from '../http.ts';
import { isInside, isSecretFile } from '../paths.ts';
import type { ApprovalBroker } from '../claude/approvals.ts';
import { autoNeedsApproval, classifyCommand } from '../claude/commands.ts';
import { Conversation } from '../claude/conversation.ts';
import type { DecisionBroker } from '../claude/decisions.ts';
import { diffLines } from '../claude/preview.ts';
import { READ_TOOLS, type RunHandle, type Runner } from '../claude/runner.ts';
import { Transcript } from '../claude/transcript.ts';
import { projectDir } from '../projects/workspace.ts';

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const ACTIVE: AgentStatus[] = ['queued', 'running', 'waiting'];

interface Row {
  id: string;
  project_id: string;
  task: string;
  model: string;
  branch: string;
  base_branch: string;
  worktree: string;
  status: AgentStatus;
  summary: string | null;
  error: string | null;
  activity_json: string;
  /** 1 in Auto mode (ADR-0025); every new agent since ADR-0028. */
  auto: number;
  /** JSON array of commands skipped for the user (ADR-0028). */
  needs_json: string;
  started_at: number;
  ended_at: number | null;
}

interface Live {
  conversation: Conversation;
  handle: RunHandle | null;
  lastText: string;
  waiting: Agent['waiting'];
  /** Commands refused because only the user may run them. */
  skipped: string[];
  /** Merge with agent: the files that had conflicts, checked again at the end. */
  resolving: string[] | null;
}

/** "Write tests for the streak service" → "tests-streak-service". */
export function slugify(task: string): string {
  const skip = new Set(['a', 'an', 'the', 'for', 'to', 'of', 'and', 'in', 'on', 'write', 'please']);
  const words = task
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !skip.has(w));
  return words.slice(0, 4).join('-').slice(0, 40).replace(/-+$/, '') || 'task';
}

const SKIP_REASON =
  'Only the user may run this (push, publish, deploy, rm -r, sudo or another serious command). Do not try another way. Skip this step, finish the rest of the task, and list the skipped step under "Needs you" at the end of your report.';

function agentPrompt(task: string, branch: string): string {
  return [
    task,
    '',
    `You are a background agent working in your own git worktree on branch ${branch}. The user is not watching and will not answer; work on your own until the task is done.`,
    '- Read CLAUDE.md and the relevant code first.',
    '- You may edit files in this folder and run commands without asking (auto mode).',
    '- Pushing, publishing, deploying, rm -r, sudo and other serious commands are refused for agents. If the task needs one, skip that step, finish the rest, and end your report with a "Needs you" list of the skipped steps.',
    '- If the project has tests, run them before you finish and say the result.',
    DECISIONS_PROMPT,
    '- Keep .gitignore current: if your change makes build output, caches, dependencies or local env files, add them to .gitignore.',
    '- Do not commit, push or switch branches. Cherry commits your work when you finish and the user reviews the diff.',
    '- End with one short sentence that says what you changed. Write it, and any other report, in ASD-STE100 Simplified Technical English (short sentences, active voice, approved words).',
  ].join('\n');
}

/**
 * Background agents (architecture.md → Background agent): each runs headless in its own git
 * worktree on `agent/<slug>`. Edits inside the worktree are allowed; commands need approval.
 * Accept merges into the project's current branch; Discard removes worktree and branch.
 */
function resolvePrompt(task: string, target: string, branch: string, files: string[]): string {
  return [
    `You are a background agent in the git worktree of branch ${branch}. Your earlier work on this task is on the branch: ${taskLine(task)}`,
    `Cherry ran \`git merge ${target}\` here to bring in the user's newer work, and these files have conflicts:`,
    ...files.map((f) => `- ${f}`),
    '',
    '- Fix every conflict. Keep the intent of both sides; remove all conflict markers.',
    '- Do not run git commit, git merge --abort, push or switch branches. Cherry commits the merge when you finish.',
    '- Then build the project and run its tests.',
    '- End your report with what you changed, which checks you ran and their result, and the line "Ready to merge" only when they pass.',
    '- Write the report in ASD-STE100 Simplified Technical English.',
  ].join('\n');
}

/**
 * Splits an agent's last message into the report and its "Needs you" list (the steps it left
 * for the user). Accepts a heading or a "Needs you:" line, then bullets or numbered lines.
 */
export function splitReport(text: string): { body: string; needs: string[] } {
  const lines = text.trim().split('\n');
  const at = lines.findIndex((l) => /^\s*(#+\s*)?\**\s*needs you\b/i.test(l));
  if (at < 0) return { body: text.trim(), needs: [] };
  const clean = (l: string) =>
    l
      .replace(/^\s*([-*•]|\d+[.)])\s+/, '')
      .replace(/^`(.*)`$/, '$1')
      .trim();
  const needs: string[] = [];
  const inline = clean(lines[at]!.replace(/^\s*(#+\s*)?\**\s*needs you\s*\**\s*:?\s*\**/i, ''));
  if (inline) needs.push(inline);
  let end = at + 1;
  for (; end < lines.length; end++) {
    const l = lines[end]!;
    if (!l.trim()) continue;
    if (!/^\s*([-*•]|\d+[.)])\s+/.test(l)) break;
    needs.push(clean(l));
  }
  const body = [...lines.slice(0, at), ...lines.slice(end)].join('\n').trim();
  return { body, needs: needs.filter((n) => n && !/^(none|nothing)\.?$/i.test(n)) };
}

function hasConflictMarkers(file: string): boolean {
  try {
    return /^(<{7}|>{7}) /m.test(readFileSync(file, 'utf8'));
  } catch {
    return false;
  }
}

/** The task's first line, short enough for a notification title. */
const taskLine = (task: string) => task.split('\n')[0]!.slice(0, 60);

export class AgentManager {
  private readonly live = new Map<string, Live>();

  constructor(
    private readonly config: ConfigStore,
    private readonly db: Db,
    private readonly hub: EventHub,
    private readonly approvals: ApprovalBroker,
    private readonly decisions: DecisionBroker,
    private readonly runner: Runner,
    private readonly home: string,
    private readonly adrs?: AdrService,
  ) {
    // Nothing survives a restart; keep the worktree so Try again and Discard still work.
    db.prepare(
      `UPDATE agents SET status = 'failed', error = 'Cherry restarted while this agent ran.', ended_at = ? WHERE status IN ('queued','running','waiting')`,
    ).run(Date.now());
  }

  private row(id: string): Row {
    const r = this.db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as Row | undefined;
    if (!r) throw notFound(`No agent ${id}`);
    return r;
  }

  private view(r: Row): Agent {
    const l = this.live.get(r.id);
    return {
      id: r.id,
      projectId: r.project_id,
      task: r.task,
      model: r.model,
      auto: r.auto === 1,
      branch: r.branch,
      baseBranch: r.base_branch,
      status: r.status,
      summary: r.summary,
      needsYou: JSON.parse(r.needs_json) as string[],
      error: r.error,
      activity: JSON.parse(r.activity_json) as ChatItem[],
      waiting: l?.waiting ?? null,
      changes: this.changesCache.get(r.id) ?? null,
      startedAt: r.started_at,
      endedAt: r.ended_at,
    };
  }

  private readonly changesCache = new Map<string, Agent['changes']>();

  private publish(id: string): void {
    const r = this.row(id);
    this.hub.publish(`project:${r.project_id}`, 'agent.updated', {
      projectId: r.project_id,
      agent: this.view(r),
    });
  }

  private set(id: string, patch: Partial<Row>): void {
    const keys = Object.keys(patch) as (keyof Row)[];
    if (!keys.length) return;
    this.db
      .prepare(`UPDATE agents SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
      .run(...keys.map((k) => patch[k] ?? null), id);
    this.publish(id);
  }

  async list(projectId: string): Promise<{ agents: Agent[]; maxRunning: number }> {
    projectDir(this.config.projectsDir(), projectId);
    const rows = this.db
      .prepare(
        `SELECT * FROM agents WHERE project_id = ? AND status NOT IN ('accepted','discarded') ORDER BY started_at DESC`,
      )
      .all(projectId) as Row[];
    // Change counts are cached in memory; work them out again after a restart.
    for (const r of rows)
      if (r.status === 'done' && !this.changesCache.has(r.id) && existsSync(r.worktree))
        await this.refreshChanges(r.id);
    return {
      agents: rows.map((r) => this.view(r)),
      maxRunning: this.config.get().agents.maxRunning,
    };
  }

  get(id: string): Agent {
    return this.view(this.row(id));
  }

  private runningCount(): number {
    return (
      this.db
        .prepare(`SELECT COUNT(*) AS n FROM agents WHERE status IN ('running','waiting')`)
        .get() as { n: number }
    ).n;
  }

  async start(projectId: string, body: AgentStart): Promise<Agent> {
    const dir = projectDir(this.config.projectsDir(), projectId);
    const status = await gitStatus(dir);
    if (!status) throw conflict('Agents need a git repository. Run git init first.');
    if (!status.branch) throw conflict('Check out a branch before starting an agent.');
    const head = await git(dir, ['rev-parse', '--verify', 'HEAD']);
    if (!head.ok) throw conflict('Make a first commit before starting an agent.');

    const base = slugify(body.task);
    let slug = base;
    for (let n = 2; ; n++) {
      const exists = await git(dir, [
        'rev-parse',
        '--verify',
        '--quiet',
        `refs/heads/agent/${slug}`,
      ]);
      const wt = path.join(this.config.worktreeDir(), projectId, slug);
      if (!exists.ok && !existsSync(wt)) break;
      slug = `${base}-${n}`;
    }
    const branch = `agent/${slug}`;
    const worktree = path.join(this.config.worktreeDir(), projectId, slug);
    mkdirSync(path.dirname(worktree), { recursive: true });
    const add = await git(dir, ['worktree', 'add', '-q', '-b', branch, worktree, 'HEAD'], 60_000);
    if (!add.ok) throw conflict(`Could not create the worktree: ${add.stderr.trim()}`);

    const id = `ag_${randomUUID().slice(0, 10)}`;
    const queued = this.runningCount() >= this.config.get().agents.maxRunning;
    this.db
      .prepare(
        `INSERT INTO agents (id, project_id, task, model, auto, branch, base_branch, worktree, status, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        projectId,
        body.task,
        body.model ?? this.config.get().claude.defaultModel,
        1,
        branch,
        status.branch,
        worktree,
        queued ? 'queued' : 'running',
        Date.now(),
      );
    if (!queued) this.run(id);
    else this.publish(id);
    return this.get(id);
  }

  /** Runs the agent's task, or (Merge with agent) a conflict fix in the same worktree. */
  private run(id: string, resolve?: { prompt: string; files: string[] }): void {
    const r = this.row(id);
    const source = `agent:${id}`;
    const live: Live = {
      conversation: null as unknown as Conversation,
      handle: null,
      lastText: '',
      waiting: null,
      skipped: [],
      resolving: resolve?.files ?? null,
    };
    const conversation = new Conversation({
      projectId: r.project_id,
      cwd: r.worktree,
      source,
      transcript: new Transcript(path.join(this.home, 'transcripts', `${id}.jsonl`)),
      approvals: this.approvals,
      decisions: this.decisions,
      onItem: (item) => {
        if (item.kind === 'text') live.lastText = item.text;
        if (item.kind === 'approval') {
          live.waiting = item.approval.status === 'pending' ? item.approval : null;
          this.set(id, { status: live.waiting ? 'waiting' : 'running' });
        }
        if (item.kind === 'tool') {
          const tools = (JSON.parse(this.row(id).activity_json) as ChatItem[]).filter(
            (x) => x.id !== item.id,
          );
          this.set(id, { activity_json: JSON.stringify([...tools, item].slice(-8)) });
        }
      },
      onDelta: (itemId) => {
        const item = conversation.items.get(itemId);
        if (item?.kind === 'text') live.lastText = item.text;
      },
      // Edits inside the worktree run without asking; anything outside is refused (guard).
      // Auto mode runs the rest. What only the user may do is refused, never asked: nobody is
      // watching a background agent (ADR-0028), serious commands included (ADR-0033).
      policy: (tool, input) => {
        if (EDIT_TOOLS.has(tool)) return 'allow';
        const command = tool === 'Bash' && typeof input.command === 'string' ? input.command : '';
        if (
          command &&
          (classifyCommand(command, r.worktree).serious || autoNeedsApproval(command))
        ) {
          if (!live.skipped.includes(command)) live.skipped.push(command);
          return { deny: SKIP_REASON };
        }
        return 'ask';
      },
      auto: true,
    });
    live.conversation = conversation;
    this.live.set(id, live);
    this.set(id, { status: 'running', started_at: Date.now() });
    conversation.startTurn(id);

    let finished = false;
    const handle = this.runner({
      cwd: r.worktree,
      prompt: resolve?.prompt ?? agentPrompt(r.task, r.branch),
      resume: null,
      model: r.model,
      planMode: false,
      appendSystemPrompt:
        'You are a background agent inside Cherry, working in a git worktree, in auto mode. Edits inside this folder and most commands run without asking. Push, publish, deploy and rm -r are refused: skip them and report them under "Needs you".',
      allowedTools: READ_TOOLS,
      decisions: false,
      ...(this.adrs ? { extraTools: this.adrs.tools(r.project_id, 'agent') } : {}),
      guard: (tool, input) => {
        if (!EDIT_TOOLS.has(tool)) return null;
        const p = typeof input.file_path === 'string' ? input.file_path : input.notebook_path;
        if (typeof p !== 'string') return null;
        return isInside(r.worktree, p)
          ? null
          : `Agents may only edit files inside their worktree (${r.worktree}).`;
      },
      onPermission: (tool, input, toolUseId) => conversation.permission(tool, input, toolUseId),
      onDecision: async () => ({
        ok: false,
        error: 'Agents cannot ask questions. Decide and say so in your summary.',
      }),
      onEvent: (ev) => {
        conversation.handle(ev);
        if (ev.t !== 'result') return;
        finished = true;
        live.handle = null;
        live.waiting = null;
        this.approvals.cancel(source, 'Agent finished');
        this.set(id, { needs_json: JSON.stringify(live.skipped) });
        this.track(
          this.finish(id, ev.ok && !ev.stopped, ev.stopped ? 'Stopped.' : ev.error, live.lastText),
        );
      },
    });
    if (!finished) live.handle = handle;
  }

  private async finish(
    id: string,
    ok: boolean,
    error: string | null,
    lastText: string,
  ): Promise<void> {
    const r = this.row(id);
    if (r.status === 'discarded' || r.status === 'accepted') return;
    const resolving = this.live.get(id)?.resolving ?? null;
    if (ok && resolving) {
      const left = resolving.filter((f) => hasConflictMarkers(path.join(r.worktree, f)));
      if (left.length) {
        ok = false;
        error = `Conflicts are still in ${left.join(', ')}. Merge in a terminal, or discard.`;
      }
    }
    if (!ok) {
      const lastFailed = (JSON.parse(r.activity_json) as ChatItem[])
        .filter((x) => x.kind === 'tool' && x.status === 'failed')
        .pop();
      const failedRow =
        lastFailed?.kind === 'tool'
          ? `${lastFailed.target} · ${lastFailed.meta ?? 'failed'}`
          : null;
      const reason = error ?? failedRow ?? 'The agent stopped.';
      this.set(id, { status: 'failed', error: reason, ended_at: Date.now() });
      notify(this.hub, {
        projectId: r.project_id,
        kind: 'agent.failed',
        title: `Agent failed: ${taskLine(r.task)}`,
        body: reason,
        link: projectLink(r.project_id, `/agents?agent=${id}`),
      });
    } else {
      // Commit whatever the agent changed so the branch holds the work.
      await git(r.worktree, ['add', '-A']);
      const staged = await git(r.worktree, ['diff', '--cached', '--quiet']);
      // A merge (Merge with agent) must be concluded even when it changed nothing.
      const merging = (await git(r.worktree, ['rev-parse', '-q', '--verify', 'MERGE_HEAD'])).ok;
      if (!staged.ok || merging) {
        const email = (await git(r.worktree, ['config', 'user.email'])).stdout.trim();
        const ident = email ? [] : ['-c', 'user.name=Cherry', '-c', 'user.email=cherry@localhost'];
        await git(r.worktree, [
          ...ident,
          'commit',
          '-q',
          '-m',
          `agent: ${r.task.split('\n')[0]!.slice(0, 72)}`,
        ]);
      }
      // The report's "Needs you" list joins the commands that were refused (ADR-0028).
      const report = splitReport(lastText);
      const refused = JSON.parse(this.row(id).needs_json) as string[];
      this.set(id, { needs_json: JSON.stringify([...new Set([...refused, ...report.needs])]) });
      const summary =
        report.body
          .split('\n')
          .filter((l) => l.trim())
          .pop()
          ?.trim()
          .slice(0, 240) ?? null;
      await this.refreshChanges(id);
      const changes = this.changesCache.get(id);
      this.set(id, {
        status: 'done',
        summary: summary ?? (changes?.files ? null : 'No changes.'),
        ended_at: Date.now(),
      });
      const needs = JSON.parse(this.row(id).needs_json) as string[];
      const decision = this.adrs?.decisionFor(id);
      const ready = /ready to merge/i.test(lastText);
      if (resolving && ready && !needs.length) {
        // Merge with agent: conflicts fixed and checks passed, so finish the merge it was for.
        this.live.delete(id);
        try {
          await this.accept(id);
          notify(this.hub, {
            projectId: r.project_id,
            kind: 'agent.done',
            title: `Merged: ${taskLine(r.task)}`,
            body: 'The agent fixed the conflicts, the checks passed, and the work is merged.',
            link: projectLink(r.project_id, '/agents'),
          });
          this.startQueued();
          return;
        } catch {
          // Fall through: it stays done and the user merges by hand.
        }
      }
      notify(this.hub, {
        projectId: r.project_id,
        kind: needs.length ? 'agent.needs' : 'agent.done',
        title: needs.length
          ? `Agent needs you: ${taskLine(r.task)}`
          : decision && ready
            ? `Ready to merge: ADR-${String(decision.number).padStart(4, '0')} ${decision.title}`
            : resolving
              ? `Conflicts fixed: ${taskLine(r.task)}`
              : `Agent done: ${taskLine(r.task)}`,
        body: needs.length
          ? `Skipped ${needs.length === 1 ? 'a step' : `${needs.length} steps`} only you may run: ${needs[0]}`
          : (summary ??
            (changes?.files ? `${changes.files} files changed. Review the diff.` : 'No changes.')),
        link: projectLink(r.project_id, `/agents?agent=${id}`),
      });
    }
    this.live.delete(id);
    this.startQueued();
  }

  private startQueued(): void {
    const max = this.config.get().agents.maxRunning;
    const queued = this.db
      .prepare(`SELECT id FROM agents WHERE status = 'queued' ORDER BY started_at`)
      .all() as { id: string }[];
    for (const q of queued) {
      if (this.runningCount() >= max) break;
      this.run(q.id);
    }
  }

  private async refreshChanges(id: string): Promise<void> {
    const r = this.row(id);
    const stat = await git(r.worktree, ['diff', '--numstat', `${r.base_branch}...HEAD`]);
    if (!stat.ok) return;
    let files = 0;
    let added = 0;
    let removed = 0;
    for (const line of stat.stdout.trim().split('\n').filter(Boolean)) {
      const [a = '0', d = '0'] = line.split('\t');
      files++;
      added += Number(a) || 0;
      removed += Number(d) || 0;
    }
    this.changesCache.set(id, { files, added, removed });
  }

  async diff(id: string): Promise<{ files: ApprovalFile[] }> {
    const r = this.row(id);
    if (!existsSync(r.worktree)) return { files: [] };
    const names = await git(r.worktree, ['diff', '--name-status', '-z', `${r.base_branch}...HEAD`]);
    const parts = names.stdout.split('\0').filter(Boolean);
    const files: ApprovalFile[] = [];
    const mergeBase = (await git(r.worktree, ['merge-base', r.base_branch, 'HEAD'])).stdout.trim();
    for (let i = 0; i < parts.length;) {
      const status = parts[i++] ?? '';
      let oldPath = parts[i++] ?? '';
      let file = oldPath;
      // Renames and copies list the old path, then the new one.
      if (/^[RC]/.test(status)) file = parts[i++] ?? '';
      if (!/^[RC]/.test(status)) oldPath = file;
      if (!file || isSecretFile(file)) continue;
      const before = status === 'A' ? '' : await this.show(r.worktree, mergeBase, oldPath);
      const after = status === 'D' ? '' : await this.show(r.worktree, 'HEAD', file);
      const d = diffLines(before, after);
      files.push({
        path: file,
        isNew: status === 'A',
        added: d.added,
        removed: d.removed,
        lines: d.lines,
      });
    }
    return { files };
  }

  private async show(cwd: string, rev: string, file: string): Promise<string> {
    const r = await git(cwd, ['show', `${rev}:${file}`]);
    return r.ok ? r.stdout : '';
  }

  /** Merges the agent branch into the project's current branch (ff or merge commit, never force). */
  async accept(id: string): Promise<Agent> {
    const r = this.row(id);
    if (r.status !== 'done') throw conflict('Only a finished agent can be merged.');
    const dir = projectDir(this.config.projectsDir(), r.project_id);
    const status = await gitStatus(dir);
    if (!status?.branch) throw conflict('Check out a branch in the project first.');
    const merge = await git(dir, ['merge', '--no-edit', r.branch], 60_000);
    if (!merge.ok) {
      await git(dir, ['merge', '--abort']);
      if (/would be overwritten/i.test(merge.stderr))
        throw conflict(
          'Your uncommitted changes touch the same files. Commit or stash them, then merge again.',
        );
      if (/CONFLICT/i.test(merge.stdout + merge.stderr))
        throw new HttpError(
          409,
          'merge_conflict',
          'The agent branch conflicts with your branch. Nothing was changed. Merge with agent lets an agent fix the conflicts on its branch.',
        );
      throw conflict((merge.stderr || merge.stdout).trim().split('\n')[0] || 'git merge failed.');
    }
    await this.removeWorktree(r);
    this.set(id, { status: 'accepted', ended_at: Date.now() });
    this.adrs?.agentAccepted(id);
    this.hub.publish(`project:${r.project_id}`, 'project.changed', {
      projectId: r.project_id,
      paths: [],
    });
    return this.get(id);
  }

  /**
   * Merge with agent: merges the project's branch into the agent branch in its own worktree.
   * With no conflicts the work merges at once; otherwise the agent fixes them, runs the checks,
   * and Cherry merges when it reports "Ready to merge".
   */
  async resolve(id: string): Promise<Agent> {
    const r = this.row(id);
    if (r.status !== 'done') throw conflict('Only a finished agent can be merged.');
    const dir = projectDir(this.config.projectsDir(), r.project_id);
    const target = (await gitStatus(dir))?.branch;
    if (!target) throw conflict('Check out a branch in the project first.');
    const merge = await git(r.worktree, ['merge', '--no-edit', target], 60_000);
    if (merge.ok) {
      await this.refreshChanges(id);
      return this.accept(id);
    }
    const conflicted = (await git(r.worktree, ['diff', '--name-only', '--diff-filter=U'])).stdout
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (!conflicted.length) {
      await git(r.worktree, ['merge', '--abort']);
      throw conflict((merge.stderr || merge.stdout).trim().split('\n')[0] || 'git merge failed.');
    }
    if (this.runningCount() >= this.config.get().agents.maxRunning)
      throw conflict('All agent slots are busy. Try again when one finishes.');
    this.set(id, {
      status: 'running',
      summary: null,
      error: null,
      needs_json: '[]',
      ended_at: null,
    });
    this.run(id, {
      prompt: resolvePrompt(r.task, target, r.branch, conflicted),
      files: conflicted,
    });
    return this.get(id);
  }

  async discard(id: string): Promise<Agent> {
    const r = this.row(id);
    if (r.status === 'accepted') throw conflict('This agent was already accepted.');
    await this.stopRun(id);
    await this.removeWorktree(r);
    this.set(id, { status: 'discarded', ended_at: Date.now() });
    this.startQueued();
    return this.get(id);
  }

  async retry(id: string): Promise<Agent> {
    const r = this.row(id);
    if (ACTIVE.includes(r.status)) throw conflict('This agent is still running.');
    if (r.status === 'failed' || r.status === 'done') await this.discard(id);
    return this.start(r.project_id, {
      task: r.task,
      model: r.model as AgentStart['model'],
    });
  }

  /** The chat message for Continue in chat: what the agent did and the steps it left for you. */
  continuePrompt(id: string): { projectId: string; text: string } {
    const r = this.row(id);
    const needs = JSON.parse(r.needs_json) as string[];
    if (r.status !== 'done' || !needs.length)
      throw conflict('Only a finished agent that skipped steps can continue in the chat.');
    return {
      projectId: r.project_id,
      text: [
        `A background agent finished this task on branch ${r.branch} (not merged yet): ${taskLine(r.task)}`,
        r.summary ? `Its summary: ${r.summary}` : null,
        'It left these steps for me (only I may run them):',
        ...needs.map((c) => `- ${c}`),
        'Help me finish them. Check the branch first and tell me what each step will do before you run it.',
      ]
        .filter((l) => l !== null)
        .join('\n'),
    };
  }

  async stop(id: string): Promise<Agent> {
    await this.stopRun(id);
    const r = this.row(id);
    if (r.status === 'queued')
      this.set(id, { status: 'failed', error: 'Stopped.', ended_at: Date.now() });
    return this.get(id);
  }

  private async stopRun(id: string): Promise<void> {
    const l = this.live.get(id);
    if (!l) return;
    this.approvals.cancel(`agent:${id}`, 'Agent stopped');
    await l.handle?.interrupt();
  }

  private async removeWorktree(r: Row): Promise<void> {
    const dir = projectDir(this.config.projectsDir(), r.project_id);
    if (existsSync(r.worktree)) {
      const rm = await git(dir, ['worktree', 'remove', '--force', r.worktree], 60_000);
      if (!rm.ok && existsSync(r.worktree)) rmSync(r.worktree, { recursive: true, force: true });
    }
    await git(dir, ['worktree', 'prune']);
    await git(dir, ['branch', '-D', r.branch]);
    this.changesCache.delete(r.id);
  }

  private readonly finishing = new Set<Promise<void>>();

  /** Keeps the end-of-run work (commit, diff stats) so shutdown can wait for it. */
  private track(p: Promise<void>): void {
    this.finishing.add(p);
    void p.finally(() => this.finishing.delete(p));
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.live.keys()].map((id) => this.stopRun(id)));
    await Promise.allSettled([...this.finishing]);
  }
}
