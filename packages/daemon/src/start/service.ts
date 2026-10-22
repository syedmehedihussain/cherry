import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { ProjectNameSchema, type StartProject, type StartProjectResult } from '@cherry/shared';
import type { ConfigStore } from '../config.ts';
import { run } from '../exec.ts';
import { writeFileAtomic } from '../fsutil.ts';
import { conflict } from '../http.ts';
import { expandHome, tildify } from '../paths.ts';
import type { ProjectService } from '../projects/service.ts';
import { buildProjectJson, buildTasks, findSecret, today } from '../projects/standard.ts';

/** The idea as one line for the summary fields (120 characters at most). */
export function summaryOf(idea: string): string {
  const line = idea.replace(/\s+/g, ' ').trim();
  return line.length > 120 ? `${line.slice(0, 117)}...` : line;
}

/** `_project/STATUS.md` for a project that has only an idea. */
export function startStatus(name: string, idea: string): string {
  const tasks = buildTasks('plan').tasks.filter((t) => t.phase === 'plan');
  return [
    '---',
    `name: ${name}`,
    'status: active',
    `summary: ${summaryOf(idea)}`,
    `updated: ${today()}`,
    '---',
    '',
    '## Where we left off',
    '',
    'Started in Cherry from the idea below. Nothing is planned yet; the project is in the Plan stage.',
    '',
    '## Idea',
    '',
    idea.trim(),
    '',
    '## Next steps',
    '',
    ...tasks.map((t) => `- [ ] ${t.title}`),
    '',
  ].join('\n');
}

/**
 * Start project (ADR-0036): makes the folder with `_project/` (STATUS.md with the idea,
 * project.json in the Plan phase, tasks.json), runs git init with `_project/` excluded, and adds
 * the folder to Cherry's list (ADR-0032). Planning happens in the Plan stage chat afterwards.
 */
export async function startProject(
  config: ConfigStore,
  projects: ProjectService,
  input: StartProject,
): Promise<StartProjectResult> {
  const parent = input.parentDir ? path.resolve(expandHome(input.parentDir)) : config.projectsDir();
  // The name passed ProjectNameSchema: no slashes, no leading dot, so this stays a direct child.
  const name = ProjectNameSchema.parse(input.name);
  const dir = path.join(parent, name);
  if (existsSync(dir) && readdirSync(dir).length > 0)
    throw conflict(`${tildify(dir)} already exists. Pick another name.`);
  const secret = findSecret(input.idea);
  if (secret) throw conflict(secret.replace('This file seems', 'The idea seems'));
  const made = !existsSync(dir);
  mkdirSync(path.join(dir, '_project'), { recursive: true });
  try {
    const project = buildProjectJson({
      name,
      summary: summaryOf(input.idea),
      phase: 'plan',
      stack: [],
      createdBy: 'manual',
      repo: null,
      docs: {},
    });
    const pdir = path.join(dir, '_project');
    writeFileAtomic(path.join(pdir, 'STATUS.md'), startStatus(name, input.idea));
    writeFileAtomic(path.join(pdir, 'project.json'), JSON.stringify(project, null, 2) + '\n');
    writeFileAtomic(
      path.join(pdir, 'tasks.json'),
      JSON.stringify(buildTasks('plan'), null, 2) + '\n',
    );
    await gitInit(dir);
    const { id } = projects.add(dir);
    await projects.rescan();
    return { id, path: dir };
  } catch (e) {
    // Leave nothing half made behind: the folder was empty or new.
    if (made) rmSync(dir, { recursive: true, force: true });
    else rmSync(path.join(dir, '_project'), { recursive: true, force: true });
    throw e;
  }
}

/** git init on main with `_project/` kept out of git. No commit: there is nothing to commit yet. */
export async function gitInit(dir: string): Promise<void> {
  if (!existsSync(path.join(dir, '.git'))) {
    const r = await run('git', ['init', '-q', '-b', 'main'], { cwd: dir, timeoutMs: 30_000 });
    if (!r.ok) throw new Error(`git init failed: ${(r.stderr || r.stdout).trim()}`);
  }
  const exclude = path.join(dir, '.git', 'info', 'exclude');
  mkdirSync(path.dirname(exclude), { recursive: true });
  const text = existsSync(exclude) ? readFileSync(exclude, 'utf8') : '';
  if (!text.split('\n').some((l) => /^\/?_project\/?\s*$/.test(l.trim())))
    appendFileSync(exclude, (text && !text.endsWith('\n') ? '\n' : '') + '_project/\n');
}
