import path from 'node:path';
import {
  DecisionCardInputSchema,
  chromeTool,
  classifyChrome,
  type Approval,
  type ChatItem,
  type PlanItem,
  type ToolVerb,
} from '@cherry/shared';
import { resolveInside } from '../paths.ts';
import type { ApprovalBroker, ApprovalDraft } from './approvals.ts';
import { autoNeedsApproval, classifyCommand } from './commands.ts';
import type { DecisionBroker } from './decisions.ts';
import { editPreview } from './preview.ts';
import {
  DECISION_TOOL,
  type DecisionReply,
  type ContextUse,
  type PermissionAnswer,
  type RunnerEvent,
} from './runner.ts';
import { PLAN_TOOLS, PlanTracker } from './plan.ts';
import type { Transcript } from './transcript.ts';

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
/** Cherry's own tools that show as timeline rows (the others have their own cards or views). */
const SHOWN_CHERRY_TOOLS = new Set([
  'mcp__cherry__propose_decision',
  'mcp__cherry__decision_done',
  'mcp__cherry__commit_changes',
]);
const READ_LIKE = new Set(['Read', 'Glob', 'Grep', 'LS', 'WebFetch', 'WebSearch']);

export function verbFor(tool: string): ToolVerb {
  if (EDIT_TOOLS.has(tool)) return 'edit';
  if (tool === 'Bash') return 'run';
  if (READ_LIKE.has(tool)) return 'read';
  return 'other';
}

export interface ConversationOptions {
  projectId: string;
  /** Folder Claude works in (project or agent worktree). */
  cwd: string;
  /** Who is asking, e.g. "chat:<id>" or "agent:<id>". Used for approvals and decisions. */
  source: string;
  transcript: Transcript;
  approvals: ApprovalBroker;
  decisions: DecisionBroker;
  /** Called for every new or changed item. */
  onItem(item: ChatItem): void;
  onDelta(itemId: string, turnId: string, text: string): void;
  /** Claude's plan changed (TaskCreate, TaskUpdate, TodoWrite). */
  onPlan?(plan: PlanItem[]): void;
  /**
   * Decide a tool call before asking the user. "ask" shows an approval card.
   * Default: edits and commands ask, everything else asks too.
   */
  policy?(tool: string, input: Record<string, unknown>): 'allow' | 'ask' | { deny: string };
  /** Auto mode (ADR-0025): only pushing, publishing and rm -r still ask. */
  auto?: boolean;
}

/**
 * Turns runner events into transcript items and handles approvals and decision cards for one
 * conversation (chat, agent, calibration).
 */
export class Conversation {
  readonly items = new Map<string, ChatItem>();
  readonly touched = new Set<string>();
  private readonly planTracker = new PlanTracker();
  private turnId = '';
  private dirtyText = new Set<string>();
  private auto: boolean;

  constructor(private readonly o: ConversationOptions) {
    this.auto = !!o.auto;
    for (const item of o.transcript.load()) {
      this.items.set(item.id, item);
      if (item.kind === 'tool' && item.verb === 'edit' && item.status === 'ok')
        this.touched.add(item.target);
    }
  }

  /**
   * After a daemon restart the last turn may have no end: rows still "running", approvals still
   * pending. Close it so the UI does not look stuck. Returns true if anything was closed.
   */
  closeInterrupted(reason: string): boolean {
    const all = [...this.items.values()];
    const lastUser = all.map((i) => i.kind).lastIndexOf('user');
    const tail = all.slice(lastUser + 1);
    if (lastUser < 0 || tail.some((i) => i.kind === 'turn-end')) return false;
    const turnId = tail.find((i) => 'turnId' in i)?.turnId ?? 'restart';
    this.turnId = turnId;
    for (const i of tail) {
      if (i.kind === 'tool' && (i.status === 'running' || i.status === 'waiting'))
        this.put({ ...i, status: 'failed', meta: 'Cherry restarted' });
      if (i.kind === 'approval' && i.approval.status === 'pending')
        this.put({
          ...i,
          approval: { ...i.approval, status: 'cancelled', reason: 'Cherry restarted' },
        });
    }
    this.put({
      kind: 'turn-end',
      id: `end_${turnId}_restart`,
      at: Date.now(),
      turnId,
      ok: false,
      stopped: false,
      error: reason,
      durationMs: 0,
    });
    return true;
  }

