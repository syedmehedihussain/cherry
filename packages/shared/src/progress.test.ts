import { describe, expect, it } from 'vitest';
import { stageProgress } from './progress.ts';

describe('stageProgress', () => {
  const tasks = {
    schema: 1 as const,
    tasks: [
      { id: 't1', phase: 'plan' as const, title: 'A', status: 'done' as const, dependsOn: [] },
      { id: 't2', phase: 'plan' as const, title: 'B', status: 'skipped' as const, dependsOn: [] },
      { id: 't3', phase: 'plan' as const, title: 'C', status: 'todo' as const, dependsOn: [] },
      { id: 't4', phase: 'design' as const, title: 'D', status: 'todo' as const, dependsOn: [] },
    ],
  };
  it('counts done and dropped items of the phase', () => {
    const p = stageProgress(tasks, 'plan');
    expect(p).toMatchObject({ done: 2, total: 3, percent: 66 });
    expect(p.open.map((t) => t.id)).toEqual(['t3']);
  });
  it('adds extra checks and copes with no items', () => {
    expect(stageProgress(tasks, 'design', [{ ok: true }]).percent).toBe(50);
    expect(stageProgress(undefined, 'deployment')).toMatchObject({ total: 0, percent: 0 });
  });
});
