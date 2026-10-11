import path from 'node:path';
import type { ChatItem } from '@cherry/shared';
import { describe, expect, it } from 'vitest';
import { explainTurn, turnChanges } from '../src/chat/explain.ts';
import { fakeRunner, type FakeLog } from '../src/claude/fake-runner.ts';
import { gitInit, tempDir, write } from './helpers.ts';

const tool = (
  id: string,
  verb: 'read' | 'edit' | 'run',
  target: string,
  status: 'ok' | 'failed' = 'ok',
): ChatItem => ({
  kind: 'tool',
  id,
  at: 0,
  turnId: 't1',
  tool: verb === 'run' ? 'Bash' : verb === 'edit' ? 'Edit' : 'Read',
  verb,
  target,
  status,
  meta: null,
  added: 1,
  removed: 0,
  durationMs: 1,
  approvalId: null,
});

const items: ChatItem[] = [
  tool('a', 'run', 'ls'),
  tool('b', 'read', 'src/a.ts'),
  tool('c', 'edit', 'src/a.ts'),
  tool('d', 'edit', 'src/a.ts'),
  tool('e', 'edit', 'src/b.ts', 'failed'),
  tool('f', 'run', 'pnpm test', 'failed'),
  { kind: 'text', id: 'g', at: 0, turnId: 't1', text: 'Done, but a test fails.' },
  { ...tool('h', 'edit', 'other.ts'), turnId: 't2' } as ChatItem,
];

describe('change summary', () => {
  it('collects files, later commands and the last reply from the items alone', () => {
    expect(turnChanges(items, 't1')).toEqual({
      files: ['src/a.ts'],
      commands: [{ command: 'pnpm test', status: 'failed' }],
      reply: 'Done, but a test fails.',
    });
  });

  it('Explain sends one capped Haiku request with no tools', async () => {
    const dir = tempDir();
    gitInit(dir);
    write(path.join(dir, 'src', 'a.ts'), 'export const a = 2;\n');
    const log: FakeLog = { requests: [], permissions: [], decisions: [] };
    const text = await explainTurn(fakeRunner([{ text: '- Changed a.' }], log), dir, items, 't1');
    expect(text).toBe('- Changed a.');
    expect(log.requests).toHaveLength(1);
    const req = log.requests[0]!;
    expect(req.model).toBe('haiku');
    expect(req.allowedTools).toEqual([]);
    expect(req.prompt).toContain('pnpm test (failed)');
    expect(req.prompt).toContain('export const a = 2;');
  });

  it('refuses a turn without file changes', async () => {
    await expect(explainTurn(fakeRunner([]), tempDir(), items, 'nope')).rejects.toThrow(
      /did not change any files/,
    );
  });
});