  get plan(): PlanItem[] {
    return this.planTracker.plan;
  }

  list(limit = 200): ChatItem[] {
    const all = [...this.items.values()];
    return all.slice(-limit);
  }

  startTurn(turnId: string): void {
    this.turnId = turnId;
  }

  /** The chat picks the mode per message. */
  setAuto(auto: boolean): void {
    this.auto = auto;
  }

  put(item: ChatItem, persist = true): void {
    this.items.set(item.id, item);
    if (persist) this.o.transcript.append(item);
    this.o.onItem(item);
  }

  addUser(id: string, text: string, attachments: string[] = []): void {
    this.put({
      kind: 'user',
      id,
      at: Date.now(),
      text,
      ...(attachments.length ? { attachments } : {}),
    });
  }

  /** Is this path (relative to cwd, or absolute) inside the project? Symlinks resolved. */
  private inside(p: string): boolean {
    if (!p) return false;
    try {
      resolveInside(this.o.cwd, path.isAbsolute(p) ? path.relative(this.o.cwd, p) : p);
      return true;
    } catch {
      return false;
    }
  }

  private rel(p: string): string {
    const abs = path.resolve(this.o.cwd, p);
    const r = path.relative(this.o.cwd, abs);
    return r.startsWith('..') ? abs : r.split(path.sep).join('/');
  }

