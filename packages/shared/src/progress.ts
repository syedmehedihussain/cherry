import type { Phase } from './schemas/common.ts';
import type { Task, TasksFile } from './schemas/workspace.ts';

export interface StageProgress {
  done: number;
  total: number;
  /** 0-100, rounded down; 0 when the stage has no items yet. */
  percent: number;
  /** Items still to do, in order. */
  open: Task[];
}

/**
 * How far a stage is (V2.1 w5): its phase's items in `_project/tasks.json`. Done and dropped
 * (skipped) items count as finished, so dropping what does not apply moves the bar too.
 * `extra` adds checks from elsewhere (Preparation's readiness).
 */
export function stageProgress(
  tasks: TasksFile | undefined,
  phase: Phase,
  extra: { ok: boolean }[] = [],
): StageProgress {
  const items = (tasks?.tasks ?? []).filter((t) => t.phase === phase);
  const finished = (t: Task) => t.status === 'done' || t.status === 'skipped';
  const done = items.filter(finished).length + extra.filter((e) => e.ok).length;
  const total = items.length + extra.length;
  return {
    done,
    total,
    percent: total ? Math.floor((done / total) * 100) : 0,
    open: items.filter((t) => !finished(t)),
  };
}
