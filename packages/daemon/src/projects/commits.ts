import { z } from 'zod';
import type { CommitFile, CommitResult, SourceControl, StageBody } from '@cherry/shared';
import type { CustomTool, Runner } from '../claude/runner.ts';
import type { ConfigStore } from '../config.ts';
import type { Db } from '../db.ts';
import type { EventHub } from '../events.ts';
import { git } from '../git.ts';
import { badRequest, conflict, HttpError } from '../http.ts';
import { isSecretFile } from '../paths.ts';
import { projectDir } from './workspace.ts';

/** Diff text Haiku sees when it writes a message: per file and in all. */
const FILE_CHARS = 4_000;
const TOTAL_CHARS = 30_000;

export const COMMIT_TOOL = 'commit_changes';

/** Added to the chat prompt while Auto commit is on (ADR-0030). */
export const AUTO_COMMIT_PROMPT = `- Auto commit is on. After each finished piece of work (a fix, a feature step, a doc change), call ${COMMIT_TOOL} with the files you changed for it and a short conventional commit message (feat:, fix:, docs:, test:, refactor:, chore:). Make small commits. Do not run git add or git commit yourself, and do not push.`;

interface Entry extends CommitFile {
  /** Index side of `git status` (staged). */
  x: string;
  /** Work-tree side (not staged yet). */
  y: string;
}

const letterOf = (c: string): CommitFile['letter'] =>
  c === 'A' ? 'A' : c === 'D' ? 'D' : c === 'R' || c === 'C' ? 'R' : 'M';

/** Parses `git status --porcelain=v1 -z --untracked-files=all`, keeping both sides. */
export function parseStatus(out: string): Entry[] {
  const files: Entry[] = [];
  const recs = out.split('\0');
  for (let i = 0; i < recs.length; i++) {
    const rec = recs[i] ?? '';
    if (rec.length < 4) continue;
    const x = rec[0]!;
    const y = rec[1]!;
    const p = rec.slice(3);
    if (x === '!') continue;
    let origPath: string | null = null;
    if (x === 'R' || x === 'C') {
      origPath = recs[i + 1] ?? null;
      i++;
    }
    files.push({ path: p, letter: x === '?' ? 'U' : letterOf(x === ' ' ? y : x), origPath, x, y });
  }
  return files;
}

/** The staged list and the not-staged list, as the Source Control view shows them. */
export function splitStatus(entries: Entry[]): Pick<SourceControl, 'staged' | 'changes'> {
  const staged: CommitFile[] = [];
  const changes: CommitFile[] = [];
  for (const e of entries) {
    if (e.x === '?') {
      changes.push({ path: e.path, letter: 'U', origPath: null });
      continue;
    }
    if (e.x !== ' ') staged.push({ path: e.path, letter: letterOf(e.x), origPath: e.origPath });
    if (e.y !== ' ') changes.push({ path: e.path, letter: letterOf(e.y), origPath: null });
  }
  return { staged, changes };
}

const firstLine = (s: string) => s.trim().split('\n')[0] ?? '';

/**
 * Commits in the GitHub view (ADR-0030): a VS Code style Source Control list where the user
 * stages and commits by hand, or Auto commit, where Claude commits through `commit_changes`.
 * Every commit is a plain `git commit` with the user's own identity (no Claude co-author).
 */
export class CommitService {
  constructor(
    private readonly config: ConfigStore,
    private readonly db: Db,
    private readonly hub: EventHub,
    private readonly runner: Runner,
  ) {}

  private dir(projectId: string): string {
    return projectDir(this.config.projectsDir(), projectId);
  }

  private changed(projectId: string): void {
    this.hub.publish(`project:${projectId}`, 'project.changed', { projectId, paths: [] });
  }

