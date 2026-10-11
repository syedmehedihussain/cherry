import type { PlanItem } from '@cherry/shared';

/** Claude Code's checklist tools: the newer Task* tools and the older TodoWrite. */
export const PLAN_TOOLS = new Set(['TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet', 'TodoWrite']);

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const status = (v: unknown): PlanItem['status'] | null =>
  v === 'pending' || v === 'in_progress' || v === 'completed' ? v : null;

/**
 * Follows Claude's plan from its tool calls. TaskCreate gets its id from the tool result
 * ("Task #3 created…"), so a create is held until its result arrives.
 */
export class PlanTracker {
  private items: PlanItem[] = [];
  private creating = new Map<string, { title: string; activeForm: string | null }>();
  private nextId = 1;

  get plan(): PlanItem[] {
    return this.items;
  }

  /** Returns true when the plan changed. */
  start(toolUseId: string, tool: string, input: Record<string, unknown>): boolean {
    if (tool === 'TodoWrite' && Array.isArray(input.todos)) {
      this.items = input.todos.flatMap((t: Record<string, unknown>, i: number) => {
        const title = str(t.content);
        return title
          ? [
              {
                id: String(i + 1),
                title,
                activeForm: str(t.activeForm),
                status: status(t.status) ?? 'pending',
              },
            ]
          : [];
      });
      return true;
    }
    if (tool === 'TaskCreate') {
      const title = str(input.subject);
      if (title) this.creating.set(toolUseId, { title, activeForm: str(input.activeForm) });
      return false;
    }
    if (tool === 'TaskUpdate') {
      const id = str(input.taskId);
      const at = this.items.findIndex((t) => t.id === id);
      if (at === -1) return false;
      if (input.status === 'deleted') {
        this.items = this.items.filter((_, i) => i !== at);
        return true;
      }
      const cur = this.items[at]!;
      this.items = this.items.map((t, i) =>
        i === at
          ? {
              ...cur,
              title: str(input.subject) ?? cur.title,
              activeForm: str(input.activeForm) ?? cur.activeForm,
              status: status(input.status) ?? cur.status,
            }
          : t,
      );
      return true;
    }
    return false;
  }

  /** Returns true when the plan changed. */
  end(toolUseId: string, ok: boolean, output: string): boolean {
    const draft = this.creating.get(toolUseId);
    if (!draft) return false;
    this.creating.delete(toolUseId);
    if (!ok) return false;
    const id = /#(\d+)/.exec(output)?.[1] ?? /\b(\d+)\b/.exec(output)?.[1] ?? String(this.nextId);
    this.nextId = Math.max(this.nextId, Number(id) + 1);
    this.items = [...this.items, { id, ...draft, status: 'pending' }];
    return true;
  }
}
