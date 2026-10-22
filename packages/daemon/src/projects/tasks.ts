import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { TasksFileSchema, type Phase, type TaskStatus, type TasksFile } from '@cherry/shared';
import { writeFileAtomic } from '../fsutil.ts';
import { buildCard } from './scanner.ts';

const tasksFile = (dir: string) => path.join(dir, '_project', 'tasks.json');

/** `_project/tasks.json`, or an empty list when the project has none. */
export function readTasks(dir: string): TasksFile {
  const file = tasksFile(dir);
  if (!existsSync(file)) return { schema: 1, tasks: [] };
  return TasksFileSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
}

export function writeTasks(dir: string, tasks: TasksFile): void {
  const file = tasksFile(dir);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileAtomic(file, JSON.stringify(tasks, null, 2) + '\n');
}

/** `t<n>` one above the highest numbered id. */
export function nextTaskId(tasks: TasksFile): string {
  const ids = new Set(tasks.tasks.map((t) => t.id));
  let n = Math.max(0, ...tasks.tasks.map((t) => Number(/^t(\d+)$/.exec(t.id)?.[1] ?? 0))) + 1;
  while (ids.has(`t${n}`)) n++;
  return `t${n}`;
}

/** The phase of the first task that is not finished: where the project is now. */
export function currentPhase(tasks: TasksFile): Phase | null {
  return tasks.tasks.find((t) => t.status === 'todo' || t.status === 'doing')?.phase ?? null;
}

/** Appends a to-do task in the current phase and returns the whole file. */
export async function addTask(dir: string, title: string): Promise<TasksFile> {
  const tasks = readTasks(dir);
  tasks.tasks.push({
    id: nextTaskId(tasks),
    phase: currentPhase(tasks) ?? (await buildCard(dir)).phase ?? 'development',
    title,
    status: 'todo',
    dependsOn: [],
  });
  writeTasks(dir, tasks);
  return tasks;
}

/** Sets the status of every task the test picks; true when something changed. */
export function setTasksStatus(
  dir: string,
  pick: (title: string) => boolean,
  status: TaskStatus,
): boolean {
  if (!existsSync(tasksFile(dir))) return false;
  const tasks = readTasks(dir);
  let changed = false;
  for (const t of tasks.tasks)
    if (pick(t.title) && t.status !== status) {
      t.status = status;
      changed = true;
    }
  if (changed) writeTasks(dir, tasks);
  return changed;
}
