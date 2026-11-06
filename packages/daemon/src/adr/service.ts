import path from 'node:path';
import { z } from 'zod';
import {
  AdrProposalSchema,
  type Adr,
  type AdrApplying,
  type AdrApplyMode,
  type AdrList,
  type AdrProposal,
} from '@cherry/shared';
import type { AgentManager } from '../agents/manager.ts';
import type { ChatService } from '../chat/service.ts';
import type { CustomTool } from '../claude/runner.ts';
import type { ConfigStore } from '../config.ts';
import type { Db } from '../db.ts';
import { notify, projectLink, type EventHub } from '../events.ts';
import { HttpError, badRequest, conflict, notFound } from '../http.ts';
import { resolveInside } from '../paths.ts';
import { readProjectFiles } from '../projects/scanner.ts';
import { addTask, readTasks, setTasksStatus, writeTasks } from '../projects/tasks.ts';
import { projectDir } from '../projects/workspace.ts';
import { adrDate, findAdr, listAdrs, updateAdr, writeProposal, type ParsedAdr } from './adr.ts';

export const PROPOSE_TOOL = 'propose_decision';
export const DONE_TOOL = 'decision_done';

/** Tells Claude when to propose instead of acting. Added to chat and agent prompts. */
export const DECISIONS_PROMPT =
  '- For a big project choice (stack, database, data format, architecture, renaming the project, removing a feature), call propose_decision instead of making the change. It is saved as a Proposed ADR and waits for the user in the Decisions tab. Do not make that change until it is approved; carry on with other work. For a small choice between options, use ask_decision.';

const nnnn = (n: number) => String(n).padStart(4, '0');

/** The task an "Approve only" adds (ADR-0029). The title links it to the decision. */
const taskTitle = (number: number, title: string) => `Apply ADR-${nnnn(number)}: ${title}`;
const isTaskFor = (number: number) => (title: string) =>
  title.startsWith(`Apply ADR-${nnnn(number)}:`);

/**
 * Project decisions (ADR-0026): Claude proposes a big change as an ADR, the user approves or
 * rejects it in the Decisions tab, and Cherry can hand an approved one to the chat or an agent.
 */
export class AdrService {
  private chat: ChatService | null = null;
  private agents: AgentManager | null = null;

  constructor(
    private readonly config: ConfigStore,
    private readonly db: Db,
    private readonly hub: EventHub,
  ) {}

  /** Chat and agents are made after this service, because they use its tools. */
  connect(parts: { chat: ChatService; agents: AgentManager }): void {
    this.chat = parts.chat;
    this.agents = parts.agents;
  }

  private where(projectId: string): { project: string; dir: string; rel: string } {
    const project = projectDir(this.config.projectsDir(), projectId);
    const rel = readProjectFiles(project).projectJson?.docs.adr ?? 'docs/adr';
    let dir: string;
    try {
      dir = resolveInside(project, rel);
    } catch {
      throw badRequest(`The ADR folder ${rel} is outside the project.`);
    }
    return { project, dir, rel: path.relative(project, dir).split(path.sep).join('/') };
  }

  private links(projectId: string): Map<number, AdrApplying> {
    const rows = this.db
      .prepare('SELECT adr_number, kind, ref, created_at FROM decision_links WHERE project_id = ?')
      .all(projectId) as {
      adr_number: number;
      kind: 'chat' | 'agent';
      ref: string;
      created_at: number;
    }[];
    return new Map(rows.map((r) => [r.adr_number, { kind: r.kind, ref: r.ref, at: r.created_at }]));
  }

  private view(rel: string, file: string, adr: ParsedAdr, applying: AdrApplying | null): Adr {
    return {
      ...adr,
      file: `${rel}/${file}`,
      applying: adr.state === 'approved' ? applying : null,
    };
  }

  list(projectId: string): AdrList {
    const { dir, rel } = this.where(projectId);
    const links = this.links(projectId);
    return {
      dir: rel,
      decisions: listAdrs(dir).map((a) =>
        this.view(rel, a.file, a.adr, links.get(a.adr.number) ?? null),
      ),
    };
  }

  get(projectId: string, number: number): Adr {
    const { dir, rel } = this.where(projectId);
    const found = findAdr(dir, number);
    if (!found) throw notFound(`No ADR ${nnnn(number)}.`);
    return this.view(rel, found.file, found.adr, this.links(projectId).get(number) ?? null);
  }

  private changed(projectId: string): void {
    this.hub.publish(`project:${projectId}`, 'decisions.updated', { projectId });
  }

