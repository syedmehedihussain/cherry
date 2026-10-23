import { existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { ProjectJsonSchema, STAGE_LABEL, type Phase, type TasksFile } from '@cherry/shared';
import type { CustomTool } from '../claude/runner.ts';
import { readJsonFile, writeFileAtomic } from '../fsutil.ts';
import { notFound } from '../http.ts';
import { nextTaskId, readTasks, writeTasks } from '../projects/tasks.ts';

export const CHECKLIST_TOOL = 'stage_checklist';

const MAX_ITEMS = 30;

/** The checklist as Claude reads it back: `t3 [done] Data model`. */
function listText(tasks: TasksFile, phase: Phase): string {
  const items = tasks.tasks.filter((t) => t.phase === phase);
  if (!items.length) return `The ${STAGE_LABEL[phase]} checklist is empty.`;
  const finished = items.filter((t) => t.status === 'done' || t.status === 'skipped').length;
  return [
    `${STAGE_LABEL[phase]} checklist, ${finished}/${items.length} finished:`,
    ...items.map((t) => `${t.id} [${t.status === 'skipped' ? 'dropped' : t.status}] ${t.title}`),
  ].join('\n');
}

/**
 * The stage checklist (V2.1 w5): the items in tasks.json for the open stage's phase. The stage
 * agent keeps it current while it works, so the Overview bar moves with the conversation. It is
 * Cherry's own file, so the tool runs without an approval.
 */
export function checklistTool(dir: string, phase: Phase): CustomTool {
  return {
    name: CHECKLIST_TOOL,
    description: `Read and update the ${STAGE_LABEL[phase]} checklist that the user sees as a progress bar on the Overview. Call it with nothing to read it. add: short items (3-8 words) still left to decide or write in this stage. done: ids of items the project files now cover. drop: ids of items that do not apply. Returns the checklist.`,
    shape: {
      add: z.array(z.string()).optional().describe('New items, e.g. "Data model for orders"'),
      done: z.array(z.string()).optional().describe('Item ids that are finished, e.g. ["t3"]'),
      drop: z.array(z.string()).optional().describe('Item ids that do not apply'),
    },
    handler: async (args) => {
      const parsed = z
        .object({
          add: z.array(z.string().trim().min(1).max(120)).max(10).optional(),
          done: z.array(z.string()).max(30).optional(),
          drop: z.array(z.string()).max(30).optional(),
        })
        .safeParse(args ?? {});
      if (!parsed.success)
        return { ok: false, text: `Fix the input: ${parsed.error.issues[0]?.message ?? ''}` };
      const { add = [], done = [], drop = [] } = parsed.data;
      const tasks = readTasks(dir);
      const mine = (id: string) => tasks.tasks.find((t) => t.id === id && t.phase === phase);
      const unknown = [...done, ...drop].filter((id) => !mine(id));
      for (const [ids, status] of [
        [done, 'done'],
        [drop, 'skipped'],
      ] as const)
        for (const id of ids) {
          const t = mine(id);
          if (t) t.status = status;
        }
      const have = new Set(
        tasks.tasks.filter((t) => t.phase === phase).map((t) => t.title.toLowerCase()),
      );
      for (const title of add) {
        if (have.has(title.toLowerCase())) continue;
        if (tasks.tasks.filter((t) => t.phase === phase).length >= MAX_ITEMS) break;
        tasks.tasks.push({ id: nextTaskId(tasks), phase, title, status: 'todo', dependsOn: [] });
        have.add(title.toLowerCase());
      }
      if (add.length || done.length || drop.length) writeTasks(dir, tasks);
      const warn = unknown.length
        ? `\nNot in this checklist (ignored): ${unknown.join(', ')}.`
        : '';
      return { ok: true, text: listText(tasks, phase) + warn };
    },
  };
}

/** Move to the next stage (V2.1 w5): sets project.json's phase. */
export function setPhase(dir: string, phase: Phase): void {
  const file = path.join(dir, '_project', 'project.json');
  if (!existsSync(file)) throw notFound('This project has no project.json.');
  const data = ProjectJsonSchema.passthrough().parse(readJsonFile(file));
  writeFileAtomic(file, JSON.stringify({ ...data, phase }, null, 2) + '\n');
}
