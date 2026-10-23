import { existsSync } from 'node:fs';
import { z } from 'zod';
import type { ChatItem } from '@cherry/shared';
import type { CustomTool } from '../claude/runner.ts';
import { resolveInside } from '../paths.ts';
import { nextTaskId, readTasks, writeTasks } from '../projects/tasks.ts';

export const PROPOSE_PLAN_TOOL = 'propose_plan';

export type PlanItem = Extract<ChatItem, { kind: 'plan' }>;

const InputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  summary: z.string().trim().max(600).optional(),
  spec: z.string().trim().max(300).optional(),
  tasks: z.array(z.string().trim().min(1).max(160)).min(1).max(30),
});

/**
 * The Planner's hand-over (ADR-0041): when the spec and milestone are written, it proposes the
 * plan as a card with Approve plan. Approving makes the tasks and starts the Builder.
 */
export function proposePlanTool(dir: string, put: (item: PlanItem) => void): CustomTool {
  return {
    name: PROPOSE_PLAN_TOOL,
    description:
      'When the plan is written (the spec or PRD and the roadmap milestone), propose it to the user as a card with Approve plan. Approving creates the tasks in Development and starts building. Give the tasks in build order, each small enough for one sitting. Call it once per plan, then stop and wait.',
    shape: {
      title: z.string().describe('Short name of the plan, e.g. "Offline mode"'),
      summary: z.string().optional().describe('What it delivers, 1-3 sentences'),
      spec: z.string().optional().describe('The spec file, e.g. docs/specs/offline-mode.md'),
      tasks: z.array(z.string()).describe('The build tasks in order'),
    },
    handler: async (args) => {
      const parsed = InputSchema.safeParse(args);
      if (!parsed.success)
        return {
          ok: false,
          text: `Fix it and call ${PROPOSE_PLAN_TOOL} again: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
        };
      const p = parsed.data;
      let spec: string | null = null;
      if (p.spec) {
        const rel = p.spec.replace(/^\.\//, '');
        let abs: string;
        try {
          abs = resolveInside(dir, rel);
        } catch {
          return { ok: false, text: `${p.spec} is outside the project.` };
        }
        if (!existsSync(abs))
          return { ok: false, text: `${p.spec} does not exist. Write it first, then propose.` };
        spec = rel;
      }
      put({
        kind: 'plan',
        id: `plan_${Date.now().toString(36)}`,
        at: Date.now(),
        turnId: '',
        title: p.title,
        summary: p.summary ?? null,
        spec,
        tasks: p.tasks,
        status: 'open',
        taskIds: [],
      });
      return {
        ok: true,
        text: 'The plan is shown to the user with Approve plan and Keep planning. Stop here: do not start building, and do not repeat the plan.',
      };
    },
  };
}

/**
 * Approve plan: the tasks join Development (additions only), and the Plan items still open are
 * marked done, since the user signed off the plan. Returns the new task ids.
 */
export function applyPlan(dir: string, plan: PlanItem): string[] {
  const tasks = readTasks(dir);
  for (const t of tasks.tasks)
    if (t.phase === 'plan' && (t.status === 'todo' || t.status === 'doing')) t.status = 'done';
  const ids: string[] = [];
  let prev: string | null = null;
  for (const title of plan.tasks) {
    const id = nextTaskId(tasks);
    tasks.tasks.push({
      id,
      phase: 'development',
      title,
      status: 'todo',
      dependsOn: prev ? [prev] : [],
    });
    ids.push(id);
    prev = id;
  }
  writeTasks(dir, tasks);
  return ids;
}

/** The first message to the Builder after Approve plan. */
export function buildPrompt(plan: PlanItem): string {
  const where = plan.spec ? ` in ${plan.spec}` : '';
  const ids = plan.taskIds;
  const work =
    ids.length > 1
      ? `Work through the Development checklist items ${ids[0]} to ${ids.at(-1)} in order: build each one, test it, and mark it done with stage_checklist before the next.`
      : `Build Development checklist item ${ids[0] ?? ''}, test it, and mark it done with stage_checklist.`;
  return `Build the approved plan "${plan.title}"${where}. ${work} Ask me only for real choices.`;
}
