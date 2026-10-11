import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type {
  CommitBody,
  CommitFile,
  CommitPlan,
  CommitResult,
  CommitSuggestion,
} from '@cherry/shared';
import type { CustomTool, Runner } from '../claude/runner.ts';
import type { ConfigStore } from '../config.ts';
import type { EventHub } from '../events.ts';
import { git } from '../git.ts';
import { badRequest, conflict, HttpError } from '../http.ts';
import { isSecretFile } from '../paths.ts';
import { projectDir } from './workspace.ts';

/** Diff text Claude sees: per file and in all. */
const FILE_CHARS = 4_000;
const TOTAL_CHARS = 60_000;

/** Parses `git status --porcelain=v1 -z --untracked-files=all`. */
export function parsePorcelain(out: string): CommitFile[] {
  const files: CommitFile[] = [];
  const recs = out.split('\0');
  for (let i = 0; i < recs.length; i++) {
    const rec = recs[i] ?? '';
    if (rec.length < 4) continue;
    const xy = rec.slice(0, 2);
    const p = rec.slice(3);
    if (xy === '!!') continue;
    if (xy === '??') files.push({ path: p, letter: 'U', origPath: null });
    else if (xy.includes('R') || xy.includes('C')) {
      files.push({ path: p, letter: 'R', origPath: recs[i + 1] ?? null });
      i++;
    } else if (xy.includes('D')) files.push({ path: p, letter: 'D', origPath: null });
    else if (xy.includes('A')) files.push({ path: p, letter: 'A', origPath: null });
    else files.push({ path: p, letter: 'M', origPath: null });
  }
  return files;
}

const SubmitSchema = z.object({
  commits: z
    .array(
      z.object({
        message: z.string().trim().min(1).max(200),
        body: z.string().trim().max(2000).optional(),
        explanation: z.string().trim().min(1).max(1500),
        files: z.array(z.string()).min(1),
      }),
    )
    .min(1)
    .max(30),
});

/**
 * Groups the given files into commits. Unknown files are dropped, a file is used once, and
 * files Claude left out go into a last group.
 */
export function normaliseGroups(
  offered: string[],
  groups: z.infer<typeof SubmitSchema>['commits'],
): CommitSuggestion[] {
  const left = new Set(offered);
  const out: CommitSuggestion[] = [];
  for (const g of groups) {
    const files = g.files.filter((f) => left.delete(f));
    if (files.length === 0) continue;
    out.push({
      id: `c${out.length + 1}`,
      message: g.message.split('\n')[0]!.trim(),
      body: g.body?.trim() || null,
      explanation: g.explanation,
      files,
    });
  }
  if (left.size > 0) {
    out.push({
      id: `c${out.length + 1}`,
      message: 'chore: other changes',
      body: null,
      explanation: 'These files changed too. Claude did not put them in a group.',
      files: [...left],
    });
  }
  return out;
}

function commitsPrompt(files: CommitFile[], diff: string, recent: string): string {
  return [
    'Group these uncommitted changes into a few logical commits, then call propose_commits once.',
    '',
    '## Rules',
    '- One commit per logical change. Put every file below in exactly one commit. Use the paths exactly as listed.',
    "- message: one subject line, at most 72 characters. Follow the style of the project's recent commits (often conventional commits: feat:, fix:, docs:, test:, chore:).",
    '- body: optional, 1 to 3 short lines when the subject is not enough.',
    '- explanation: what this commit does and why, for the user who will commit it. Write it in ASD-STE100 Simplified Technical English: 2 to 4 sentences, max 20 words each, active voice, simple words, one idea per sentence. Keep code names and paths as they are.',
    '- Order the commits so that each one makes sense after the ones before it.',
    '',
    '## Recent commits (style)',
    recent.trim() || '(none yet)',
    '',
    '## Changed files',
    ...files.map(
      (f) => `- ${f.letter} ${f.path}${f.origPath ? ` (renamed from ${f.origPath})` : ''}`,
    ),
    '',
    '## Diff',
    diff,
  ].join('\n');
}

interface Cached {
  fingerprint: string;
  plan: CommitPlan;
}

/**
 * "Ready to commit" on the GitHub view. Claude only reads the diff and suggests groups; the
 * commit itself is a plain `git commit` with the user's own identity (no Claude co-author).
 */
export class CommitService {
  private readonly cache = new Map<string, Cached>();
  private readonly pending = new Map<string, Promise<CommitPlan>>();

  constructor(
    private readonly config: ConfigStore,
    private readonly hub: EventHub,
    private readonly runner: Runner,
  ) {}

