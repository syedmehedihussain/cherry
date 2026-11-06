import type { HistoryCommit, OfficeStage } from '@cherry/shared';
import { git } from '../git.ts';

/**
 * The files each stage's commits touch, as git pathspecs (o11). Documents live in
 * docs/<stage>/ (ADR-0053); Development is the code, so everything outside docs/ and design/.
 */
const STAGE_PATHS: Record<OfficeStage, string[]> = {
  idea: ['docs/idea'],
  requirements: ['docs/requirements'],
  plan: ['docs/plan', 'docs/adr', 'docs/prd.md', 'docs/architecture.md', 'docs/roadmap.md'],
  design: ['docs/design', 'design'],
  development: [':(exclude)docs', ':(exclude)design', '.'],
  testing: ['docs/testing', 'docs/issues', 'e2e', 'tests', 'test'],
  deployment: ['docs/deployment', '.github', 'CHANGELOG.md', 'Dockerfile', 'eas.json'],
};

const SEP = '\x1f';
const START = '\x1e';

/** The newest commits, with their files and tags; only one stage's when `stage` is given. */
export async function history(
  dir: string,
  stage: OfficeStage | null,
  limit = 60,
): Promise<HistoryCommit[]> {
  const args = [
    'log',
    `-${limit}`,
    `--format=${START}%h${SEP}%s${SEP}%an${SEP}%ct${SEP}%D`,
    '--name-only',
    ...(stage ? ['--', ...STAGE_PATHS[stage]] : []),
  ];
  const res = await git(dir, args);
  if (!res.ok) return [];
  return res.stdout
    .split(START)
    .filter((b) => b.trim())
    .map((block) => {
      const [head, ...rest] = block.split('\n');
      const [hash = '', subject = '', author = '', ct = '0', refs = ''] = head!.split(SEP);
      return {
        hash,
        subject,
        author,
        at: Number(ct) * 1000,
        tags: refs
          .split(', ')
          .filter((r) => r.startsWith('tag: '))
          .map((r) => r.slice(5)),
        files: rest.map((l) => l.trim()).filter(Boolean),
      };
    });
}
