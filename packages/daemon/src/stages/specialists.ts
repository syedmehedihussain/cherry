import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Stage } from '@cherry/shared';
import { frontMatter } from '../projects/status.ts';
import { STAGES_DIR, stageProfile } from './profiles.ts';

/** A stage's specialist: an ECC agent the room's staff member hands work to (ADR-0061). */
export interface Specialist {
  name: string;
  description: string;
  /** The agent's own prompt (the file's body). */
  prompt: string;
  /** Tools it may use; undefined inherits the room's. */
  tools?: string[];
  /** As ECC sets it (opus, sonnet, haiku); the user chose ECC's models (2026-11-09). */
  model?: string;
}

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const cache = new Map<Stage, Specialist[]>();

/**
 * `stages/<stage>/agents/*.md`: the specialists bundled for a stage. A docs-only stage's
 * specialists lose the edit tools; the stage guard and approvals apply to them as to the room.
 */
export function stageSpecialists(stage: Stage): Specialist[] {
  const hit = cache.get(stage);
  if (hit) return hit;
  const dir = path.join(STAGES_DIR, stage, 'agents');
  const docsOnly = stageProfile(stage).docsOnly;
  const list: Specialist[] = existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith('.md'))
        .sort()
        .flatMap((f) => {
          const { fields, body } = frontMatter(readFileSync(path.join(dir, f), 'utf8'));
          const name = fields.name || f.replace(/\.md$/, '');
          if (!fields.description || !body.trim()) return [];
          const tools = fields.tools
            ?.split(',')
            .map((t) => t.trim())
            .filter((t) => t && !(docsOnly && EDIT_TOOLS.has(t)));
          return [
            {
              name,
              description: fields.description,
              prompt: body.trim(),
              ...(tools?.length ? { tools } : {}),
              ...(fields.model ? { model: fields.model } : {}),
            },
          ];
        })
    : [];
  cache.set(stage, list);
  return list;
}