  private async snapshot(dir: string) {
    const st = await git(dir, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
    if (!st.ok) throw badRequest('This folder is not a git repository.');
    const all = parsePorcelain(st.stdout);
    const hidden = all.filter((f) => isSecretFile(f.path)).map((f) => f.path);
    const files = all.filter((f) => !isSecretFile(f.path));
    const diff = await git(dir, ['diff', 'HEAD', '--no-color', '--no-ext-diff']);
    const hash = createHash('sha1')
      .update(st.stdout)
      .update(diff.ok ? diff.stdout : '');
    for (const f of files.filter((x) => x.letter === 'U')) {
      try {
        const s = statSync(path.join(dir, f.path));
        hash.update(`${f.path}:${s.size}:${s.mtimeMs}`);
      } catch {
        // gone since status
      }
    }
    return { files, hidden, fingerprint: hash.digest('hex'), diff: diff.ok ? diff.stdout : '' };
  }

  private async author(dir: string): Promise<CommitPlan['author']> {
    const [name, email] = await Promise.all([
      git(dir, ['config', 'user.name']),
      git(dir, ['config', 'user.email']),
    ]);
    const n = name.stdout.trim();
    return n ? { name: n, email: email.stdout.trim() } : null;
  }

  /** Diff text for Claude: tracked changes per file, then the start of each new file. */
  private diffFor(dir: string, files: CommitFile[], full: string): string {
    const parts: string[] = [];
    const offered = new Set(files.map((f) => f.path));
    for (const chunk of full.split(/^(?=diff --git )/m)) {
      const m = /^diff --git a\/(.+?) b\/(.+)$/m.exec(chunk);
      if (!m || !(offered.has(m[2]!) || offered.has(m[1]!))) continue;
      parts.push(chunk.length > FILE_CHARS ? `${chunk.slice(0, FILE_CHARS)}\n…(cut)\n` : chunk);
    }
    for (const f of files.filter((x) => x.letter === 'U')) {
      try {
        const buf = readFileSync(path.join(dir, f.path));
        if (buf.includes(0)) {
          parts.push(`new binary file ${f.path}\n`);
          continue;
        }
        const text = buf.toString('utf8');
        parts.push(
          `new file ${f.path}\n${text.length > FILE_CHARS ? `${text.slice(0, FILE_CHARS)}\n…(cut)` : text}\n`,
        );
      } catch {
        // unreadable: the name alone is listed above
      }
    }
    let out = '';
    for (const p of parts) {
      if (out.length + p.length > TOTAL_CHARS) {
        out += '\n…(more changes cut)\n';
        break;
      }
      out += p;
    }
    return out;
  }

  /**
   * The changes as commits. Without `refresh` this never calls Claude: it returns the last plan if
   * nothing changed, else every file in one group. `refresh` (Group with Claude) runs Haiku.
   */
  async plan(projectId: string, refresh = false): Promise<CommitPlan> {
    const dir = projectDir(this.config.projectsDir(), projectId);
    const snap = await this.snapshot(dir);
    const cached = this.cache.get(projectId);
    if (!refresh && cached?.fingerprint === snap.fingerprint) return cached.plan;
    if (!refresh) {
      const plan = await this.ungrouped(dir, snap);
      this.cache.set(projectId, { fingerprint: snap.fingerprint, plan });
      return plan;
    }
    const key = `${projectId}:${snap.fingerprint}`;
    const running = this.pending.get(key);
    if (running && !refresh) return running;
    const job = this.build(dir, snap).then((plan) => {
      this.cache.set(projectId, { fingerprint: snap.fingerprint, plan });
      return plan;
    });
    this.pending.set(key, job);
    void job.finally(() => this.pending.delete(key)).catch(() => undefined);
    return job;
  }

  /** Every changed file in one commit, for free. */
  private async ungrouped(
    dir: string,
    snap: Awaited<ReturnType<CommitService['snapshot']>>,
  ): Promise<CommitPlan> {
    const files = snap.files.map((f) => f.path);
    return {
      fingerprint: snap.fingerprint,
      author: await this.author(dir),
      files: snap.files,
      hidden: snap.hidden,
      commits: files.length
        ? [
            {
              id: 'c1',
              message: 'chore: update files',
              body: null,
              explanation:
                'Not grouped yet. Edit the message and commit all files, or use Group with Claude for suggested commits.',
              files,
            },
          ]
        : [],
      error: null,
      grouped: files.length === 0,
    };
  }

  private async build(
    dir: string,
    snap: Awaited<ReturnType<CommitService['snapshot']>>,
  ): Promise<CommitPlan> {
    const author = await this.author(dir);
    const base = {
      fingerprint: snap.fingerprint,
      author,
      files: snap.files,
      hidden: snap.hidden,
      grouped: true,
    };
    if (snap.files.length === 0) return { ...base, commits: [], error: null };
    const paths = snap.files.map((f) => f.path);

    let proposed: z.infer<typeof SubmitSchema>['commits'] | null = null;
    let error: string | null = null;
    const submit: CustomTool = {
      name: 'propose_commits',
      description: 'Propose the commits. Call once with every changed file in exactly one commit.',
      shape: SubmitSchema.shape,
      handler: async (args) => {
        const parsed = SubmitSchema.safeParse(args);
        if (!parsed.success) {
          return {
            ok: false,
            text: `Not valid, fix it and call propose_commits again: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
          };
        }
        proposed = parsed.data.commits;
        return { ok: true, text: 'Saved. You are done; stop here.' };
      },
    };
    const recent = await git(dir, ['log', '-8', '--format=%s']);
    const handle = this.runner({
      cwd: dir,
      prompt: commitsPrompt(snap.files, this.diffFor(dir, snap.files, snap.diff), recent.stdout),
      resume: null,
      model: 'haiku',
      planMode: false,
      appendSystemPrompt:
        'You group git changes into commits for Cherry. You only read what you are given. Finish by calling propose_commits.',
      allowedTools: [],
      disallowedTools: [
        'Edit',
        'Write',
        'MultiEdit',
        'NotebookEdit',
        'Bash',
        'WebFetch',
        'WebSearch',
      ],
      decisions: false,
      extraTools: [submit],
      onPermission: async () => ({ allow: false, message: 'Only propose_commits is allowed.' }),
      onDecision: async () => ({ ok: false, error: 'You cannot ask questions here.' }),
      onEvent: (ev) => {
        if (ev.t === 'result' && !ev.ok) error = ev.error;
      },
    });
    await handle.done;

    const groups = proposed as z.infer<typeof SubmitSchema>['commits'] | null;
    if (!groups) {
      return {
        ...base,
        commits: normaliseGroups(paths, []),
        error: error ?? 'Claude did not group the changes.',
      };
    }
    return { ...base, commits: normaliseGroups(paths, groups), error: null };
  }

  /** `git add` and `git commit` exactly these files, as the user. */
  async commit(projectId: string, body: CommitBody): Promise<CommitResult> {
    const dir = projectDir(this.config.projectsDir(), projectId);
    const snap = await this.snapshot(dir);
    const byPath = new Map(snap.files.map((f) => [f.path, f]));
    const wanted = [...new Set(body.files)];
    for (const f of wanted) {
      if (isSecretFile(f)) throw badRequest(`${f} is a secret file. Cherry does not commit it.`);
      if (!byPath.has(f))
        throw conflict(`${f} has no uncommitted changes any more. Refresh the list.`);
    }
    if (!(await this.author(dir)))
      throw badRequest(
        'Git does not know your name yet. Run: git config --global user.name "Your Name" and git config --global user.email you@example.com',
      );
    const pathspecs = wanted.flatMap((f) => {
      const orig = byPath.get(f)?.origPath;
      return orig ? [f, orig] : [f];
    });
    const add = await git(dir, ['add', '-A', '--', ...pathspecs]);
    if (!add.ok) throw new HttpError(500, 'git_failed', firstLine(add.stderr) || 'git add failed.');
    const [subject, ...rest] = body.message.split('\n');
    const extra = rest.join('\n').trim();
    const res = await git(
      dir,
      ['commit', '-m', subject!.trim(), ...(extra ? ['-m', extra] : []), '--', ...pathspecs],
      120_000,
    );
    if (!res.ok) {
      throw new HttpError(
        409,
        'commit_failed',
        firstLine(res.stderr) || firstLine(res.stdout) || 'git commit failed.',
      );
    }
    const hash = (await git(dir, ['rev-parse', '--short', 'HEAD'])).stdout.trim();

    // Keep the other suggestions: drop the committed files, and match the new state.
    const cached = this.cache.get(projectId);
    if (cached) {
      const done = new Set(wanted);
      const next = await this.snapshot(dir);
      const commits = cached.plan.commits
        .map((c) => ({ ...c, files: c.files.filter((f) => !done.has(f)) }))
        .filter((c) => c.files.length > 0);
      this.cache.set(projectId, {
        fingerprint: next.fingerprint,
        plan: {
          ...cached.plan,
          fingerprint: next.fingerprint,
          files: next.files,
          hidden: next.hidden,
          commits,
        },
      });
    }
    this.hub.publish(`project:${projectId}`, 'project.changed', { projectId, paths: wanted });
    return { hash, message: subject!.trim() };
  }
}

const firstLine = (s: string) =>
  s
    .split('\n')
    .find((l) => l.trim())
    ?.trim() ?? '';
