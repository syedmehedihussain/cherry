import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import type { Stage, StageSkill } from '@cherry/shared';
import { frontMatter } from '../projects/status.ts';
import { STAGES_DIR } from './profiles.ts';

/** The user's own skills for a stage: `~/.cherry/skills/<stage>/<name>/SKILL.md`. */
export const userSkillsDir = (home: string, stage: Stage) => path.join(home, 'skills', stage);

interface Found extends StageSkill {
  dir: string;
}

function readSkills(root: string, source: StageSkill['source']): Found[] {
  if (!existsSync(root)) return [];
  const out: Found[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(root, entry.name);
    const file = path.join(dir, 'SKILL.md');
    if (!existsSync(file)) continue;
    const { fields } = frontMatter(readFileSync(file, 'utf8'));
    out.push({
      name: fields.name || entry.name,
      description: fields.description ?? '',
      source,
      dir,
    });
  }
  return out;
}

/** Bundled skills, then the user's; a user skill with the same name replaces the bundled one. */
function findSkills(home: string, stage: Stage): Found[] {
  const byName = new Map<string, Found>();
  for (const s of readSkills(path.join(STAGES_DIR, stage, 'skills'), 'bundled'))
    byName.set(s.name, s);
  for (const s of readSkills(userSkillsDir(home, stage), 'user')) byName.set(s.name, s);
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function stageSkills(home: string, stage: Stage): StageSkill[] {
  return findSkills(home, stage).map(({ name, description, source }) => ({
    name,
    description,
    source,
  }));
}

/**
 * Builds `~/.cherry/plugins/<stage>/`, a plugin that holds only skill folders (ADR-0034), and
 * returns its path, or null when the stage has no skills. Only `skills/` is written: no hooks,
 * commands, agents or MCP servers, so nothing in a skill can bypass Cherry's approvals.
 */
export function buildStagePlugin(home: string, stage: Stage): string | null {
  const skills = findSkills(home, stage);
  const root = path.join(home, 'plugins', stage);
  // Rebuilt only when a skill changed, so a turn in another project is not cut off mid-read.
  const signature = skills
    .map((s) => `${s.dir}:${statSync(path.join(s.dir, 'SKILL.md')).mtimeMs}`)
    .join('\n');
  const sigFile = path.join(root, '.cherry-signature');
  if (skills.length && existsSync(sigFile) && readFileSync(sigFile, 'utf8') === signature)
    return root;
  rmSync(root, { recursive: true, force: true });
  if (!skills.length) return null;
  mkdirSync(path.join(root, '.claude-plugin'), { recursive: true });
  writeFileSync(
    path.join(root, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ name: `cherry-${stage}`, description: `Cherry ${stage} stage skills` }) + '\n',
  );
  for (const s of skills) {
    const folder = s.name.replace(/[^\w.-]+/g, '-');
    cpSync(s.dir, path.join(root, 'skills', folder), {
      recursive: true,
      dereference: true,
    });
  }
  writeFileSync(sigFile, signature);
  return root;
}
