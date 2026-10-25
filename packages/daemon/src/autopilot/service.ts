import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import {
  STAGE_LABEL,
  type AutopilotStage,
  type AutopilotState,
  type ChatItem,
} from '@cherry/shared';
import type { AdrService } from '../adr/service.ts';
import type { ChatService } from '../chat/service.ts';
import type { ApprovalBroker } from '../claude/approvals.ts';
import type { DecisionBroker } from '../claude/decisions.ts';
import { READ_TOOLS, type CustomTool, type Runner } from '../claude/runner.ts';
import type { ConfigStore } from '../config.ts';
import { notify, projectLink, type EventHub } from '../events.ts';
import { conflict } from '../http.ts';
import { projectDir } from '../projects/workspace.ts';
import { stageProfile } from '../stages/profiles.ts';

/** Orders per run at most; a long job is split by the user, not by a runaway loop. */
export const MAX_ORDERS = 60;
const DOC_LIMIT: Record<string, number> = {
  'docs/roadmap.md': 5000,
  'docs/prd.md': 3000,
  'docs/trd.md': 1500,
  'docs/test-plan.md': 1500,
  'design/handoff/README.md': 1500,
  'CLAUDE.md': 1500,
};

const off = (stage: AutopilotStage, suggestions: string[] = []): AutopilotState => ({
  stage,
  status: 'off',
  goal: null,
  suggestions,
  startedAt: null,
  finishedAt: null,
  orders: 0,
  answers: 0,
  total: null,
  tasks: [],
  events: [],
  decisions: [],
  needsYou: [],
  report: null,
  magnetBusy: false,
  error: null,
});

