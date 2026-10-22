import { existsSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { badRequest } from '../http.ts';
import { isInside } from '../paths.ts';

/**
 * Folders opened from outside the projects folder (ADR-0031). Kept in config.json; this map
 * lets projectDir() find them by id. Keyed by the projects folder so test daemons stay apart.
 */
const registry = new Map<string, Map<string, string>>();

const real = (p: string): string => {
  try {
    return realpathSync(p);
  } catch {
    return path.resolve(p);
  }
};

export function registerOpened(projectsDir: string, list: { id: string; dir: string }[]): void {
  registry.set(real(projectsDir), new Map(list.map((f) => [f.id, f.dir])));
}

/** The folder an opened id points at, or null. */
export function openedDir(projectsDir: string, id: string): string | null {
  return registry.get(real(projectsDir))?.get(id) ?? null;
}

/** A project id from a folder name: letters, digits, dot, dash and underscore. */
export function folderId(name: string, taken: Set<string>): string {
  const base =
    name
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/^[.-]+/, '')
      .slice(0, 60) || 'folder';
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

/**
 * Checks a folder before Cherry opens it. Claude may read and edit anything inside an opened
 * folder, so the home folder, `/`, Cherry's own folder and anything that holds the projects
 * folder are refused. Returns the real path.
 */
export function checkOpenable(
  raw: string,
  where: { projectsDir: string; cherryHome: string; home?: string },
): string {
  const dir = real(raw);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw badRequest(`${raw} is not a folder.`);
  const home = real(where.home ?? homedir());
  const cherry = real(where.cherryHome);
  if (dir === path.parse(dir).root) throw badRequest('Cherry does not open the whole disk.');
  if (dir === home)
    throw badRequest('Cherry does not open your whole home folder. Pick a project folder.');
  if (isInside(cherry, dir) || isInside(dir, cherry))
    throw badRequest("That folder holds Cherry's own data.");
  const projects = real(where.projectsDir);
  if (dir !== projects && isInside(dir, projects))
    throw badRequest('That folder holds your projects folder. Open a single project instead.');
  if (dir === projects)
    throw badRequest('That is your projects folder. Its folders are already on Home.');
  return dir;
}
