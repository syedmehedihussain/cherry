import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  IssueSeveritySchema,
  IssueStatusSchema,
  IssueTypeSchema,
  type GithubIssue,
  type Issue,
  type IssueInput,
  type IssueList,
} from '@cherry/shared';
import type { ApprovalBroker } from '../claude/approvals.ts';
import type { ConfigStore } from '../config.ts';
import { run } from '../exec.ts';
import { writeFileAtomic } from '../fsutil.ts';
import { gitStatus } from '../git.ts';
import { notify, projectLink, type EventHub } from '../events.ts';
import { conflict, notFound } from '../http.ts';
import { frontMatter } from '../projects/status.ts';
import { projectDir } from '../projects/workspace.ts';

export const ISSUES_DIR = path.join('docs', 'issues');
const FILE = /^(\d{4})-[\w.-]+\.md$/;
const GH_TTL_MS = 60_000;

/** "Chat scroll jumps on reply!" → "chat-scroll-jumps-on-reply". */
export function issueSlug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48)
      .replace(/-+$/, '') || 'issue'
  );
}

/** A front matter value without a trailing `# comment`. */
const clean = (v: string | undefined) => (v ?? '').split(/\s+#/)[0]!.trim();
const oneLine = (v: string) => v.replace(/[\r\n]+/g, ' ').trim();

function render(fields: Omit<Issue, 'number' | 'file' | 'updatedAt'>): string {
  return [
    '---',
    `title: ${oneLine(fields.title)}`,
    `status: ${fields.status}`,
    `type: ${fields.type}`,
    `severity: ${fields.severity}`,
    `cycle: ${fields.cycle ?? ''}`.trimEnd(),
    `github: ${fields.github ?? ''}`.trimEnd(),
    '---',
    '',
    fields.body.trim(),
    '',
  ].join('\n');
}

export function parseIssue(file: string, text: string, updatedAt: number): Issue | null {
  const m = FILE.exec(path.basename(file));
  if (!m) return null;
  const { fields, body } = frontMatter(text);
  return {
    number: Number(m[1]),
    file,
    title: clean(fields.title) || path.basename(file, '.md'),
    status: IssueStatusSchema.catch('open').parse(clean(fields.status)),
    type: IssueTypeSchema.catch('bug').parse(clean(fields.type)),
    severity: IssueSeveritySchema.catch('annoying').parse(clean(fields.severity)),
    cycle: clean(fields.cycle) || null,
    github: clean(fields.github) || null,
    body: body.trim(),
    updatedAt,
  };
}

/** Issues as files in docs/issues/, with the project's GitHub issues alongside (ADR-0035). */
export class IssueService {
  private readonly gh = new Map<string, { at: number; list: Omit<GithubIssue, 'local'>[] }>();

  constructor(
    private readonly config: ConfigStore,
    private readonly approvals: ApprovalBroker,
    private readonly hub: EventHub,
  ) {}

  private dir(projectId: string): string {
    return projectDir(this.config.projectsDir(), projectId);
  }

  private read(dir: string): Issue[] {
    const root = path.join(dir, ISSUES_DIR);
    let names: string[];
    try {
      names = readdirSync(root);
    } catch {
      return [];
    }
    const out: Issue[] = [];
    for (const name of names) {
      if (!FILE.test(name)) continue;
      const abs = path.join(root, name);
      try {
        const st = statSync(abs);
        if (!st.isFile()) continue;
        const issue = parseIssue(
          path.join(ISSUES_DIR, name).split(path.sep).join('/'),
          readFileSync(abs, 'utf8'),
          st.mtimeMs,
        );
        if (issue) out.push(issue);
      } catch {
        // A file that vanished or cannot be read is skipped.
      }
    }
    return out.sort((a, b) => b.number - a.number);
  }

  async list(projectId: string): Promise<IssueList> {
    const dir = this.dir(projectId);
    const issues = this.read(dir);
    const status = await gitStatus(dir);
    if (!status?.remote) return { issues, github: null };
    const gh = await this.githubIssues(dir);
    const linked = new Map(issues.filter((i) => i.github).map((i) => [i.github!, i.file]));
    return {
      issues,
      github: {
        issues: gh.list.map((g) => ({ ...g, local: linked.get(g.url) ?? null })),
        error: gh.error,
      },
    };
  }

  private async githubIssues(
    dir: string,
  ): Promise<{ list: Omit<GithubIssue, 'local'>[]; error: string | null }> {
    const cached = this.gh.get(dir);
    if (cached && Date.now() - cached.at < GH_TTL_MS) return { list: cached.list, error: null };
    const r = await run(
      'gh',
      ['issue', 'list', '--state', 'open', '--limit', '50', '--json', 'number,title,url,labels'],
      { cwd: dir, timeoutMs: 15_000 },
    );
    if (!r.ok) {
      return {
        list: [],
        error: /not.*logged|auth/i.test(r.stderr)
          ? 'Log in to GitHub with `gh auth login` to see its issues.'
          : 'Could not read GitHub issues.',
      };
    }
    try {
      const raw = JSON.parse(r.stdout) as {
        number: number;
        title: string;
        url: string;
        labels?: { name: string }[];
      }[];
      const list = raw.map((g) => ({
        number: g.number,
        title: g.title,
        url: g.url,
        labels: (g.labels ?? []).map((l) => l.name),
      }));
      this.gh.set(dir, { at: Date.now(), list });
      return { list, error: null };
    } catch {
      return { list: [], error: 'Could not read GitHub issues.' };
    }
  }

  /** Writes a new issue file with the next number. */
  create(
    projectId: string,
    input: Required<IssueInput>,
    extra: { github?: string | null } = {},
  ): Issue {
    const dir = this.dir(projectId);
    const root = path.join(dir, ISSUES_DIR);
    mkdirSync(root, { recursive: true });
    const next = Math.max(0, ...this.read(dir).map((i) => i.number)) + 1;
    const name = `${String(next).padStart(4, '0')}-${issueSlug(input.title)}.md`;
    const abs = path.join(root, name);
    const fields = {
      title: input.title,
      status: 'open' as const,
      type: input.type,
      severity: input.severity,
      cycle: null,
      github: extra.github ?? null,
      body: input.body,
    };
    // `wx`: never replace a file that appeared in the meantime.
    writeFileSync(abs, render(fields), { flag: 'wx' });
    return parseIssue(
      path.join(ISSUES_DIR, name).split(path.sep).join('/'),
      readFileSync(abs, 'utf8'),
      statSync(abs).mtimeMs,
    )!;
  }

  private find(projectId: string, number: number): { dir: string; issue: Issue } {
    const dir = this.dir(projectId);
    const issue = this.read(dir).find((i) => i.number === number);
    if (!issue) throw notFound(`Issue ${number} is not in ${ISSUES_DIR}.`);
    return { dir, issue };
  }

  private save(dir: string, issue: Issue): Issue {
    const abs = path.join(dir, issue.file);
    writeFileAtomic(abs, render(issue));
    return { ...issue, updatedAt: statSync(abs).mtimeMs };
  }

  setStatus(projectId: string, number: number, status: Issue['status']): Issue {
    const { dir, issue } = this.find(projectId, number);
    return this.save(dir, { ...issue, status });
  }

  /** Copies an open GitHub issue into a local file that links back to it. */
  async importGithub(projectId: string, number: number): Promise<Issue> {
    const dir = this.dir(projectId);
    const existing = this.read(dir);
    const r = await run(
      'gh',
      ['issue', 'view', String(number), '--json', 'number,title,url,body,labels'],
      { cwd: dir, timeoutMs: 15_000 },
    );
    if (!r.ok) throw conflict(`Could not read GitHub issue #${number}.`);
    const g = JSON.parse(r.stdout) as {
      title: string;
      url: string;
      body?: string;
      labels?: { name: string }[];
    };
    const dup = existing.find((i) => i.github === g.url);
    if (dup) throw conflict(`GitHub issue #${number} is already ${dup.file}.`);
    const labels = (g.labels ?? []).map((l) => l.name.toLowerCase());
    return this.create(
      projectId,
      {
        title: g.title.slice(0, 140) || `GitHub issue ${number}`,
        type: labels.includes('enhancement')
          ? 'improvement'
          : labels.includes('bug')
            ? 'bug'
            : 'idea',
        severity: 'annoying',
        body: g.body ?? '',
      },
      { github: g.url },
    );
  }

  /**
   * Creates the issue on GitHub after the user approves the card (an outward action, like a
   * push), then stores the link in the file.
   */
  async sendToGithub(projectId: string, number: number): Promise<{ approvalId: string }> {
    const { dir, issue } = this.find(projectId, number);
    if (issue.github) throw conflict('This issue is already on GitHub.');
    if (!(await gitStatus(dir))?.remote) throw conflict('This project has no GitHub remote.');
    const bodyFile = path.join(tmpdir(), `cherry-issue-${projectId}-${number}-${Date.now()}.md`);
    const args = ['issue', 'create', '--title', issue.title, '--body-file', bodyFile];
    const { approval, done } = this.approvals.request(
      {
        projectId,
        source: 'issues',
        kind: 'push',
        tool: 'gh issue create',
        title: `Create GitHub issue: ${issue.title}`,
        files: [],
        command: `gh issue create --title ${JSON.stringify(issue.title)} --body-file <${issue.file}>`,
        detail: issue.body.slice(0, 4000) || '(no description)',
        cwd: dir,
      },
      `issues:${projectId}`,
      [],
    );
    void done.then(async (answer) => {
      if (answer.status !== 'allowed' && answer.status !== 'allowed_session') return;
      writeFileSync(bodyFile, issue.body || issue.title);
      const r = await run('gh', args, { cwd: dir, timeoutMs: 30_000 }).finally(() =>
        rmSync(bodyFile, { force: true }),
      );
      const url = r.ok ? r.stdout.trim().split('\n').pop() : null;
      const ok = !!url && /^https:\/\//.test(url);
      if (ok) {
        try {
          const now = this.find(projectId, number);
          this.save(now.dir, { ...now.issue, github: url });
        } catch {
          // The file was removed meanwhile; the GitHub issue still exists.
        }
        this.gh.delete(dir);
      }
      notify(this.hub, {
        projectId,
        kind: ok ? 'issue.sent' : 'issue.failed',
        title: ok ? `Issue sent to GitHub` : `Could not send the issue to GitHub`,
        body: ok ? url! : (r.stderr.trim().split('\n')[0] ?? 'gh issue create failed.'),
        link: projectLink(projectId, '/issues'),
      });
    });
    return { approvalId: approval.id };
  }
}