/** The next milestone with open tasks in docs/roadmap.md: "M1", and how many are left. */
export function nextMilestone(roadmap: string): { name: string; left: number } | null {
  const parts = roadmap.split(/^##\s+/m).slice(1);
  for (const part of parts) {
    const title = part.split('\n')[0]!.trim();
    const name = /^(M\d+|Milestone \d+|V\d+)/i.exec(title)?.[1] ?? title.split(/[—:-]/)[0]!.trim();
    const open = (part.match(/^\s*[-*] \[ \]/gm) ?? []).length;
    if (open > 0) return { name, left: open };
  }
  return null;
}

/** What Magnet offers when it asks (artboard 08). */
export function suggestionsFor(dir: string, stage: AutopilotStage): string[] {
  const roadmap = path.join(dir, 'docs', 'roadmap.md');
  const m = existsSync(roadmap) ? nextMilestone(readFileSync(roadmap, 'utf8')) : null;
  const finish = m ? [`Finish ${m.name} · ${m.left} task${m.left === 1 ? '' : 's'} left`] : [];
  if (stage === 'plan')
    return ['Write the missing plan documents', 'Check the plan for gaps and fix them', ...finish];
  if (stage === 'design')
    return ['Draw every screen the plan needs', 'Check the screens against the PRD'];
  return [...finish, 'Only the next task', 'Fix what the tests found'];
}

/** The documents Magnet decides from, cut to size (ADR-0046: PRD, TRD, roadmap, handoff, ADRs). */
export function docsContext(dir: string): string {
  const out: string[] = [];
  for (const [rel, max] of Object.entries(DOC_LIMIT)) {
    const file = path.join(dir, rel);
    if (!existsSync(file)) continue;
    const text = readFileSync(file, 'utf8');
    out.push(
      `### ${rel}\n${text.slice(0, max)}${text.length > max ? '\n…(cut; Read the file for the rest)' : ''}`,
    );
  }
  const adrDir = path.join(dir, 'docs', 'adr');
  if (existsSync(adrDir)) {
    const names = readdirSync(adrDir).filter((f) => /^\d{4}-.+\.md$/.test(f));
    if (names.length) out.push(`### docs/adr/\n${names.map((n) => `- ${n}`).join('\n')}`);
  }
  return out.join('\n\n') || '(no documents yet)';
}

/** Magnet's standing orders for a run (ADR-0046), in plain words. */
export function magnetSystemPrompt(stage: AutopilotStage, agent: string, goal: string): string {
  return [
    `You are Magnet, flying the ${STAGE_LABEL[stage]} stage in Cherry while the user is away (Autopilot, ADR-0046). You take the user's seat in the chat with the ${agent}. The user's job for you: "${goal}".`,
    'Rules:',
    `- Give the ${agent} one order at a time with the order tool: one task, what done means, which test or check to run. Write it as the user would.`,
    `- When the ${agent} asks a question, answer it from the documents with order kind "answer" and name the source, for example "PRD, Goals". A decision card is answered with choose.`,
    '- When the documents do not decide, pick the option you recommend, record it with decide (it becomes an ADR the user reviews), then go on.',
    '- After each task call task_result: done only when its tests or checks pass; failed otherwise. A task that fails twice ends the run.',
    '- Never order a push, publish, deploy or a serious command (rm -r, force push). Put it in needs_you.',
    '- When the job is done, or cannot go on, call land with the result as short lines and the next step.',
    '- At the start: call say once ("Yes, sir. M1 has 6 tasks left. I report when it is done."), plan_tasks with the number of tasks, then order.',
    '- Every time you are called: call your tools and stop. Write no other text. Use ASD-STE100: short sentences, facts first.',
  ].join('\n');
}

interface Run {
  projectId: string;
  stage: AutopilotStage;
  state: AutopilotState;
  magnetSession: string | null;
  /** The stage agent's turn Magnet waits for. */
  awaiting: string | null;
  conversationId: string | null;
  queue: string[];
  lastOrder: string | null;
  landed: boolean;
  /** An order Magnet gave in this step, sent when Magnet's run ends. */
  pending: { text: string; kind: 'order' | 'answer'; source?: string } | null;
  stopRequested: boolean;
  interrupt: (() => Promise<void>) | null;
}

const key = (projectId: string, stage: string) => `${projectId}:${stage}`;

/**
 * Autopilot (ADR-0046): Magnet flies a stage. It asks once, then gives the stage agent one order
 * at a time, answers its questions from the documents, records its own choices as ADRs, never
 * pushes, and reports in ASD-STE100 when it lands.
 */
export class AutopilotService {
  private runs = new Map<string, Run>();
  private stopListening: () => void;

  constructor(
    private readonly config: ConfigStore,
    private readonly hub: EventHub,
    private readonly chat: ChatService,
    private readonly approvals: ApprovalBroker,
    private readonly decisions: DecisionBroker,
    private readonly adrs: AdrService,
    private readonly runner: Runner,
  ) {
    // An event goes to several topics; act on it once, on its project topic.
    this.stopListening = hub.listen((topic, event) => {
      if (!topic.startsWith('project:')) return;
      if (event.type === 'chat.item')
        this.onChatItem(event.projectId, event.stage, event.conversationId, event.item);
      if (event.type === 'approval.requested') this.onApproval(event.approval);
    });
  }

  private dir(projectId: string) {
    return projectDir(this.config.projectsDir(), projectId);
  }

  get(projectId: string, stage: AutopilotStage): AutopilotState {
    const run = this.runs.get(key(projectId, stage));
    return run ? run.state : off(stage, suggestionsFor(this.dir(projectId), stage));
  }

  private publish(run: Run) {
    this.hub.publish(`project:${run.projectId}`, 'autopilot.updated', {
      projectId: run.projectId,
      state: run.state,
    });
  }

  private update(run: Run, change: Partial<AutopilotState>) {
    run.state = { ...run.state, ...change };
    this.publish(run);
  }

  private event(run: Run, e: Omit<AutopilotState['events'][number], 'at'>) {
    this.update(run, { events: [...run.state.events, { at: Date.now(), ...e }] });
  }

  /** "What should I do, sir?": nothing runs until the user answers. */
  ask(projectId: string, stage: AutopilotStage): AutopilotState {
    const now = this.runs.get(key(projectId, stage));
    if (now && (now.state.status === 'flying' || now.state.status === 'stopping'))
      throw conflict('Autopilot is already flying this stage.');
    const run: Run = {
      projectId,
      stage,
      state: { ...off(stage, suggestionsFor(this.dir(projectId), stage)), status: 'asking' },
      magnetSession: null,
      awaiting: null,
      conversationId: null,
      queue: [],
      lastOrder: null,
      landed: false,
      pending: null,
      stopRequested: false,
      interrupt: null,
    };
    this.runs.set(key(projectId, stage), run);
    this.publish(run);
    return run.state;
  }

  /** Asking: nothing ran, so it just closes. Landed: the report is put away. */
  dismiss(projectId: string, stage: AutopilotStage): AutopilotState {
    const run = this.runs.get(key(projectId, stage));
    if (run && (run.state.status === 'flying' || run.state.status === 'stopping'))
      throw conflict('Stop Autopilot first.');
    this.runs.delete(key(projectId, stage));
    const state = this.get(projectId, stage);
    this.hub.publish(`project:${projectId}`, 'autopilot.updated', { projectId, state });
    return state;
  }

  start(projectId: string, stage: AutopilotStage, goal: string): AutopilotState {
    const run =
      this.runs.get(key(projectId, stage)) ??
      (this.ask(projectId, stage), this.runs.get(key(projectId, stage))!);
    if (run.state.status !== 'asking') throw conflict('Autopilot is not waiting for a job.');
    if (this.chat.state(projectId, stage).running)
      throw conflict(`The ${stageProfile(stage).name} is still working. Wait for it, or stop it.`);
    this.update(run, {
      status: 'flying',
      goal,
      startedAt: Date.now(),
      suggestions: [],
    });
    const dir = this.dir(projectId);
    this.step(
      run,
      [
        `The job: "${goal}".`,
        `The ${STAGE_LABEL[stage]} chat so far ends with:\n${this.chatTail(projectId, stage)}`,
        `The documents:\n${docsContext(dir)}`,
        'Begin: say, plan_tasks, then the first order.',
      ].join('\n\n'),
    );
    return run.state;
  }

  /** Stops after the current step (Esc, or a click on the pill). */
  stop(projectId: string, stage: AutopilotStage): AutopilotState {
    const run = this.runs.get(key(projectId, stage));
    if (!run || (run.state.status !== 'flying' && run.state.status !== 'stopping'))
      return this.get(projectId, stage);
    run.stopRequested = true;
    this.update(run, { status: 'stopping' });
    if (!run.awaiting && !run.state.magnetBusy) this.finish(run, 'stopped');
    else if (run.state.magnetBusy) void run.interrupt?.();
    return run.state;
  }

  /** The user's review of a decision Magnet made: keep it or change it. */
  review(
    projectId: string,
    stage: AutopilotStage,
    adr: number,
    review: 'kept' | 'changed',
  ): AutopilotState {
    const run = this.runs.get(key(projectId, stage));
    if (!run) return this.get(projectId, stage);
    this.update(run, {
      decisions: run.state.decisions.map((d) => (d.adr === adr ? { ...d, review } : d)),
    });
    return run.state;
  }

  /** The end of the stage chat, for Magnet's first look. */
  private chatTail(projectId: string, stage: AutopilotStage): string {
    const items = this.chat.state(projectId, stage).items;
    return (
      items
        .flatMap((i) =>
          i.kind === 'user' ? [`User: ${i.text}`] : i.kind === 'text' ? [`Agent: ${i.text}`] : [],
        )
        .join('\n')
        .slice(-2000) || '(empty)'
    );
  }

  /** What the agent did in one turn, short, for Magnet's next decision. */
  private turnSummary(projectId: string, stage: AutopilotStage, turnId: string): string {
    const items = this.chat
      .state(projectId, stage)
      .items.filter((i) => 'turnId' in i && i.turnId === turnId);
    const text = items
      .filter((i) => i.kind === 'text')
      .map((i) => (i.kind === 'text' ? i.text : ''))
      .join('\n')
      .slice(-1500);
    const edits = items.flatMap((i) =>
      i.kind === 'tool' && i.verb === 'edit' && i.status === 'ok' ? [i.target] : [],
    );
    const runs = items.flatMap((i) =>
      i.kind === 'tool' && i.verb === 'run'
        ? [`${i.target} → ${i.status}${i.meta ? ` (${i.meta})` : ''}`]
        : [],
    );
    const end = items.find((i) => i.kind === 'turn-end');
    return [
      `Reply:\n${text || '(no text)'}`,
      `Files changed: ${edits.length ? [...new Set(edits)].join(', ') : 'none'}`,
      `Commands: ${runs.length ? runs.join('; ') : 'none'}`,
      end?.kind === 'turn-end' && !end.ok ? `The turn failed: ${end.error ?? 'error'}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private onChatItem(projectId: string, stage: string, conversationId: string, item: ChatItem) {
    const run = this.runs.get(key(projectId, stage));
    if (!run || (run.state.status !== 'flying' && run.state.status !== 'stopping')) return;
    if (run.conversationId && conversationId !== run.conversationId) return;
    if (item.kind === 'decision' && item.status === 'open') {
      const card = item.card;
      const options = card.options
        .map((o) => `- ${o.id}: ${o.title}${o.recommended ? ' (recommended)' : ''}. ${o.tradeoff}`)
        .join('\n');
      this.trigger(
        run,
        `The ${stageProfile(run.stage).name} asks (decision card ${card.id}): ${card.question}\n${card.context}\nOptions:\n${options}\nCall choose with the option the documents support and name the source. When they do not decide, call decide first, then choose.`,
      );
      return;
    }
    if (item.kind === 'turn-end' && item.turnId === run.awaiting) {
      run.awaiting = null;
      if (run.stopRequested) return this.finish(run, 'stopped');
      this.trigger(
        run,
        `The ${stageProfile(run.stage).name} finished the turn.\n${this.turnSummary(projectId, run.stage, item.turnId)}\n\nCall task_result if a task ended, then order the next step, or land.`,
      );
    }
  }

  /** Pushes, publishes and serious commands never run under Autopilot: they go to Needs you. */
  private onApproval(approval: {
    id: string;
    projectId: string;
    source: string;
    kind: string;
    command: string | null;
    title: string;
  }) {
    for (const run of this.runs.values()) {
      if (run.projectId !== approval.projectId || !run.conversationId) continue;
      if (approval.source !== `chat:${run.conversationId}`) continue;
      if (run.state.status !== 'flying' && run.state.status !== 'stopping') continue;
      const cmd = approval.command ?? '';
      const verb =
        approval.kind === 'push' || /\bgit push\b/.test(cmd)
          ? 'Push'
          : /\bpublish\b/.test(cmd)
            ? 'Publish'
            : 'Run';
      const what = approval.command ? `${verb}: ${approval.command}` : approval.title;
      try {
        this.approvals.answer(approval.id, {
          answer: 'deny',
          reason:
            'Autopilot does not push, publish or run serious commands. It is in Needs you for the user. Go on without it.',
        });
      } catch {
        // Already answered.
      }
      this.update(run, { needsYou: [...new Set([...run.state.needsYou, what])] });
      this.event(run, { kind: 'needs', text: `${what} is left for you.` });
    }
  }

  /** Runs Magnet now, or after its current step. */
  private trigger(run: Run, prompt: string) {
    if (run.state.magnetBusy) run.queue.push(prompt);
    else this.step(run, prompt);
  }

  private tools(run: Run): CustomTool[] {
    const agent = stageProfile(run.stage).name;
    const ok = (text: string) => ({ ok: true, text });
    // Each handler gets its input parsed, defaults filled, whatever runner called it.
    const parsed = (t: CustomTool): CustomTool => ({
      ...t,
      handler: async (a) => {
        const r = z.object(t.shape).safeParse(a ?? {});
        if (!r.success)
          return {
            ok: false,
            text: `Not valid, call ${t.name} again: ${r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
          };
        return t.handler(r.data);
      },
    });
    return (
      [
        {
          name: 'say',
          description: 'One line to the user in the chat, e.g. "Yes, sir. M1 has 6 tasks left."',
          shape: { text: z.string().min(1).max(300) },
          handler: async (a) => {
            this.event(run, { kind: 'status', text: (a as { text: string }).text });
            return ok('Shown.');
          },
        },
        {
          name: 'plan_tasks',
          description: 'How many tasks the job has, for "task 3 of 8".',
          shape: { total: z.number().int().min(1).max(100) },
          handler: async (a) => {
            this.update(run, { total: (a as { total: number }).total });
            return ok('Noted.');
          },
        },
        {
          name: 'order',
          description: `Your next message to the ${agent}: an order, or an answer to its question (kind "answer", with the source). Sent when you stop.`,
          shape: {
            text: z.string().min(1).max(4000),
            kind: z.enum(['order', 'answer']).default('order'),
            task: z.string().max(200).optional(),
            source: z.string().max(120).optional(),
          },
          handler: async (a) => {
            const { text, kind, task, source } = a as {
              text: string;
              kind: 'order' | 'answer';
              task?: string;
              source?: string;
            };
            run.pending = { text, kind, ...(source ? { source } : {}) };
            if (task && !run.state.tasks.some((t) => t.title === task && t.status === 'doing'))
              this.update(run, {
                tasks: [
                  ...run.state.tasks.filter((t) => t.title !== task),
                  {
                    title: task,
                    status: 'doing',
                    note: '',
                    tests: 'none',
                    failures: run.state.tasks.find((t) => t.title === task)?.failures ?? 0,
                  },
                ],
              });
            return ok('It goes when you stop. Stop now.');
          },
        },
        {
          name: 'task_result',
          description: 'A task ended: done only when its tests pass; failed otherwise.',
          shape: {
            title: z.string().min(1).max(200),
            status: z.enum(['done', 'failed']),
            tests: z.enum(['pass', 'fail', 'none']).default('none'),
            note: z.string().max(400).default(''),
          },
          handler: async (a) => {
            const r = a as {
              title: string;
              status: 'done' | 'failed';
              tests: 'pass' | 'fail' | 'none';
              note: string;
            };
            const before = run.state.tasks.find((t) => t.title === r.title);
            const failures = (before?.failures ?? 0) + (r.status === 'failed' ? 1 : 0);
            this.update(run, {
              tasks: [
                ...run.state.tasks.filter((t) => t.title !== r.title),
                { title: r.title, status: r.status, tests: r.tests, note: r.note, failures },
              ],
            });
            this.event(run, {
              kind: 'task',
              text: `${r.title}${r.note ? ` · ${r.note}` : ''}`,
              ok: r.status === 'done',
            });
            if (failures >= 2) {
              run.landed = true;
              this.finish(run, 'failed', `"${r.title}" failed twice. I stopped, as the rules say.`);
              return ok('The task failed twice. The run ends. Stop now.');
            }
            return ok('Recorded.');
          },
        },
        {
          name: 'decide',
          description:
            'Record a choice the documents do not make: it becomes an ADR, Accepted, for the user to review.',
          shape: {
            title: z.string().min(3).max(120),
            context: z.string().min(1).max(1500),
            options: z
              .array(z.object({ title: z.string().min(1).max(200), tradeoff: z.string().max(400) }))
              .max(4)
              .default([]),
            decision: z.string().min(1).max(1500),
            reason: z.string().min(1).max(300),
          },
          handler: async (a) => {
            const d = a as {
              title: string;
              context: string;
              options: { title: string; tradeoff: string }[];
              decision: string;
              reason: string;
            };
            const adr = this.adrs.record(
              run.projectId,
              {
                title: d.title,
                context: d.context,
                options: d.options,
                proposal: `${d.decision}\n\nReason: ${d.reason}`,
                consequences: [],
              },
              'Magnet (Autopilot)',
            );
            this.update(run, {
              decisions: [
                ...run.state.decisions,
                { adr: adr.number, title: d.title, reason: d.reason, review: 'open' },
              ],
            });
            this.event(run, { kind: 'decision', text: `${d.title}. ${d.reason}`, adr: adr.number });
            return ok(`Recorded as ADR-${String(adr.number).padStart(4, '0')}.`);
          },
        },
        {
          name: 'choose',
          description:
            "Answer the agent's open decision card with one option id, and name the source.",
          shape: {
            card: z.string().min(1).max(40),
            option: z.string().min(1).max(40),
            source: z.string().max(120).default(''),
          },
          handler: async (a) => {
            const { card, option } = a as { card: string; option: string; source: string };
            try {
              this.decisions.answer(card, { optionId: option });
              this.update(run, { answers: run.state.answers + 1 });
              return ok('Answered.');
            } catch (e) {
              return { ok: false, text: e instanceof Error ? e.message : 'Could not answer.' };
            }
          },
        },
        {
          name: 'needs_you',
          description:
            'Something only the user can do (push, publish, deploy, a login, a choice too big to take).',
          shape: { text: z.string().min(1).max(300) },
          handler: async (a) => {
            const { text } = a as { text: string };
            this.update(run, { needsYou: [...new Set([...run.state.needsYou, text])] });
            return ok('Added.');
          },
        },
        {
          name: 'land',
          description: 'End the run: the result as short ASD-STE100 lines, and the next step.',
          shape: {
            result: z.array(z.string().min(1).max(200)).min(1).max(8),
            next: z.string().min(1).max(200),
          },
          handler: async (a) => {
            const { result, next } = a as { result: string[]; next: string };
            run.landed = true;
            this.finish(run, 'done', null, { result, next });
            return ok('Landed. Stop now.');
          },
        },
      ] as CustomTool[]
    ).map(parsed);
  }

  /** One Magnet step: it reads the prompt and calls its tools. */
  private step(run: Run, prompt: string) {
    if (run.landed) return;
    const dir = this.dir(run.projectId);
    const agent = stageProfile(run.stage).name;
    this.update(run, { magnetBusy: true });
    run.pending = null;
    let error: string | null = null;
    const handle = this.runner({
      cwd: dir,
      prompt,
      resume: run.magnetSession,
      model: this.config.get().claude.defaultModel,
      planMode: false,
      appendSystemPrompt: magnetSystemPrompt(run.stage, agent, run.state.goal ?? ''),
      allowedTools: READ_TOOLS,
      disallowedTools: [
        'Edit',
        'Write',
        'MultiEdit',
        'NotebookEdit',
        'Bash',
        'WebFetch',
        'WebSearch',
      ],
      decisions: false,
      extraTools: this.tools(run),
      onPermission: async () => ({
        allow: false,
        message: 'Magnet reads and gives orders; it does not change files.',
      }),
      onDecision: async () => ({
        ok: false,
        error: 'Magnet decides with decide, not with a card.',
      }),
      onEvent: (ev) => {
        if (ev.t === 'session') run.magnetSession = ev.sessionId;
        if (ev.t === 'result') {
          if (!ev.ok && !ev.stopped) error = ev.error ?? 'Magnet stopped with an error.';
          queueMicrotask(() => this.afterStep(run, error));
        }
      },
    });
    run.interrupt = () => handle.interrupt();
  }

  private afterStep(run: Run, error: string | null) {
    run.interrupt = null;
    this.update(run, { magnetBusy: false });
    if (run.landed) return;
    if (run.stopRequested && !run.awaiting) return this.finish(run, 'stopped');
    if (error) return this.finish(run, 'failed', error);
    const next = run.queue.shift();
    if (run.pending) {
      const order = run.pending;
      run.pending = null;
      this.dispatch(run, order);
      if (next) this.step(run, next);
      return;
    }
    if (next) return this.step(run, next);
    // Waiting for the agent (a decision was answered mid-turn): nothing more to do now.
    if (run.awaiting) return;
    this.finish(run, 'failed', 'Magnet gave no order and did not land.');
  }

  private dispatch(run: Run, order: { text: string; kind: 'order' | 'answer'; source?: string }) {
    if (order.text.trim() === run.lastOrder?.trim())
      return this.finish(
        run,
        'failed',
        'Magnet gave the same order twice. I stopped so it does not loop.',
      );
    if (run.state.orders + run.state.answers >= MAX_ORDERS)
      return this.finish(run, 'stopped', `${MAX_ORDERS} orders is the limit for one run.`);
    run.lastOrder = order.text;
    try {
      const sent = this.chat.send(
        run.projectId,
        { text: order.text, stage: run.stage, mode: 'auto', attachments: [] },
        { role: order.kind, ...(order.source ? { source: order.source } : {}) },
      );
      run.conversationId = sent.conversationId;
      run.awaiting = sent.turnId;
      this.update(
        run,
        order.kind === 'answer'
          ? { answers: run.state.answers + 1 }
          : { orders: run.state.orders + 1 },
      );
      // The fake Claude can finish the turn before send returns: catch that turn's end.
      const end = this.chat
        .state(run.projectId, run.stage)
        .items.find((i) => i.kind === 'turn-end' && i.turnId === sent.turnId);
      if (end) this.onChatItem(run.projectId, run.stage, sent.conversationId, end);
    } catch (e) {
      this.finish(run, 'failed', e instanceof Error ? e.message : 'Could not send the order.');
    }
  }

  private finish(
    run: Run,
    status: 'done' | 'stopped' | 'failed',
    error: string | null = null,
    landing?: { result: string[]; next: string },
  ) {
    if (
      run.state.status === 'done' ||
      run.state.status === 'stopped' ||
      run.state.status === 'failed'
    )
      return;
    run.landed = true;
    run.awaiting = null;
    const done = run.state.tasks.filter((t) => t.status === 'done').length;
    const total = run.state.total ?? run.state.tasks.length;
    const result = landing?.result ?? [
      `${done} of ${total || done} tasks are complete.`,
      ...(error ? [error] : []),
      ...(run.state.needsYou.length
        ? [
            `${run.state.needsYou.length} item${run.state.needsYou.length === 1 ? ' needs' : 's need'} you. Read "Needs you".`,
          ]
        : []),
    ];
    const goal = run.state.goal ?? 'The job';
    const headline =
      status === 'done'
        ? `Welcome back, sir. ${goal.replace(/[.·].*$/, '').trim()} is complete.`
        : status === 'stopped'
          ? 'Welcome back, sir. I stopped, as you asked.'
          : 'Welcome back, sir. I had to stop.';
    const now = Date.now();
    this.update(run, {
      status,
      finishedAt: now,
      magnetBusy: false,
      error,
      report: {
        headline,
        result,
        next:
          landing?.next ??
          (status === 'failed'
            ? 'Read the error, then fly again or carry on in the chat.'
            : 'Read "Needs you", then fly the next job.'),
        durationMs: now - (run.state.startedAt ?? now),
        orders: run.state.orders,
        answers: run.state.answers,
      },
    });
    notify(this.hub, {
      projectId: run.projectId,
      kind: status === 'failed' ? 'autopilot.failed' : 'autopilot.done',
      title: `Autopilot ${status === 'done' ? 'finished' : status === 'stopped' ? 'stopped' : 'stopped early'}: ${STAGE_LABEL[run.stage]}`,
      body: result[0] ?? headline,
      link: projectLink(run.projectId, ''),
    });
  }

  async stopAll(): Promise<void> {
    this.stopListening();
    await Promise.all([...this.runs.values()].map((r) => r.interrupt?.()));
  }
}