  propose(projectId: string, input: AdrProposal, proposedBy: string): Adr {
    const { dir } = this.where(projectId);
    const { number } = writeProposal(dir, input, proposedBy);
    this.changed(projectId);
    notify(this.hub, {
      projectId,
      kind: 'decision.proposed',
      title: `Decision to approve: ${input.title}`,
      body: `${proposedBy} proposed ADR-${nnnn(number)}.`,
      link: projectLink(projectId, '/decisions'),
    });
    return this.get(projectId, number);
  }

  private edit(projectId: string, number: number, set: Record<string, string | null>): void {
    const { dir } = this.where(projectId);
    const found = findAdr(dir, number);
    if (!found) throw notFound(`No ADR ${nnnn(number)}.`);
    updateAdr(dir, found.file, set);
  }

  /** Accepts a pending decision, then optionally starts the change. */
  async approve(
    projectId: string,
    number: number,
    apply: AdrApplyMode,
  ): Promise<{ decision: Adr; warning: string | null }> {
    const adr = this.get(projectId, number);
    if (adr.state !== 'pending') throw conflict(`ADR ${nnnn(number)} is not pending.`);
    this.edit(projectId, number, { Status: 'Accepted', Done: 'not yet' });
    this.changed(projectId);
    if (apply === 'none') {
      // Approved for later: it waits in the task list until someone does it.
      const { project } = this.where(projectId);
      if (!readTasks(project).tasks.some((t) => isTaskFor(number)(t.title)))
        await addTask(project, taskTitle(number, adr.title));
      return { decision: this.get(projectId, number), warning: null };
    }
    return this.apply(projectId, number, apply);
  }

