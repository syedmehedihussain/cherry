import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PHASES, type Phase, type ProjectJson, type TasksFile } from '@cherry/shared';

/** The CLAUDE.md template from docs/project-standard.md, given to Claude as guidance. */
export const CLAUDE_MD_TEMPLATE = `# CLAUDE.md — {{name}}

{{one paragraph summary}}

## Read first
- \`_project/STATUS.md\` — where we are. Always read this first.
- \`docs/prd.md\` — what we are building (if it exists).
- Open other files in \`docs/\` only when the task needs them.

## Stack
{{stack lines}}

## Commands
{{install / dev / test / lint / build}}

## Rules
- Ask before editing files or running commands.
- Record every real choice as an ADR in \`docs/adr/\` (copy \`docs/adr/template.md\`).
{{project-specific rules}}`;

export const STATUS_MD_FORMAT = `---
name: {{name}}
status: active
summary: {{one line}}
updated: {{YYYY-MM-DD}}
---

## Where we left off

{{2-5 sentences}}

## Next steps

- [ ] {{next concrete step}}`;

export function today(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function buildProjectJson(opts: {
  name: string;
  summary: string;
  phase: Phase;
  stack: string[];
  createdBy: 'survey' | 'calibration' | 'manual';
  repo: string | null;
  docs: ProjectJson['docs'];
}): ProjectJson {
  return {
    schema: 1,
    name: opts.name,
    summary: opts.summary.slice(0, 120),
    phase: opts.phase,
    calibrated: today(),
    createdBy: opts.createdBy,
    repo: opts.repo,
    stack: opts.stack,
    docs: opts.docs,
    claude: { model: 'sonnet', sessionId: null },
  };
}

/** Each stage's starting checklist (V2.1 w5); the stage agent adds and ticks items as it works. */
const PRESET: Record<Phase, string[]> = {
  plan: [
    'Problem and who it is for',
    'Scope of v1 and what is out',
    'Requirements with acceptance criteria',
    'Stack decision as an ADR',
    'Risks and open questions',
    'First roadmap milestone',
  ],
  design: [
    'Main screens',
    'Architecture',
    'Data model',
    'API or interfaces',
    'Design tokens and style',
  ],
  preparation: ['Repository and CI', 'Project skeleton that runs', 'A first passing test'],
  development: [
    'Build the first feature end to end',
    'Cover the core logic with tests',
    'Keep STATUS.md current',
  ],
  deployment: [
    'Deploy target chosen and set up',
    'Monitoring and backups',
    'Runbook',
    'Release and changelog',
  ],
};

/** The phase task graph (data-model.md §4): earlier phases done, the current one open. */
export function buildTasks(phase: Phase): TasksFile {
  const current = PHASES.indexOf(phase);
  let n = 0;
  const tasks: TasksFile['tasks'] = [];
  let prev: string | null = null;
  PHASES.forEach((p, i) => {
    for (const title of PRESET[p]) {
      const id = `t${++n}`;
      tasks.push({
        id,
        phase: p,
        title,
        status: i < current ? 'done' : 'todo',
        dependsOn: prev ? [prev] : [],
      });
      prev = id;
    }
  });
  return { schema: 1, tasks };
}

const SECRET_PATTERNS: [RegExp, string][] = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'a private key'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'an AWS access key'],
  [/\bsk-ant-[A-Za-z0-9_-]{20,}/, 'an Anthropic API key'],
  [/\bsk-[A-Za-z0-9]{32,}/, 'an API key'],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/, 'a GitHub token'],
  [/\bxox[baprs]-[A-Za-z0-9-]{20,}/, 'a Slack token'],
];

/** Generated docs are checked for key-like strings before they are written (security.md). */
export function findSecret(text: string): string | null {
  for (const [re, what] of SECRET_PATTERNS)
    if (re.test(text)) return `This file seems to contain ${what}, so Cherry will not write it.`;
  return null;
}

/** Does .git/info/exclude already keep _project/ out of git? */
export function needsGitExclude(dir: string): boolean {
  const gitDir = path.join(dir, '.git');
  if (!existsSync(gitDir)) return false;
  const file = path.join(gitDir, 'info', 'exclude');
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  return !text.split('\n').some((l) => /^\/?_project\/?\s*$/.test(l.trim()));
}
