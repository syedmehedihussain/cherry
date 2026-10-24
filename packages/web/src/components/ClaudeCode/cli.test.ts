import { describe, expect, it } from 'vitest';
import { cliCall, cliResult, elapsed, spinnerVerb, SPINNER_VERBS, type ToolItem } from './cli.ts';

const tool = (over: Partial<ToolItem>): ToolItem => ({
  kind: 'tool',
  id: 't1',
  at: 0,
  turnId: 'turn',
  tool: 'Read',
  verb: 'read',
  target: 'src/app.ts',
  status: 'ok',
  meta: null,
  added: null,
  removed: null,
  durationMs: null,
  approvalId: null,
  ...over,
});

describe('cliCall', () => {
  it('names tools as the CLI prints them', () => {
    expect(cliCall(tool({ tool: 'Edit', verb: 'edit' }))).toEqual({
      name: 'Update',
      arg: 'src/app.ts',
    });
    expect(cliCall(tool({ tool: 'Bash', verb: 'run', target: 'pnpm test' }))).toEqual({
      name: 'Bash',
      arg: 'pnpm test',
    });
    expect(cliCall(tool({ tool: 'Grep', target: 'streak' })).name).toBe('Search');
    expect(cliCall(tool({ tool: 'mcp__cherry__propose_decision' })).name).toBe('Propose decision');
    expect(cliCall(tool({ tool: 'mcp__github__create_issue' })).name).toBe('github - create issue');
  });
  it('shows a subagent as a Task with its type', () => {
    const t = tool({
      tool: 'Task',
      verb: 'other',
      target: 'Find the code',
      sub: { type: 'Explore', steps: 2, failed: 0, last: null },
    });
    expect(cliCall(t)).toEqual({ name: 'Task', arg: 'Explore: Find the code' });
  });
});

describe('cliResult', () => {
  it('says what an edit did', () => {
    expect(cliResult(tool({ tool: 'Edit', verb: 'edit', added: 8, removed: 1 }))?.text).toBe(
      'Updated src/app.ts with 8 additions and 1 removal',
    );
    expect(cliResult(tool({ tool: 'Write', verb: 'edit', added: 1 }))?.text).toBe(
      'Wrote 1 line to src/app.ts',
    );
  });
  it('reads, runs, failures and waits', () => {
    expect(cliResult(tool({ meta: '120 lines' }))?.text).toBe('Read 120 lines');
    expect(cliResult(tool({ verb: 'run', tool: 'Bash', meta: '✓ 3 passed' }))?.text).toBe(
      '✓ 3 passed',
    );
    expect(cliResult(tool({ status: 'failed', meta: 'ENOENT' }))).toEqual({
      text: 'Error: ENOENT',
      tone: 'bad',
    });
    expect(cliResult(tool({ status: 'waiting' }))?.tone).toBe('warn');
    expect(cliResult(tool({ status: 'running' }))).toBeNull();
  });
});

describe('spinner', () => {
  it('keeps one verb for a turn and moves on with the tick', () => {
    expect(spinnerVerb('turn-a')).toBe(spinnerVerb('turn-a'));
    expect(SPINNER_VERBS).toContain(spinnerVerb('turn-a', 3));
  });
  it('writes the time like the CLI', () => {
    expect(elapsed(8_400)).toBe('8s');
    expect(elapsed(72_000)).toBe('1m 12s');
  });
});
