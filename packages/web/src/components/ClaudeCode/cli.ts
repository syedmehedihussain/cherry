import { isSubagent, type ChatItem } from '@cherry/shared';

/** The Claude Code look (V3, ADR-0045): tool calls and results as the CLI prints them. */

export type ToolItem = Extract<ChatItem, { kind: 'tool' }>;

/** Cherry's own tools, in words. */
const CHERRY_TOOL: Record<string, string> = {
  mcp__cherry__propose_decision: 'Propose decision',
  mcp__cherry__decision_done: 'Decision done',
  mcp__cherry__commit_changes: 'Commit',
};

/** The CLI's name for a tool: `Update(src/app.ts)`, `Bash(pnpm test)`. */
export function cliCall(t: ToolItem): { name: string; arg: string } {
  const arg = t.target;
  if (isSubagent(t.tool)) return { name: 'Task', arg: `${t.sub?.type ?? 'agent'}: ${arg}` };
  if (CHERRY_TOOL[t.tool]) return { name: CHERRY_TOOL[t.tool]!, arg };
  switch (t.tool) {
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return { name: 'Update', arg };
    case 'Grep':
    case 'Glob':
      return { name: 'Search', arg };
    case 'WebFetch':
      return { name: 'Fetch', arg };
    case 'WebSearch':
      return { name: 'Web Search', arg };
    default: {
      // mcp__server__tool → server - tool, as the CLI shows MCP calls.
      const mcp = /^mcp__([^_]+(?:_[^_]+)*)__(.+)$/.exec(t.tool);
      if (mcp) return { name: `${mcp[1]} - ${mcp[2]!.replace(/_/g, ' ')}`, arg };
      return { name: t.tool, arg };
    }
  }
}

export interface CliResult {
  text: string;
  tone: 'dim' | 'bad' | 'warn';
  added?: number;
  removed?: number;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The `⎿` line under a tool call; null while it runs with nothing to say yet. */
export function cliResult(t: ToolItem): CliResult | null {
  if (t.status === 'waiting') return { text: 'Waiting for your answer', tone: 'warn' };
  if (t.status === 'denied') return { text: t.meta ? `Denied: ${t.meta}` : 'Denied', tone: 'bad' };
  if (t.status === 'failed') return { text: `Error: ${t.meta ?? 'failed'}`, tone: 'bad' };
  if (t.sub) {
    const steps = plural(t.sub.steps, 'step');
    const failed = t.sub.failed ? ` · ${t.sub.failed} failed` : '';
    const last = t.status === 'running' && t.sub.last ? ` · ${t.sub.last}` : '';
    return { text: `${steps}${failed}${last}`, tone: 'dim' };
  }
  if (t.status === 'running') return null;
  if (t.verb === 'edit') {
    const added = t.added ?? 0;
    const removed = t.removed ?? 0;
    if (t.tool === 'Write')
      return { text: `Wrote ${plural(added, 'line')} to ${t.target}`, tone: 'dim', added };
    return {
      text: `Updated ${t.target} with ${plural(added, 'addition')} and ${plural(removed, 'removal')}`,
      tone: 'dim',
      added,
      removed,
    };
  }
  if (t.verb === 'read') return { text: t.meta ? `Read ${t.meta}` : 'Read', tone: 'dim' };
  if (t.meta) return { text: t.meta, tone: 'dim' };
  if (t.durationMs !== null && t.verb === 'run')
    return { text: `${(t.durationMs / 1000).toFixed(1)}s`, tone: 'dim' };
  return null;
}

/** The turning star, as the CLI draws it; U+FE0E keeps ✳ a glyph, not an emoji. */
export const SPINNER_FRAMES = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢'].map(
  (f) => `${f}\uFE0E`,
);

/** The CLI's changing verbs; one per turn. */
export const SPINNER_VERBS = [
  'Simmering',
  'Pondering',
  'Brewing',
  'Noodling',
  'Percolating',
  'Mulling',
  'Tinkering',
  'Cogitating',
  'Whirring',
  'Conjuring',
  'Marinating',
  'Puzzling',
];

/** A stable verb for a turn, so it does not jump on every render. */
export function spinnerVerb(seed: string, tick = 0): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return SPINNER_VERBS[Math.abs(h + tick) % SPINNER_VERBS.length]!;
}

/** "8s", "1m 12s". */
export function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}
