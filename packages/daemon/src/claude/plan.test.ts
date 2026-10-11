import { describe, expect, it } from 'vitest';
import { PlanTracker } from './plan.ts';

describe('PlanTracker', () => {
  it('follows TaskCreate and TaskUpdate one step at a time', () => {
    const t = new PlanTracker();
    expect(t.start('a', 'TaskCreate', { subject: 'Read the code', description: 'x' })).toBe(false);
    expect(t.end('a', true, 'Task #1 created successfully: Read the code')).toBe(true);
    t.start('b', 'TaskCreate', { subject: 'Fix the bug', activeForm: 'Fixing the bug' });
    t.end('b', true, 'Task #2 created successfully');
    t.start('c', 'TaskUpdate', { taskId: '1', status: 'completed' });
    t.start('d', 'TaskUpdate', { taskId: '2', status: 'in_progress' });
    expect(t.plan).toEqual([
      { id: '1', title: 'Read the code', activeForm: null, status: 'completed' },
      { id: '2', title: 'Fix the bug', activeForm: 'Fixing the bug', status: 'in_progress' },
    ]);
    expect(t.start('e', 'TaskUpdate', { taskId: '9', status: 'completed' })).toBe(false);
    t.start('f', 'TaskUpdate', { taskId: '1', status: 'deleted' });
    expect(t.plan.map((p) => p.id)).toEqual(['2']);
  });

  it('skips a failed create and numbers on when the result has no id', () => {
    const t = new PlanTracker();
    t.start('a', 'TaskCreate', { subject: 'One' });
    expect(t.end('a', false, 'error')).toBe(false);
    t.start('b', 'TaskCreate', { subject: 'Two' });
    t.end('b', true, 'created');
    expect(t.plan).toMatchObject([{ id: '1', title: 'Two' }]);
  });

  it('replaces the list on TodoWrite', () => {
    const t = new PlanTracker();
    t.start('a', 'TodoWrite', {
      todos: [
        { content: 'Plan', status: 'completed', activeForm: 'Planning' },
        { content: 'Build', status: 'in_progress', activeForm: 'Building' },
      ],
    });
    expect(t.plan.map((p) => p.status)).toEqual(['completed', 'in_progress']);
  });
});
