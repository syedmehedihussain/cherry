import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { DeployInfo } from '@cherry/shared';
import { git, gitStatus } from '../git.ts';

function readJson(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Where a project ships to, from its files (V3 r10). The Shipper's skill does the work. */
export function detectTarget(dir: string): DeployInfo['target'] {
  const wf = path.join(dir, '.github', 'workflows');
  if (existsSync(wf))
    for (const f of readdirSync(wf)
      .filter((n) => /\.ya?ml$/.test(n))
      .sort()) {
      const text = readFileSync(path.join(wf, f), 'utf8');
      if (/actions\/deploy-pages|github-pages|peaceiris\/actions-gh-pages/.test(text))
        return {
          kind: 'github-pages',
          label: 'GitHub Pages',
          source: `workflow .github/workflows/${f}`,
        };
    }
  if (existsSync(path.join(dir, 'vercel.json')) || existsSync(path.join(dir, '.vercel')))
    return { kind: 'vercel', label: 'Vercel', source: 'vercel.json' };
  if (existsSync(path.join(dir, 'netlify.toml')))
    return { kind: 'netlify', label: 'Netlify', source: 'netlify.toml' };
  const pkg = readJson(path.join(dir, 'package.json'));
  if (pkg && typeof pkg.name === 'string' && pkg.private !== true && pkg.version)
    return { kind: 'npm', label: `npm (${pkg.name})`, source: 'package.json is public' };
  return { kind: 'release', label: 'A tag and a GitHub release', source: 'no other target found' };
}

/** "git@github.com:me/runlog.git" or an https URL → "me/runlog". */
export function repoName(url: string): string | null {
  const m = /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(url.trim());
  return m ? `${m[1]}/${m[2]}` : null;
}

export async function deployInfo(dir: string): Promise<DeployInfo> {
  const pkg = readJson(path.join(dir, 'package.json'));
  const status = await gitStatus(dir);
  const remote = await git(dir, ['remote', 'get-url', 'origin']);
  const tag = await git(dir, ['describe', '--tags', '--abbrev=0']);
  let last: DeployInfo['last'] = null;
  if (tag.ok && tag.stdout.trim()) {
    const name = tag.stdout.trim();
    const when = await git(dir, ['log', '-1', '--format=%ct', name]);
    last = { tag: name, at: Number(when.stdout.trim()) * 1000 || 0 };
  }
  return {
    target: detectTarget(dir),
    repo: remote.ok ? repoName(remote.stdout) : null,
    version: typeof pkg?.version === 'string' ? pkg.version : null,
    last,
    branch: status?.branch ?? null,
    changes: status?.changes ?? 0,
  };
}
