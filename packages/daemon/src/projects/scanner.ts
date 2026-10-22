import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  ProjectJsonSchema,
  type ProjectCard,
  type ProjectJson,
  type StatusDoc,
} from '@cherry/shared';
import { readJsonFile, readTextOrNull } from '../fsutil.ts';
import { gitStatus, lastCommitTime } from '../git.ts';
import { firstOpenStep, parseStatusMd } from './status.ts';

export interface ProjectFiles {
  projectJson: ProjectJson | null;
  projectJsonError: boolean;
  status: StatusDoc | null;
}

export function readProjectFiles(dir: string): ProjectFiles {
  const pdir = path.join(dir, '_project');
  let projectJson: ProjectJson | null = null;
  let projectJsonError = false;
  const pj = path.join(pdir, 'project.json');
  if (existsSync(pj)) {
    try {
      const parsed = ProjectJsonSchema.safeParse(readJsonFile(pj));
      if (parsed.success) projectJson = parsed.data;
      else projectJsonError = true;
    } catch {
      projectJsonError = true;
    }
  }
  const statusMd = readTextOrNull(path.join(pdir, 'STATUS.md'));
  return {
    projectJson,
    projectJsonError,
    status: statusMd === null ? null : parseStatusMd(statusMd),
  };
}

/** A survey that has not created the project yet: returns its idea, or null. */
function surveyDraftIdea(dir: string): string | null {
  const file = path.join(dir, '_project', 'survey.json');
  if (!existsSync(file)) return null;
  try {
    const data = readJsonFile(file) as {
      status?: unknown;
      answers?: { kind?: string; value?: { idea?: unknown } }[];
    } | null;
    if (data?.status !== 'in_progress' && data?.status !== 'review') return null;
    const idea = data.answers?.find((a) => a.kind === 'typed')?.value?.idea;
    return typeof idea === 'string' ? idea : '';
  } catch {
    return null;
  }
}

/** Latest `updated` time in cctop's `_project/sessions.json`, if any. */
function lastSessionTime(dir: string): number | null {
  const file = path.join(dir, '_project', 'sessions.json');
  if (!existsSync(file)) return null;
  try {
    const data = readJsonFile(file);
    if (!data || typeof data !== 'object') return null;
    let latest: number | null = null;
    for (const s of Object.values(data as Record<string, unknown>)) {
      const updated = (s as { updated?: unknown })?.updated;
      if (typeof updated !== 'string') continue;
      const t = Date.parse(updated);
      if (!Number.isNaN(t) && (latest === null || t > latest)) latest = t;
    }
    return latest;
  } catch {
    return null;
  }
}

export async function buildCard(dir: string, listedId?: string): Promise<ProjectCard> {
  const id = listedId ?? path.basename(dir);
  const files = readProjectFiles(dir);
  const { projectJson, status } = files;
  const state = projectJson ? 'ready' : status ? 'cctop' : 'uncalibrated';
  const draftIdea = state === 'uncalibrated' ? surveyDraftIdea(dir) : null;
  const git = await gitStatus(dir);
  const lastWorked =
    lastSessionTime(dir) ?? (git ? await lastCommitTime(dir) : null) ?? statSync(dir).mtimeMs;

  return {
    id,
    name: projectJson?.name ?? id,
    path: dir,
    state,
    phase: projectJson?.phase ?? (draftIdea !== null ? 'plan' : null),
    summary: projectJson?.summary || status?.summary || (draftIdea ?? '').slice(0, 120),
    stack: projectJson?.stack ?? [],
    nextStep: status ? firstOpenStep(status) : null,
    leftOff: status?.leftOff ?? null,
    git: git && {
      branch: git.branch,
      ahead: git.ahead,
      behind: git.behind,
      changes: git.changes,
      remote: git.remote,
    },
    lastWorked,
    projectJsonError: files.projectJsonError,
    draft: draftIdea !== null,
    missing: false,
  };
}

function missingCard(id: string, dir: string): ProjectCard {
  return {
    id,
    name: id,
    path: dir,
    state: 'uncalibrated',
    phase: null,
    summary: 'The folder is gone. It was moved or deleted.',
    stack: [],
    nextStep: null,
    leftOff: null,
    git: null,
    lastWorked: null,
    projectJsonError: false,
    draft: false,
    missing: true,
  };
}

/** A card for every project in Cherry's list (ADR-0032). Folders that are gone are left out. */
export async function scanProjects(
  projects: { id: string; dir: string }[],
): Promise<ProjectCard[]> {
  // A folder that is gone (or goes while the scan runs) still shows, so it can be removed.
  const cards = await Promise.all(
    projects.map((f) =>
      existsSync(f.dir)
        ? buildCard(f.dir, f.id).catch(() => missingCard(f.id, f.dir))
        : missingCard(f.id, f.dir),
    ),
  );
  return cards.sort((a, b) => (b.lastWorked ?? 0) - (a.lastWorked ?? 0));
}