  /** Hands an approved decision to the project chat or a new background agent. */
  async apply(
    projectId: string,
    number: number,
    kind: 'chat' | 'agent',
  ): Promise<{ decision: Adr; warning: string | null }> {
    const adr = this.get(projectId, number);
    if (adr.state !== 'approved') throw conflict(`ADR ${nnnn(number)} is not approved yet.`);
    let ref: string;
    try {
      if (kind === 'chat') {
        if (!this.chat) throw new Error('The chat is not ready.');
        ref = this.chat.sendAs(projectId, applyPrompt(adr, 'chat')).turnId;
      } else {
        if (!this.agents) throw new Error('Agents are not ready.');
        ref = (await this.agents.start(projectId, { task: applyPrompt(adr, 'agent') })).id;
      }
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      return {
        decision: adr,
        warning: `Approved, but it was not ${kind === 'chat' ? 'sent to the chat' : 'given to an agent'}: ${why}`,
      };
    }
    this.db
      .prepare(
        'INSERT OR REPLACE INTO decision_links (project_id, adr_number, kind, ref, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(projectId, number, kind, ref, Date.now());
    this.changed(projectId);
    return { decision: this.get(projectId, number), warning: null };
  }

  reject(projectId: string, number: number, reason: string): Adr {
    const adr = this.get(projectId, number);
    if (adr.state !== 'pending' && adr.state !== 'approved')
      throw conflict(`ADR ${nnnn(number)} is already ${adr.state}.`);
    this.edit(projectId, number, {
      Status: 'Rejected',
      Done: null,
      'Rejected because': reason.trim() || 'No reason given.',
    });
    this.unlink(projectId, number);
    // An open "Apply ADR-…" task has nothing left to do.
    const { project } = this.where(projectId);
    const tasks = readTasks(project);
    const keep = tasks.tasks.filter((t) => t.status === 'done' || !isTaskFor(number)(t.title));
    if (keep.length !== tasks.tasks.length) writeTasks(project, { ...tasks, tasks: keep });
    this.changed(projectId);
    return this.get(projectId, number);
  }

  markDone(projectId: string, number: number): Adr {
    const adr = this.get(projectId, number);
    if (adr.state !== 'approved')
      throw conflict(
        adr.state === 'pending'
          ? `ADR ${nnnn(number)} is waiting for approval.`
          : `ADR ${nnnn(number)} is already ${adr.state}.`,
      );
    this.edit(projectId, number, { Done: adrDate() });
    this.unlink(projectId, number);
    setTasksStatus(this.where(projectId).project, isTaskFor(number), 'done');
    this.changed(projectId);
    return this.get(projectId, number);
  }

  /** The user ticked an "Apply ADR-…" task: the approved decision is done too. */
  taskDone(projectId: string, title: string): void {
    const m = /^Apply ADR-(\d+):/.exec(title);
    if (!m) return;
    try {
      if (this.get(projectId, Number(m[1])).state === 'approved')
        this.markDone(projectId, Number(m[1]));
    } catch {
      // No such ADR, or it changed by hand; the task is enough.
    }
  }

  /** The decision a background agent is applying, for its notification. */
  decisionFor(agentId: string): { number: number; title: string } | null {
    const row = this.db
      .prepare(`SELECT project_id, adr_number FROM decision_links WHERE kind = 'agent' AND ref = ?`)
      .get(agentId) as { project_id: string; adr_number: number } | undefined;
    if (!row) return null;
    try {
      const adr = this.get(row.project_id, row.adr_number);
      return { number: adr.number, title: adr.title };
    } catch {
      return null;
    }
  }

  /** The user accepted an agent's work: a decision it was making is now done. */
  agentAccepted(agentId: string): void {
    const row = this.db
      .prepare(`SELECT project_id, adr_number FROM decision_links WHERE kind = 'agent' AND ref = ?`)
      .get(agentId) as { project_id: string; adr_number: number } | undefined;
    if (!row) return;
    try {
      this.markDone(row.project_id, row.adr_number);
    } catch {
      // The ADR was changed by hand meanwhile; leave it as it is.
    }
  }

  private unlink(projectId: string, number: number): void {
    this.db
      .prepare('DELETE FROM decision_links WHERE project_id = ? AND adr_number = ?')
      .run(projectId, number);
  }

  /** propose_decision and decision_done for a chat or an agent working on this project. */
  tools(projectId: string, who: 'chat' | 'agent'): CustomTool[] {
    return [
      {
        name: PROPOSE_TOOL,
        description:
          'Propose a big project decision (stack, database, data format, architecture, renaming, removing a feature). It is saved as a Proposed ADR and waits for the user in the Decisions tab. Returns at once; do not make the change until it is approved.',
        shape: {
          title: z.string().describe('Short title in plain words, e.g. "Move storage to SQLite"'),
          context: z.string().describe('The problem and the constraints, 3-6 sentences'),
          options: z
            .array(z.object({ title: z.string(), tradeoff: z.string() }))
            .optional()
            .describe('The options you considered, each with its trade-off'),
          proposal: z.string().describe('What you propose and why, 2-5 sentences'),
          consequences: z.array(z.string()).optional().describe('Good, bad and follow-up points'),
        },
        handler: async (args) => {
          const parsed = AdrProposalSchema.safeParse(args);
          if (!parsed.success)
            return {
              ok: false,
              text: `Not saved, fix it and call ${PROPOSE_TOOL} again: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
            };
          try {
            const adr = this.propose(projectId, parsed.data, `Claude (${who})`);
            return {
              ok: true,
              text: `Recorded as ADR-${nnnn(adr.number)} (${adr.file}), pending the user's approval in the Decisions tab. Do not make this change until it is approved. Carry on with other work.`,
            };
          } catch (e) {
            return { ok: false, text: e instanceof Error ? e.message : String(e) };
          }
        },
      },
      {
        name: DONE_TOOL,
        description:
          'Mark an approved decision as done, after you made the change it describes. Only for decisions the user approved.',
        shape: { adr: z.number().int().describe('The ADR number, e.g. 26') },
        handler: async (args) => {
          if (who === 'agent')
            return {
              ok: false,
              text: 'Cherry marks the decision done when the user accepts your work. Say in your summary that the change is made.',
            };
          const n = Number((args as { adr?: unknown }).adr);
          try {
            const adr = this.markDone(projectId, n);
            return { ok: true, text: `ADR-${nnnn(adr.number)} is marked done.` };
          } catch (e) {
            return { ok: false, text: e instanceof HttpError ? e.message : String(e) };
          }
        },
      },
    ];
  }
}

function applyPrompt(adr: Adr, who: 'chat' | 'agent'): string {
  return [
    `Decision ADR-${nnnn(adr.number)} was approved: ${adr.title}.`,
    `The record is ${adr.file}. Read it, then make this change now.`,
    `Do not edit ${adr.file}; Cherry keeps its status.`,
    who === 'chat'
      ? `When the change is complete, call ${DONE_TOOL} with adr ${adr.number}.`
      : 'When the change is made, build the project and run its tests. End your report with what you changed, which checks you ran and their result, and the line "Ready to merge" only when they pass.',
  ].join('\n');
}