  private targetOf(tool: string, input: Record<string, unknown>): string {
    const s = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '');
    const chrome = chromeTool(tool);
    if (chrome) return classifyChrome(chrome, input).action;
    if (s('file_path')) return this.rel(s('file_path'));
    if (s('notebook_path')) return this.rel(s('notebook_path'));
    if (tool === 'Bash') return s('command');
    if (s('pattern')) return s('pattern') + (s('path') ? ` in ${this.rel(s('path'))}` : '');
    if (s('path')) return this.rel(s('path'));
    if (s('url')) return s('url');
    if (s('query')) return s('query');
    if (s('description')) return s('description');
    if (tool === 'TodoWrite') return 'to-do list';
    if (tool === 'mcp__cherry__propose_decision') return s('title') || 'a decision';
    if (tool === 'mcp__cherry__commit_changes') return s('message').split('\n')[0] || 'a commit';
    if (tool === 'mcp__cherry__decision_done')
      return `ADR-${String(input.adr ?? '?').padStart(4, '0')}`;
    return tool;
  }

  private flushText(): void {
    for (const id of this.dirtyText) {
      const item = this.items.get(id);
      if (item) this.o.transcript.append(item);
    }
    this.dirtyText.clear();
  }

  handle(ev: RunnerEvent): void {
    const now = Date.now();
    switch (ev.t) {
      case 'text_start':
        this.put({ kind: 'text', id: ev.blockId, at: now, turnId: this.turnId, text: '' }, false);
        break;
      case 'text': {
        const item = this.items.get(ev.blockId);
        if (item?.kind !== 'text') break;
        item.text += ev.delta;
        this.dirtyText.add(item.id);
        this.o.onDelta(item.id, this.turnId, ev.delta);
        break;
      }
      case 'thinking_start':
        this.put(
          {
            kind: 'thinking',
            id: ev.blockId,
            at: now,
            turnId: this.turnId,
            text: '',
            durationMs: null,
          },
          false,
        );
        break;
      case 'thinking': {
        const item = this.items.get(ev.blockId);
        if (item?.kind !== 'thinking') break;
        item.text += ev.delta;
        this.o.onDelta(item.id, this.turnId, ev.delta);
        break;
      }
      case 'thinking_end': {
        const item = this.items.get(ev.blockId);
        if (item?.kind === 'thinking') this.put({ ...item, durationMs: now - item.at });
        break;
      }
      case 'tool_start': {
        this.flushText();
        if (
          ev.name === DECISION_TOOL ||
          (ev.name.startsWith('mcp__cherry__') && !SHOWN_CHERRY_TOOLS.has(ev.name))
        )
          break;
        // The plan shows in the Live view, not as a row per checklist tick.
        if (PLAN_TOOLS.has(ev.name)) {
          if (this.planTracker.start(ev.id, ev.name, ev.input)) this.o.onPlan?.(this.plan);
          break;
        }
        if (this.items.has(ev.id)) break;
        this.put({
          kind: 'tool',
          id: ev.id,
          at: now,
          turnId: this.turnId,
          tool: ev.name,
          verb: verbFor(ev.name),
          target: this.targetOf(ev.name, ev.input),
          status: 'running',
          meta: null,
          added: null,
          removed: null,
          durationMs: null,
          approvalId: null,
        });
        break;
      }
      case 'tool_end': {
        if (this.planTracker.end(ev.id, ev.ok, ev.output)) this.o.onPlan?.(this.plan);
        const item = this.items.get(ev.id);
        if (item?.kind !== 'tool') break;
        if (item.status === 'denied') break;
        const durationMs = now - item.at;
        const ok = ev.ok;
        let meta: string | null = null;
        if (!ok) meta = (ev.output.split('\n').find((l) => l.trim()) ?? 'failed').slice(0, 120);
        else if (chromeTool(item.tool))
          // What Chrome said back ("Navigated to …"), for the Live view (ADR-0038).
          meta = (ev.output.split('\n').find((l) => l.trim()) ?? '').slice(0, 120) || null;
        else if (item.tool === 'mcp__cherry__propose_decision')
          meta = /ADR-\d+/.exec(ev.output)?.[0] ?? null;
        else if (item.tool === 'mcp__cherry__commit_changes')
          meta = /^Committed (\w+)/.exec(ev.output)?.[1] ?? null;
        else if (item.tool === 'Read') {
          const n = ev.output.split('\n').filter((l) => /^\s*\d+[→\t]/.test(l)).length;
          meta = n ? `${n} lines` : null;
        } else if (item.verb === 'run') {
          const passed = /(\d+) passed/.exec(ev.output);
          meta = passed ? `✓ ${passed[1]} passed` : `${(durationMs / 1000).toFixed(1)}s`;
        }
        if (ok && item.verb === 'edit') this.touched.add(item.target);
        this.put({ ...item, status: ok ? 'ok' : 'failed', meta: meta ?? item.meta, durationMs });
        break;
      }
      case 'result': {
        this.flushText();
        for (const item of this.items.values())
          if (item.kind === 'thinking' && item.durationMs === null && item.turnId === this.turnId)
            this.put({ ...item, durationMs: now - item.at });
        const context = this.withWindow(ev.context);
        this.put({
          kind: 'turn-end',
          id: `end_${this.turnId}`,
          at: now,
          turnId: this.turnId,
          ok: ev.ok,
          stopped: ev.stopped,
          error: ev.error,
          durationMs: ev.durationMs,
          ...(context ? { context } : {}),
        });
        break;
      }
      case 'session':
        break;
    }
  }

  /** Fills a missing window (0) from the last turn that had one (V2.1 w7.3). */
  private withWindow(context: ContextUse | null | undefined): ContextUse | null {
    if (!context) return null;
    if (context.window > 0) return context;
    const last = [...this.items.values()].reverse().find((i) => i.kind === 'turn-end' && i.context);
    const window = last?.kind === 'turn-end' ? last.context?.window : undefined;
    return window ? { used: context.used, window } : null;
  }

  private setTool(toolUseId: string, patch: Partial<Extract<ChatItem, { kind: 'tool' }>>): void {
    const item = this.items.get(toolUseId);
    if (item?.kind === 'tool') this.put({ ...item, ...patch });
  }

  /** canUseTool: policy, guards, session rules, then an approval card. */
  async permission(
    tool: string,
    input: Record<string, unknown>,
    toolUseId: string,
  ): Promise<PermissionAnswer> {
    // Claude in Chrome only loads when the user turned it on; then it runs without asking,
    // like the CLI after "don't ask again" (ADR-0038).
    if (chromeTool(tool)) return { allow: true };
    const policy = this.o.policy?.(tool, input) ?? 'ask';
    if (policy === 'allow') return { allow: true };
    if (typeof policy === 'object') {
      this.setTool(toolUseId, { status: 'denied', meta: policy.deny });
      return { allow: false, message: policy.deny };
    }

    let draft: ApprovalDraft;
    let ruleKeys: string[];
    // Auto mode: what got past the deny rules below runs, except what autoNeedsApproval names.
    let autoOk = this.auto;
    const base = { projectId: this.o.projectId, source: this.o.source, tool, cwd: this.o.cwd };
    if (EDIT_TOOLS.has(tool)) {
      const target =
        typeof input.file_path === 'string'
          ? input.file_path
          : typeof input.notebook_path === 'string'
            ? input.notebook_path
            : '';
      if (!this.inside(target)) {
        const reason = `Cherry only allows edits inside the project. ${target} is outside it.`;
        this.setTool(toolUseId, { status: 'denied', meta: 'outside the project' });
        return { allow: false, message: reason };
      }
      const file = editPreview(this.o.cwd, tool, input);
      const files = file ? [file] : [];
      draft = {
        ...base,
        kind: 'edit',
        title: `Claude wants to edit ${files.length || 1} file${files.length > 1 ? 's' : ''}`,
        files,
        command: null,
        detail: null,
      };
      ruleKeys = files.map((f) => `edit:${f.path}`);
      if (file) this.setTool(toolUseId, { added: file.added, removed: file.removed });
    } else if (tool === 'Bash') {
      const command = typeof input.command === 'string' ? input.command : '';
      const verdict = classifyCommand(command, this.o.cwd);
      draft = {
        ...base,
        kind: 'command',
        title: verdict.serious
          ? 'Claude wants to run a serious command'
          : 'Claude wants to run a command',
        files: [],
        command,
        // A command card's detail is the warning the card shows above the buttons.
        detail: verdict.serious ? verdict.reason : null,
      };
      // No session rule ever covers a serious command: every run asks.
      ruleKeys = verdict.serious ? [] : [`run:${command}`];
      if (verdict.serious) autoOk = false;
      if (autoNeedsApproval(command)) autoOk = false;
    } else {
      draft = {
        ...base,
        kind: 'other',
        title: `Claude wants to use ${tool}`,
        files: [],
        command: null,
        detail: JSON.stringify(input, null, 2).slice(0, 4000),
      };
      ruleKeys = [`tool:${tool}`];
    }

    if (autoOk) return { allow: true };
    if (this.o.approvals.isAllowedBySession(this.o.source, ruleKeys)) return { allow: true };

    const { approval, done } = this.o.approvals.request(draft, this.o.source, ruleKeys);
    this.setTool(toolUseId, { status: 'waiting', approvalId: approval.id });
    this.putApproval(approval);
    const answered = await done;
    this.putApproval(answered);
    if (answered.status === 'allowed' || answered.status === 'allowed_session') {
      this.setTool(toolUseId, { status: 'running', at: Date.now() });
      return { allow: true };
    }
    const message =
      answered.status === 'cancelled'
        ? `The request was cancelled (${answered.reason ?? 'session stopped'}).`
        : answered.reason
          ? `The user denied this: ${answered.reason}`
          : 'The user denied this. Ask what they want instead.';
    this.setTool(toolUseId, {
      status: 'denied',
      meta: answered.status === 'cancelled' ? 'cancelled' : 'denied',
    });
    return { allow: false, message };
  }

  private putApproval(approval: Approval): void {
    this.put({
      kind: 'approval',
      id: approval.id,
      at: approval.createdAt,
      turnId: this.turnId,
      approval,
    });
  }

  /** ask_decision: validate, show the card, wait for the answer. */
  async decision(input: unknown): Promise<DecisionReply> {
    this.flushText();
    const parsed = DecisionCardInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: `The card is not valid, fix it and call ask_decision again: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
      };
    }
    const id = this.o.decisions.newId();
    const card = { ...parsed.data, id, label: `Decision · ${parsed.data.topic}` };
    const item: ChatItem = {
      kind: 'decision',
      id,
      at: Date.now(),
      turnId: this.turnId,
      card,
      status: 'open',
      answer: null,
    };
    this.put(item);
    const answer = await this.o.decisions.wait(card, this.o.source);
    if (!answer) {
      this.put({ ...item, status: 'cancelled' });
      return { ok: false, error: 'The user stopped the session before answering.' };
    }
    this.put({ ...item, status: 'confirmed', answer: answer.label });
    return { ok: true, text: answer.text };
  }
}