  private async status(dir: string): Promise<Entry[]> {
    const st = await git(dir, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
    if (!st.ok) throw badRequest('This folder is not a git repository.');
    return parseStatus(st.stdout);
  }

  private async author(dir: string): Promise<SourceControl['author']> {
    const [name, email] = await Promise.all([
      git(dir, ['config', 'user.name']),
      git(dir, ['config', 'user.email']),
    ]);
    const n = name.stdout.trim();
    return n ? { name: n, email: email.stdout.trim() } : null;
  }

  private async needAuthor(dir: string): Promise<void> {
    if (!(await this.author(dir)))
      throw badRequest(
        'Git does not know your name yet. Run: git config --global user.name "Your Name" and git config --global user.email you@example.com',
      );
  }

  autoCommit(projectId: string): boolean {
    const row = this.db
      .prepare(`SELECT value FROM project_settings WHERE project_id = ? AND key = 'autoCommit'`)
      .get(projectId) as { value: string } | undefined;
    return row?.value === '1';
  }

  setAutoCommit(projectId: string, on: boolean): SourceControl['autoCommit'] {
    this.dir(projectId);
    this.db
      .prepare(
        `INSERT INTO project_settings (project_id, key, value) VALUES (?, 'autoCommit', ?)
         ON CONFLICT (project_id, key) DO UPDATE SET value = excluded.value`,
      )
      .run(projectId, on ? '1' : '0');
    this.changed(projectId);
    return on;
  }

  async list(projectId: string): Promise<SourceControl> {
    const dir = this.dir(projectId);
    const entries = await this.status(dir);
    const hidden = entries.filter((e) => isSecretFile(e.path)).map((e) => e.path);
    const { staged, changes } = splitStatus(entries.filter((e) => !isSecretFile(e.path)));
    return {
      author: await this.author(dir),
      staged,
      changes,
      hidden,
      autoCommit: this.autoCommit(projectId),
    };
  }

  /** `git add` these files (or every changed file). Secret files are never staged. */
  async stage(projectId: string, body: StageBody): Promise<SourceControl> {
    const dir = this.dir(projectId);
    const entries = await this.status(dir);
    const files = body.all
      ? entries.filter((e) => e.y !== ' ' && !isSecretFile(e.path)).map((e) => e.path)
      : [...new Set(body.files)];
    for (const f of files)
      if (isSecretFile(f)) throw badRequest(`${f} is a secret file. Cherry does not stage it.`);
    if (files.length) {
      const add = await git(dir, ['add', '-A', '--', ...files]);
      if (!add.ok)
        throw new HttpError(500, 'git_failed', firstLine(add.stderr) || 'git add failed.');
    }
    this.changed(projectId);
    return this.list(projectId);
  }

  /** Takes files out of the next commit; their changes stay in the files. */
  async unstage(projectId: string, body: StageBody): Promise<SourceControl> {
    const dir = this.dir(projectId);
    const entries = await this.status(dir);
    const staged = new Set(entries.filter((e) => e.x !== ' ' && e.x !== '?').map((e) => e.path));
    const files = body.all ? [...staged] : body.files.filter((f) => staged.has(f));
    if (files.length) {
      // Before the first commit there is no HEAD to restore from.
      const hasHead = (await git(dir, ['rev-parse', '-q', '--verify', 'HEAD'])).ok;
      const res = hasHead
        ? await git(dir, ['restore', '--staged', '--', ...files])
        : await git(dir, ['rm', '--cached', '-r', '-q', '--', ...files]);
      if (!res.ok)
        throw new HttpError(500, 'git_failed', firstLine(res.stderr) || 'git restore failed.');
    }
    this.changed(projectId);
    return this.list(projectId);
  }

  /** Commits what is staged, as the user. */
  async commit(projectId: string, message: string): Promise<CommitResult> {
    const dir = this.dir(projectId);
    const staged = (await this.status(dir)).filter((e) => e.x !== ' ' && e.x !== '?');
    if (!staged.length) throw conflict('Nothing is staged. Stage the files to commit first.');
    const secret = staged.find((e) => isSecretFile(e.path));
    if (secret)
      throw badRequest(`${secret.path} is a secret file. Unstage it; Cherry does not commit it.`);
    await this.needAuthor(dir);
    return this.gitCommit(projectId, dir, message, []);
  }

  /** Commits exactly these files, whatever else is staged (Claude's commit_changes). */
  async commitFiles(projectId: string, message: string, files: string[]): Promise<CommitResult> {
    const dir = this.dir(projectId);
    const byPath = new Map((await this.status(dir)).map((e) => [e.path, e]));
    const wanted = [...new Set(files)];
    if (!wanted.length) throw badRequest('Name the files to commit.');
    for (const f of wanted) {
      if (isSecretFile(f)) throw badRequest(`${f} is a secret file. Cherry does not commit it.`);
      if (!byPath.has(f)) throw conflict(`${f} has no uncommitted changes.`);
    }
    await this.needAuthor(dir);
    const pathspecs = wanted.flatMap((f) => {
      const orig = byPath.get(f)?.origPath;
      return orig ? [f, orig] : [f];
    });
    const add = await git(dir, ['add', '-A', '--', ...pathspecs]);
    if (!add.ok) throw new HttpError(500, 'git_failed', firstLine(add.stderr) || 'git add failed.');
    return this.gitCommit(projectId, dir, message, pathspecs);
  }

  private async gitCommit(
    projectId: string,
    dir: string,
    message: string,
    pathspecs: string[],
  ): Promise<CommitResult> {
    const [subject, ...rest] = message.trim().split('\n');
    const extra = rest.join('\n').trim();
    const res = await git(
      dir,
      [
        'commit',
        '-m',
        subject!.trim(),
        ...(extra ? ['-m', extra] : []),
        ...(pathspecs.length ? ['--', ...pathspecs] : []),
      ],
      120_000,
    );
    if (!res.ok)
      throw new HttpError(
        409,
        'commit_failed',
        firstLine(res.stderr) || firstLine(res.stdout) || 'git commit failed.',
      );
    const hash = (await git(dir, ['rev-parse', '--short', 'HEAD'])).stdout.trim();
    this.changed(projectId);
    return { hash, message: subject!.trim() };
  }

  /** Haiku writes one message for the staged changes. Only on the user's click (ADR-0022). */
  async writeMessage(projectId: string): Promise<{ message: string }> {
    const dir = this.dir(projectId);
    const staged = (await this.status(dir)).filter(
      (e) => e.x !== ' ' && e.x !== '?' && !isSecretFile(e.path),
    );
    if (!staged.length) throw conflict('Nothing is staged. Stage the files to commit first.');
    const diff = await git(dir, [
      'diff',
      '--cached',
      '--no-color',
      '--no-ext-diff',
      '--',
      ...staged.map((e) => e.path),
    ]);
    let text = '';
    for (const chunk of (diff.ok ? diff.stdout : '').split(/^(?=diff --git )/m)) {
      const part = chunk.length > FILE_CHARS ? `${chunk.slice(0, FILE_CHARS)}\n…(cut)\n` : chunk;
      if (text.length + part.length > TOTAL_CHARS) {
        text += '\n…(more changes cut)\n';
        break;
      }
      text += part;
    }
    const recent = await git(dir, ['log', '-8', '--format=%s']);
    let message: string | null = null;
    let error: string | null = null;
    const submit: CustomTool = {
      name: 'commit_message',
      description: 'Give the commit message. Call once.',
      shape: {
        message: z.string().describe('Subject line, then optionally a blank line and a short body'),
      },
      handler: async (args) => {
        const raw = (args as { message?: unknown }).message;
        const m = typeof raw === 'string' ? raw.trim() : '';
        if (!m) return { ok: false, text: 'The message is empty. Call commit_message again.' };
        message = m;
        return { ok: true, text: 'Saved. You are done; stop here.' };
      },
    };
    const handle = this.runner({
      cwd: dir,
      prompt: [
        'Write one git commit message for these staged changes, then call commit_message once.',
        "- Subject: one line, at most 72 characters, in the style of the project's recent commits (often conventional commits: feat:, fix:, docs:, test:, chore:).",
        '- Body: optional, 1 to 3 short lines when the subject is not enough.',
        '',
        '## Recent commits (style)',
        recent.stdout.trim() || '(none yet)',
        '',
        '## Staged files',
        ...staged.map((e) => `- ${e.letter} ${e.path}`),
        '',
        '## Diff',
        text,
      ].join('\n'),
      resume: null,
      model: 'haiku',
      planMode: false,
      appendSystemPrompt:
        'You write git commit messages for Cherry. You only read what you are given. Finish by calling commit_message.',
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
      onPermission: async () => ({ allow: false, message: 'Only commit_message is allowed.' }),
      onDecision: async () => ({ ok: false, error: 'You cannot ask questions here.' }),
      onEvent: (ev) => {
        if (ev.t === 'result' && !ev.ok) error = ev.error;
      },
    });
    await handle.done;
    if (!message)
      throw new HttpError(502, 'no_message', error ?? 'Claude did not write a message.');
    return { message };
  }

  /** commit_changes for the chat while Auto commit is on. */
  tool(projectId: string): CustomTool {
    return {
      name: COMMIT_TOOL,
      description:
        'Commit the files you changed for one finished piece of work, as the user. Cherry runs git add and git commit for exactly these files. Secret files are refused.',
      shape: {
        message: z
          .string()
          .describe('Conventional commit message, e.g. "fix(api): handle empty input"'),
        files: z
          .array(z.string())
          .describe('Paths relative to the project, the files of this piece of work'),
      },
      handler: async (args) => {
        const parsed = z
          .object({
            message: z.string().trim().min(1).max(5000),
            files: z.array(z.string()).min(1),
          })
          .safeParse(args);
        if (!parsed.success)
          return { ok: false, text: 'Give a message and at least one file, then call again.' };
        try {
          const r = await this.commitFiles(projectId, parsed.data.message, parsed.data.files);
          return { ok: true, text: `Committed ${r.hash} ${r.message}` };
        } catch (e) {
          return { ok: false, text: e instanceof Error ? e.message : String(e) };
        }
      },
    };
  }
}
