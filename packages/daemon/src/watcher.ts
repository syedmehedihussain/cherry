import chokidar, { type FSWatcher } from 'chokidar';
import path from 'node:path';

const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.next',
  '.venv',
  '__pycache__',
  'target',
]);

/**
 * Watches the project folders in Cherry's list (ADR-0032), two levels deep, and calls `onChange`
 * with the ids that changed, debounced. `.git/HEAD` and `.git/index` are watched so commits and
 * checkouts show.
 */
export function watchFolders(
  folders: { id: string; dir: string }[],
  onChange: (projectIds: Set<string>) => void,
  debounceMs = 400,
): FSWatcher | null {
  if (!folders.length) return null;
  let pending = new Set<string>();
  let timer: NodeJS.Timeout | null = null;
  const owner = (p: string) => folders.find((f) => p === f.dir || p.startsWith(f.dir + path.sep));
  const watcher = chokidar.watch(
    folders.map((f) => f.dir),
    {
      ignoreInitial: true,
      depth: 2,
      ignored: (p: string) => {
        const f = owner(p);
        if (!f) return false;
        const parts = path.relative(f.dir, p).split(path.sep);
        if (parts.some((s) => IGNORED_DIRS.has(s))) return true;
        const gitAt = parts.indexOf('.git');
        if (gitAt >= 0) {
          const inside = parts.slice(gitAt + 1);
          return !(inside.length === 0 || inside[0] === 'HEAD' || inside[0] === 'index');
        }
        return false;
      },
    },
  );
  watcher.on('all', (_event, p) => {
    const f = owner(p);
    if (!f) return;
    pending.add(f.id);
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const ids = pending;
      pending = new Set();
      onChange(ids);
    }, debounceMs);
  });
  return watcher;
}
