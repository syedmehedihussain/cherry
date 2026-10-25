import { describe, expect, it } from 'vitest';
import type { AutopilotState } from '@cherry/shared';
import { flying, taskCount } from './Autopilot.tsx';

const state = (over: Partial<AutopilotState>): AutopilotState => ({
  stage: 'development',
  status: 'flying',
  goal: 'Finish M1',
  suggestions: [],
  startedAt: 0,
  finishedAt: null,
  orders: 0,
  answers: 0,
  total: 8,
  tasks: [],
  events: [],
  decisions: [],
  needsYou: [],
  report: null,
  magnetBusy: false,
  error: null,
  ...over,
});
const task = (title: string, status: 'doing' | 'done' | 'failed') => ({
  title,
  status,
  note: '',
  tests: 'none' as const,
  failures: 0,
});

describe('Autopilot pill', () => {
  it('counts the task Magnet is on: "3 of 8"', () => {
    expect(
      taskCount(state({ tasks: [task('a', 'done'), task('b', 'done'), task('c', 'doing')] })),
    ).toBe('3 of 8');
    expect(taskCount(state({ tasks: [] }))).toBe('1 of 8');
    expect(taskCount(state({ total: null }))).toBeNull();
  });
  it('is flying while it flies or lands', () => {
    expect(flying(state({ status: 'stopping' }))).toBe(true);
    expect(flying(state({ status: 'asking' }))).toBe(false);
    expect(flying(undefined)).toBe(false);
  });
});
