import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { ReadinessItem, Stage } from '@cherry/shared';

/**
 * The files each stage works with (ADR-0034), shown at the top of the file panel. An entry
 * ending in `/` lists the documents directly inside that folder.
 */
const STAGE_FILES: Record<Stage, string[]> = {
  plan: ['docs/prd.md', 'docs/roadmap.md', 'docs/specs/', 'docs/adr/', '_project/STATUS.md'],
  design: [
    'docs/design-system.md',
    'docs/architecture.md',
    'docs/data-model.md',
    'docs/api.md',
    'docs/screens.md',
    'docs/design/',
    'design/',
  ],
  preparation: [
    'CLAUDE.md',
    'README.md',
    '.gitignore',
    '.env.example',
    'mise.toml',
    '.tool-versions',
    '.nvmrc',
    'package.json',
    'pyproject.toml',
    'requirements.txt',
    'Cargo.toml',
    'go.mod',
    '.github/workflows/',
  ],
  development: [],
  deployment: [
    'CHANGELOG.md',
    'docs/runbook.md',
    'Dockerfile',
    'docker-compose.yml',
    'fly.toml',
    'vercel.json',
    'netlify.toml',
    '.github/workflows/',
  ],
  issues: ['docs/issues/', '_project/STATUS.md'],
};

const DOC_EXT = /\.(md|mdx|html|ya?ml|json|txt|css)$/i;
const MAX_FILES = 40;

/** The stage's files that exist, project-relative. */
export function stageFiles(dir: string, stage: Stage): string[] {
  const out: string[] = [];
  for (const entry of STAGE_FILES[stage]) {
    const abs = path.join(dir, entry);
    if (entry.endsWith('/')) {
      if (!isDir(abs)) continue;
      for (const name of readdirSync(abs).sort()) {
        if (DOC_EXT.test(name) && isFile(path.join(abs, name))) out.push(entry + name);
      }
    } else if (isFile(abs)) {
      out.push(entry);
    }
    if (out.length >= MAX_FILES) break;
  }
  return out.slice(0, MAX_FILES);
}

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

const anyOf = (dir: string, files: string[]) => files.find((f) => existsSync(path.join(dir, f)));

function hasTests(dir: string): string | null {
  const pkg = path.join(dir, 'package.json');
  if (isFile(pkg)) {
    try {
      const scripts = (
        JSON.parse(readFileSync(pkg, 'utf8')) as { scripts?: Record<string, string> }
      ).scripts;
      if (scripts?.test && !/no test specified/.test(scripts.test))
        return 'package.json test script';
    } catch {
      // Broken package.json: fall through to the other checks.
    }
  }
  return (
    anyOf(dir, ['pytest.ini', 'vitest.config.ts', 'jest.config.js', 'tests', 'test', 'spec']) ??
    null
  );
}

/**
 * A quick readiness check for the Preparation stage, from files only (no Claude, no commands).
 * The Preparer's project-readiness skill does the full check.
 */
export function readiness(dir: string): ReadinessItem[] {
  const item = (id: string, label: string, found: string | null | undefined, hint: string) => ({
    id,
    label,
    ok: !!found,
    detail: found ? found : hint,
  });
  const workflows = path.join(dir, '.github', 'workflows');
  const ci = isDir(workflows) && readdirSync(workflows).some((f) => /\.ya?ml$/.test(f));
  return [
    item(
      'plan',
      'A plan for this round',
      anyOf(dir, ['docs/prd.md']) ??
        (isDir(path.join(dir, 'docs', 'specs')) ? 'docs/specs/' : null),
      'No docs/prd.md or docs/specs/: open Plan.',
    ),
    item('roadmap', 'A roadmap', anyOf(dir, ['docs/roadmap.md']), 'No docs/roadmap.md.'),
    item('git', 'Git repository', anyOf(dir, ['.git']), 'Not a git repository.'),
    item('gitignore', '.gitignore', anyOf(dir, ['.gitignore']), 'No .gitignore.'),
    item('guide', 'CLAUDE.md', anyOf(dir, ['CLAUDE.md']), 'No CLAUDE.md with how to run and test.'),
    item('readme', 'README', anyOf(dir, ['README.md', 'README']), 'No README.'),
    item(
      'runtime',
      'Runtime version pinned',
      anyOf(dir, [
        'mise.toml',
        '.tool-versions',
        '.nvmrc',
        '.python-version',
        'rust-toolchain.toml',
        'go.mod',
      ]),
      'No mise.toml, .tool-versions, .nvmrc or similar.',
    ),
    item('tests', 'Tests set up', hasTests(dir), 'No test script or test folder.'),
    item(
      'env',
      'Example environment file',
      anyOf(dir, ['.env.example', '.env.sample', '.env.template']),
      'No .env.example (fine if the code reads no settings).',
    ),
    item('ci', 'CI workflow', ci ? '.github/workflows/' : null, 'No GitHub Actions workflow.'),
  ];
}
