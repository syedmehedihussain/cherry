import { existsSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { badRequest } from '../http.ts';
import { isInside } from '../paths.ts';

/**
 * The projects in Cherry (ADR-0032): folders the user opened or created, kept in config.json.
 * This map lets projectDir() find them by id. Keyed by the config's new-projects folder (what
 * every caller already passes to projectDir) so test daemons stay apart.
 */
const registry = new Map<string, Map<string, string>>();

const real = (p: string): string => {
  try {
    return realpathSync(p);
  } catch {
    return path.resolve(p);
  }
};

export function registerProjects(projectsDir: string, list: { id: string; dir: string }[]): void {
  registry.set(real(projectsDir), new Map(list.map((f) => [f.id, f.dir])));
}

/** The folder a project id points at, or null. */
export function registeredDir(projectsDir: string, id: string): string | null {
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
 * Checks a folder before Cherry adds it. Claude may read and edit anything inside a project,
 * so `/`, the home folder and Cherry's own folder (or anything that holds it) are refused.
 * Returns the real path.
 */
export function checkOpenable(raw: string, where: { cherryHome: string; home?: string }): string {
  const dir = real(raw);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw badRequest(`${raw} is not a folder.`);
  const home = real(where.home ?? homedir());
  const cherry = real(where.cherryHome);
  if (dir === path.parse(dir).root) throw badRequest('Cherry does not open the whole disk.');
  if (dir === home)
    throw badRequest('Cherry does not open your whole home folder. Pick a project folder.');
  if (isInside(cherry, dir) || isInside(dir, cherry))
    throw badRequest("That folder holds Cherry's own data.");
  return dir;
}
