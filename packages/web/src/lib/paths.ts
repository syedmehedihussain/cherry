let home: string | null = null;

/** The daemon's home folder, from GET /api/config, so `~` is right wherever home is. */
export function setHome(dir: string | undefined): void {
  if (dir) home = dir.replace(/\/$/, '');
}

/** Shows `/home/x/Projects` as `~/Projects` (the daemon sends absolute paths). */
export function tildify(p: string): string {
  if (home && (p === home || p.startsWith(`${home}/`))) return `~${p.slice(home.length)}`;
  const m = /^\/(?:home|Users)\/[^/]+(\/.*)?$/.exec(p);
  return m ? `~${m[1] ?? ''}` : p;
}

/** Shows an address without the scheme: "localhost:5173". */
export function shortUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}
