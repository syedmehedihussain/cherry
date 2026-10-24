import type { ChatItem, DocsList } from '@cherry/shared';

/**
 * The documents a plan is made of (V3 r3, docs/v3-redesign.md): the Planner writes them, the
 * Documents panel ticks each one when it exists. A path ending in `/` is a folder.
 */
export const PLAN_DOCS = [
  { id: 'prd', label: 'PRD', path: 'docs/prd.md' },
  { id: 'trd', label: 'Technical requirements', path: 'docs/trd.md' },
  { id: 'architecture', label: 'Architecture', path: 'docs/architecture.md' },
  { id: 'data-model', label: 'Data model', path: 'docs/data-model.md' },
  { id: 'api', label: 'API', path: 'docs/api.md' },
  { id: 'roadmap', label: 'Roadmap', path: 'docs/roadmap.md' },
  { id: 'test-plan', label: 'Test plan', path: 'docs/test-plan.md' },
  { id: 'adr', label: 'Decisions (ADRs)', path: 'docs/adr/' },
  { id: 'claude', label: 'CLAUDE.md', path: 'CLAUDE.md' },
] as const;

export type PlanDoc = (typeof PLAN_DOCS)[number];
export type DocState = 'written' | 'writing' | 'missing';

export interface PlanDocRow {
  id: string;
  label: string;
  /** The folder or file path shown on the right. */
  path: string;
  /** The file the reader opens: the doc itself, or the newest ADR. */
  open: string | null;
  state: DocState;
}

/** Files the agent is writing at this moment (a Write or Edit still running). */
export function writingNow(items: ChatItem[]): Set<string> {
  return new Set(
    items.flatMap((i) =>
      i.kind === 'tool' && i.verb === 'edit' && (i.status === 'running' || i.status === 'waiting')
        ? [i.target.replace(/^\.\//, '')]
        : [],
    ),
  );
}

/** The plan's documents with their state, then any other docs the Planner wrote (specs). */
export function planDocRows(
  docs: DocsList | undefined,
  writing: Set<string>,
): { rows: PlanDocRow[]; more: PlanDocRow[] } {
  const present = new Set([
    ...(docs?.engineering ?? []).map((d) => d.path),
    ...(docs?.project ?? []).map((d) => d.path),
  ]);
  const adrs = [...(docs?.decisions ?? [])].sort((a, b) => b.tag.localeCompare(a.tag));
  const rows: PlanDocRow[] = PLAN_DOCS.map((d) => {
    if (d.path.endsWith('/')) {
      const inFolder = [...writing].some((w) => w.startsWith(d.path));
      return {
        ...d,
        open: adrs[0]?.path ?? null,
        state: inFolder ? 'writing' : adrs.length ? 'written' : 'missing',
      };
    }
    return {
      ...d,
      open: present.has(d.path) ? d.path : null,
      state: writing.has(d.path) ? 'writing' : present.has(d.path) ? 'written' : 'missing',
    };
  });
  const known = new Set<string>(PLAN_DOCS.map((d) => d.path));
  const more: PlanDocRow[] = (docs?.engineering ?? [])
    .filter((d) => !known.has(d.path) && !d.path.startsWith('docs/issues/'))
    .map((d) => ({
      id: d.path,
      label: d.title,
      path: d.path,
      open: d.path,
      state: writing.has(d.path) ? 'writing' : 'written',
    }));
  return { rows, more };
}

/** "About docs/prd.md:" and the selection as a quote, for the composer. */
export function quoteFor(path: string, text: string): string {
  const quoted = text
    .trim()
    .split('\n')
    .map((l) => `> ${l}`)
    .join('\n');
  return `About ${path}:\n${quoted}\n\n`;
}
