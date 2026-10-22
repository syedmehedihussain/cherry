import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STAGE_LABEL, type Stage } from '@cherry/shared';
import { frontMatter } from '../projects/status.ts';

/** Bundled stage folders: `stages/<stage>/AGENT.md` and `stages/<stage>/skills/` (ADR-0034). */
export const STAGES_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'stages',
);

export interface StageProfile {
  stage: Stage;
  /** The agent's name, e.g. "Planner". */
  name: string;
  summary: string;
  /** The persona and way of working, appended to the chat system prompt. */
  persona: string;
  /** Plan, Design and Issues may only write docs and notes. */
  docsOnly: boolean;
}

const DOCS_ONLY: ReadonlySet<Stage> = new Set(['plan', 'design', 'issues']);

const cache = new Map<Stage, StageProfile>();

export function stageProfile(stage: Stage): StageProfile {
  const hit = cache.get(stage);
  if (hit) return hit;
  const { fields, body } = frontMatter(
    readFileSync(path.join(STAGES_DIR, stage, 'AGENT.md'), 'utf8'),
  );
  const profile: StageProfile = {
    stage,
    name: fields.name || STAGE_LABEL[stage],
    summary: fields.summary ?? '',
    persona: body.trim(),
    docsOnly: DOCS_ONLY.has(stage),
  };
  cache.set(stage, profile);
  return profile;
}

/** Folders and files a docs-only stage may write, relative to the project. */
export function isDocsPath(rel: string): boolean {
  const parts = rel.split(/[\\/]/);
  if (parts[0] === '..' || path.isAbsolute(rel)) return false;
  if (parts.length === 1) return /\.md$/i.test(rel);
  return ['docs', 'design', '_project'].includes(parts[0]!);
}

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

/**
 * The stage's edit rule, enforced before every tool call: a docs-only stage cannot change code.
 * Returns the refusal Claude sees, or null.
 */
export function stageGuard(
  stage: Stage,
  cwd: string,
): (tool: string, input: Record<string, unknown>) => string | null {
  const profile = stageProfile(stage);
  return (tool, input) => {
    if (!profile.docsOnly || !EDIT_TOOLS.has(tool)) return null;
    const target =
      typeof input.file_path === 'string'
        ? input.file_path
        : typeof input.notebook_path === 'string'
          ? input.notebook_path
          : '';
    const rel = path.relative(cwd, path.resolve(cwd, target));
    if (isDocsPath(rel)) return null;
    return `The ${profile.name} (${STAGE_LABEL[stage]} tab) only writes docs and notes: docs/, design/, _project/ and top-level .md files. ${rel} is code or config. Do not change it another way; tell the user this belongs in the Development tab.`;
  };
}
