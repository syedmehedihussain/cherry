import type { GitSummary, ProjectState } from './schemas/project.ts';
import { OFFICE_STAGES, type OfficeFile, type OfficeStage } from './schemas/office.ts';

/** The local calendar day as YYYY-MM-DD. Not toISOString, which gives the UTC day. */
export function localDay(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** "just now", "25 min ago", "2 h ago", "Yesterday", "3 days ago", "2 weeks ago", "1 month ago". */
export function relativeTime(then: number, now: number = Date.now()): string {
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d} days ago`;
  const w = Math.round(d / 7);
  if (d < 30) return w === 1 ? '1 week ago' : `${w} weeks ago`;
  const mo = Math.round(d / 30);
  if (mo < 12) return mo === 1 ? '1 month ago' : `${mo} months ago`;
  const y = Math.round(d / 365);
  return y === 1 ? '1 year ago' : `${y} years ago`;
}

export const STATE_LABEL: Record<ProjectState, string> = {
  ready: 'Ready',
  cctop: 'cctop',
  uncalibrated: 'Not calibrated',
};

export type GitChipTone = 'clean' | 'ahead' | 'behind' | 'changes' | 'none';

/** The one git chip a card shows, most important first. */
export function gitChip(git: GitSummary | null): { label: string; tone: GitChipTone } {
  if (!git) return { label: 'No git', tone: 'none' };
  if (git.changes > 0)
    return { label: `${git.changes} change${git.changes === 1 ? '' : 's'}`, tone: 'changes' };
  if (git.behind > 0) return { label: `${git.behind} behind`, tone: 'behind' };
  if (git.ahead > 0) return { label: `${git.ahead} ahead`, tone: 'ahead' };
  if (!git.remote) return { label: 'No remote', tone: 'none' };
  return { label: 'clean', tone: 'clean' };
}

/** The short type label in the file tree: "TS", "MD", "ENV", "DOCK"; null for none. */
export function fileTag(name: string): string | null {
  const lower = (name.split('/').pop() ?? name).toLowerCase();
  if (lower === 'dockerfile') return 'DOCK';
  if (lower.startsWith('.env')) return 'ENV';
  if (lower === 'license') return 'TXT';
  const dot = lower.lastIndexOf('.');
  // A dotfile like .gitignore has no extension.
  if (dot <= 0) return null;
  const ext = lower.slice(dot + 1);
  const map: Record<string, string> = {
    tsx: 'TSX',
    jsx: 'JSX',
    mjs: 'JS',
    cjs: 'JS',
    yaml: 'YML',
    markdown: 'MD',
  };
  return map[ext] ?? ext.slice(0, 4).toUpperCase();
}

/**
 * Wall time of each stage (finding #17): from the sign-off before it (or the version's start)
 * to its own sign-off, or to now while it is open. Null for a stage not opened yet.
 */
export function stageWallTimes(
  office: OfficeFile,
  now: number,
): Partial<Record<OfficeStage, number>> {
  const cycle = office.cycles[office.cycles.length - 1]!;
  const out: Partial<Record<OfficeStage, number>> = {};
  let from = Date.parse(cycle.startedAt);
  for (const s of OFFICE_STAGES) {
    const rec = cycle.stages[s];
    if (rec.state === 'locked') break;
    if (rec.state === 'carried') continue;
    const signed = rec.signOffs.at(-1)?.at;
    const to = rec.state === 'signed' && signed ? Date.parse(signed) : now;
    out[s] = Math.max(0, to - from);
    if (rec.state !== 'signed' || !signed) break;
    from = Date.parse(signed);
  }
  return out;
}
