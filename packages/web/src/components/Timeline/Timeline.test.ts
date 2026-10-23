import { describe, expect, it } from 'vitest';
import { stepsSummary, type ToolItem } from './Timeline.tsx';

const step = (tool: string, verb: ToolItem['verb']): ToolItem => ({
  kind: 'tool',
  id: `${tool}-${Math.random()}`,
  at: 0,
  turnId: 't',
  tool,
  verb,
  target: 'x',
  status: 'ok',
  meta: null,
  added: null,
  removed: null,
  durationMs: null,
  approvalId: null,
});

describe('stepsSummary (V2.1 w6)', () => {
  it('says what a run of steps did, in words', () => {
    expect(
      stepsSummary([
        step('Read', 'read'),
        step('Grep', 'read'),
        step('Edit', 'edit'),
        step('Bash', 'run'),
        step('mcp__cherry__propose_decision', 'other'),
        step('WebFetch', 'other'),
      ]),
    ).toBe('Read 2 files · edited 1 file · ran 1 command · proposed 1 decision · used 1 tool');
    expect(stepsSummary([step('Bash', 'run'), step('Bash', 'run')])).toBe('Ran 2 commands');
  });
});
