import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import path from 'node:path';
import {
  STAGES,
  STAGE_LABEL,
  type ChatMode,
  type ChatSend,
  type ChatState,
  type Stage,
} from '@cherry/shared';
import type { ConfigStore } from '../config.ts';
import type { Db } from '../db.ts';
import { AUTO_COMMIT_PROMPT, type CommitService } from '../projects/commits.ts';
import { notify, projectLink, type EventHub } from '../events.ts';
import { conflict } from '../http.ts';
import { DECISIONS_PROMPT, type AdrService } from '../adr/service.ts';
import type { ApprovalBroker } from '../claude/approvals.ts';
import { Conversation } from '../claude/conversation.ts';
import type { DecisionBroker } from '../claude/decisions.ts';
import { READ_TOOLS, type RunHandle, type Runner } from '../claude/runner.ts';
import { Transcript } from '../claude/transcript.ts';
import { projectDir } from '../projects/workspace.ts';
import { recordUsage } from '../usage.ts';
import { stageGuard, stageProfile } from '../stages/profiles.ts';
import { buildStagePlugin } from '../stages/skills.ts';
import { CHECKLIST_TOOL, checklistTool } from '../stages/checklist.ts';
import { explainTurn } from './explain.ts';
import { UPLOADS_DIR, saveUpload, uploadPath } from './uploads.ts';

/** Tells Claude where the attached files are; it opens them with Read (images too). */
export function withAttachments(text: string, attachments: string[]): string {
  if (!attachments.length) return text;
  return [
    text,
    '',
    `The user attached ${attachments.length === 1 ? 'a file' : `${attachments.length} files`}. Read ${attachments.length === 1 ? 'it' : 'them'} with the Read tool before you answer:`,
    ...attachments.map((a) => `- ${UPLOADS_DIR}/${a}`),
  ].join('\n');
}

/** Added when Settings → Claude Code → Claude in Chrome is on (ADR-0037). */
export const CHROME_PROMPT =
  "- You can use the user's Chrome through the mcp__claude-in-chrome__ tools: open the app you built on localhost, click through it, read the console and take screenshots to check your work. It is the user's real browser, signed in to their accounts: work in a new tab, do not read or touch their other tabs, never submit payments, passwords or messages, and say what you will do before you do it. The tools run without asking, so take care.";

/** The common rules, then the stage agent's persona (ADR-0034). */
export function chatSystemPrompt(stage: Stage, mode: ChatMode = 'ask'): string {
  const profile = stageProfile(stage);
  return [
    'You are working inside Cherry, a workspace that follows a strict engineering process: Plan, Design, Preparation, Development, Deployment and Issues, in a loop. Each stage has its own agent and its own chat; you are one of them, and the others hand work to you through the project files.',
    '- Read CLAUDE.md and _project/STATUS.md before anything else, when they exist.',
    '- When there is a real choice to make, call the ask_decision tool. Do not pick for the user.',
    DECISIONS_PROMPT,
    '- Keep answers short and plain. Name the file, then the change.',
    '- For work with more than one step, first record the steps with your task tool (TaskCreate), then do them one by one: mark a step in_progress when you start it and completed when it is done. The user follows this list live.',
    '- Keep .gitignore current: when you add something that makes build output, caches, dependencies, local env files or secrets, add it to .gitignore (create the file if it is missing).',
    "- Skills: follow a skill's steps, but where it differs from this project's conventions, the project wins: decisions go through propose_decision and the project's ADR template, issues are files in docs/issues/, specs go in docs/specs/, plans in docs/roadmap.md. When a skill wants the OS temp folder or a place outside the project, use _project/tmp/ instead (for the brainstorming visual companion pass --project-dir _project/tmp). When a skill hands off to a skill you do not have, stop there and say which Cherry tab continues the work.",
    ...(stage !== 'issues'
      ? [
          `- Your ${STAGE_LABEL[stage]} checklist (the ${CHECKLIST_TOOL} tool) is the progress bar the user sees on the Overview. Read it before you start. As you work, add what is still left to decide or write in this stage, mark items done once the project files cover them, and drop items that do not apply. Keep items short. Never mark an item done that the files do not show. When every item is finished, say the stage is ready and what the next stage is.`,
        ]
      : []),
    mode === 'auto'
      ? '- You are in auto mode: edits and most commands run without asking. Pushing, publishing and deleting folders still ask. If the user denies one, ask what they want instead.'
      : '- Every edit and command is shown to the user for approval. If they deny one, ask what they want instead.',
    '',
    profile.persona,
  ].join('\n');
}

interface Live {
  stage: Stage;
  conversationId: string;
  claudeSessionId: string | null;
  conversation: Conversation;
  model: string;
  /** The mode of the last message, reused when Cherry sends one itself. */
  mode: ChatMode;
  startedAt: number;
  turns: number;
  running: RunHandle | null;
  turnId: string | null;
}

/** `<projectId>:<stage>`: the key of one stage's chat. */
const key = (projectId: string, stage: Stage) => `${projectId}:${stage}`;

/**
 * One chat conversation per project and stage at a time (ADR-0034); resumes across reloads and
 * restarts.
 */
export class ChatService {
  private readonly live = new Map<string, Live>();
  /** Explain answers per turn, so a second click costs nothing. */
  private readonly explained = new Map<string, string>();

  constructor(
    private readonly config: ConfigStore,
    private readonly db: Db,
    private readonly hub: EventHub,
    private readonly approvals: ApprovalBroker,
    private readonly decisions: DecisionBroker,
    private readonly runner: Runner,
    private readonly home: string,
    private readonly adrs?: AdrService,
    private readonly commits?: CommitService,
  ) {}

  private transcriptFile(conversationId: string): string {
    return path.join(this.home, 'transcripts', `${conversationId}.jsonl`);
  }

  private open(
    projectId: string,
    stage: Stage,
    conversationId: string,
    claudeSessionId: string | null,
    model: string,
    startedAt: number,
    turns: number,
  ): Live {
    const dir = projectDir(this.config.projectsDir(), projectId);
    const topic = `project:${projectId}`;
    const conversation = new Conversation({
      projectId,
      cwd: dir,
      source: `chat:${conversationId}`,
      transcript: new Transcript(this.transcriptFile(conversationId)),
      approvals: this.approvals,
      decisions: this.decisions,
      onItem: (item) =>
        this.hub.publish(topic, 'chat.item', { projectId, stage, conversationId, item }),
      onDelta: (itemId, turnId, text) =>
        this.hub.publish(topic, 'chat.delta', {
          projectId,
          stage,
          conversationId,
          itemId,
          turnId,
          text,
        }),
      onPlan: (plan) =>
        this.hub.publish(topic, 'chat.plan', { projectId, stage, conversationId, plan }),
    });
    const live: Live = {
      stage,
      conversationId,
      claudeSessionId,
      conversation,
      model,
      mode: 'ask',
      startedAt,
      turns,
      running: null,
      turnId: null,
    };
    this.live.set(key(projectId, stage), live);
    return live;
  }

  /** The current conversation, loading the latest one from disk after a restart. */
  private current(projectId: string, stage: Stage): Live | null {
    const cached = this.live.get(key(projectId, stage));
    if (cached) return cached;
    const row = this.db
      .prepare(
        `SELECT id, claude_session_id, model, started_at, title FROM sessions WHERE project_id = ? AND stage = ? AND kind = 'chat' AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1`,
      )
      .get(projectId, stage) as
      | { id: string; claude_session_id: string | null; model: string; started_at: number }
      | undefined;
    if (!row) return null;
    const turns = this.sessionCount(projectId, stage);
    const live = this.open(
      projectId,
      stage,
      row.id,
      row.claude_session_id,
      row.model,
      row.started_at,
      turns,
    );
    live.conversation.closeInterrupted(
      'Cherry restarted while Claude was working, so this turn stopped. Send a message (for example "continue") to pick up where it left off.',
    );
    return live;
  }

  private sessionCount(projectId: string, stage: Stage): number {
    return (
      this.db
        .prepare(
          `SELECT COUNT(*) AS n FROM sessions WHERE project_id = ? AND stage = ? AND kind = 'chat'`,
        )
        .get(projectId, stage) as { n: number }
    ).n;
  }

  state(projectId: string, stage: Stage = 'development'): ChatState {
    projectDir(this.config.projectsDir(), projectId);
    const live = this.current(projectId, stage);
    const sessionNumber = this.sessionCount(projectId, stage);
    return {
      conversationId: live?.conversationId ?? null,
      claudeSessionId: live?.claudeSessionId ?? null,
      running: !!live?.running,
      turnId: live?.turnId ?? null,
      model: live?.model ?? this.config.get().claude.defaultModel,
      startedAt: live?.startedAt ?? null,
      turns: sessionNumber,
      touched: live ? [...live.conversation.touched] : [],
      items: live?.conversation.list() ?? [],
      plan: live?.conversation.plan ?? [],
    };
  }

  private publishState(projectId: string, stage: Stage, live: Live | null): void {
    this.hub.publish(`project:${projectId}`, 'chat.state', {
      projectId,
      stage,
      conversationId: live?.conversationId ?? null,
      running: !!live?.running,
      turnId: live?.turnId ?? null,
      touched: live ? [...live.conversation.touched] : [],
    });
  }

  send(projectId: string, body: ChatSend): { turnId: string; conversationId: string } {
    const dir = projectDir(this.config.projectsDir(), projectId);
    const stage = body.stage;
    let live = this.current(projectId, stage);
    if (live?.running)
      throw conflict('Claude is still working on the last message. Stop it first or wait.');
    for (const a of body.attachments) uploadPath(dir, a);
    const model = body.model ?? live?.model ?? this.config.get().claude.defaultModel;
    if (!live) {
      const conversationId = randomUUID();
      const now = Date.now();
      this.db
        .prepare(
          `INSERT INTO sessions (id, project_id, stage, kind, title, model, started_at, transcript) VALUES (?, ?, ?, 'chat', ?, ?, ?, ?)`,
        )
        .run(
          conversationId,
          projectId,
          stage,
          body.text.slice(0, 80),
          model,
          now,
          this.transcriptFile(conversationId),
        );
      live = this.open(projectId, stage, conversationId, null, model, now, 0);
      recordUsage(this.db, now, 0, true);
    }
    live.model = model;
    const turnId = randomUUID().slice(0, 12);
    const current = live;
    current.turnId = turnId;
    current.conversation.startTurn(turnId);
    current.conversation.setAuto(body.mode === 'auto');
    current.mode = body.mode;
    current.conversation.addUser(`u_${turnId}`, body.text, body.attachments);

    // Auto commit (ADR-0030): Claude commits through commit_changes, as the user.
    const autoCommit = !!this.commits?.autoCommit(projectId);
    // The stage's skills, as a skills-only plugin; the Skill tool runs without asking.
    const plugin = buildStagePlugin(this.home, stage);
    // Claude in Chrome (ADR-0037): project chats only, when the setting is on.
    const chrome = this.config.get().claude.chrome;
    let finished = false;
    const handle = this.runner({
      cwd: dir,
      prompt: withAttachments(body.text, body.attachments),
      resume: current.claudeSessionId,
      model,
      ...(body.effort && model !== 'haiku' ? { effort: body.effort } : {}),
      planMode: body.mode === 'plan',
      chrome,
      appendSystemPrompt:
        chatSystemPrompt(stage, body.mode) +
        (autoCommit ? `\n${AUTO_COMMIT_PROMPT}` : '') +
        (chrome ? `\n${CHROME_PROMPT}` : ''),
      allowedTools: plugin ? [...READ_TOOLS, 'Skill'] : READ_TOOLS,
      ...(plugin ? { plugins: [plugin] } : {}),
      guard: stageGuard(stage, dir),
      decisions: true,
      extraTools: [
        ...(this.adrs?.tools(projectId, 'chat') ?? []),
        // The stage checklist behind the Overview bar (V2.1 w5); Issues counts issues instead.
        ...(stage !== 'issues' ? [checklistTool(dir, stage)] : []),
        ...(autoCommit && this.commits ? [this.commits.tool(projectId)] : []),
      ],
      onPermission: (tool, input, id) => current.conversation.permission(tool, input, id),
      onDecision: (input) => current.conversation.decision(input),
      onEvent: (ev) => {
        if (ev.t === 'session' && ev.sessionId !== current.claudeSessionId) {
          current.claudeSessionId = ev.sessionId;
          this.db
            .prepare('UPDATE sessions SET claude_session_id = ?, model = ? WHERE id = ?')
            .run(ev.sessionId, model, current.conversationId);
        }
        current.conversation.handle(ev);
        if (ev.t === 'result') {
          finished = true;
          recordUsage(this.db, Date.now(), ev.durationMs, false);
          current.running = null;
          current.turnId = null;
          this.approvals.cancel(`chat:${current.conversationId}`, 'Turn ended');
          this.decisions.cancel(`chat:${current.conversationId}`);
          this.publishState(projectId, stage, current);
          if (!ev.stopped)
            notify(this.hub, {
              projectId,
              kind: ev.ok ? 'chat.done' : 'chat.failed',
              title: ev.ok
                ? `${stageProfile(stage).name} replied in ${projectId}`
                : `${stageProfile(stage).name} stopped in ${projectId}`,
              body: ev.ok ? 'Your reply is ready.' : (ev.error ?? 'The turn ended with an error.'),
              link: projectLink(projectId),
            });
          this.sendQueued(projectId, stage, ev.stopped);
        }
      },
    });
    // A runner may finish before it returns (the fake Claude does); only mark running if not.
    if (!finished) {
      current.running = handle;
      this.publishState(projectId, stage, current);
    }
    return { turnId, conversationId: current.conversationId };
  }

  /** Messages Cherry sends for the user while Claude is busy; sent when the turn ends. */
  private readonly queued = new Map<string, string[]>();

  /**
   * A message Cherry sends for the user (an approved decision, an agent's skipped steps), in the
   * mode they used last. While Claude is still replying it waits and goes when the turn ends.
   */
  sendAs(
    projectId: string,
    text: string,
    stage: Stage = 'development',
  ): { turnId: string; conversationId: string } {
    const live = this.current(projectId, stage);
    const k = key(projectId, stage);
    if (live?.running) {
      this.queued.set(k, [...(this.queued.get(k) ?? []), text]);
      return { turnId: 'queued', conversationId: live.conversationId };
    }
    return this.send(projectId, { text, stage, mode: live?.mode ?? 'ask', attachments: [] });
  }

  /** Sends the next queued message, unless the user stopped the turn. */
  private sendQueued(projectId: string, stage: Stage, stopped: boolean): void {
    const k = key(projectId, stage);
    const next = this.queued.get(k) ?? [];
    if (stopped) next.length = 0;
    const text = next.shift();
    if (!next.length) this.queued.delete(k);
    if (text === undefined) return;
    // After the result event has been handled, so the turn is really over.
    setImmediate(() => {
      try {
        this.sendAs(projectId, text, stage);
      } catch {
        // The project is gone or the chat was replaced; nothing to do.
      }
    });
  }

  /** Summarises one turn's file changes with Haiku. Only on the user's click (ADR-0022). */
  async explain(
    projectId: string,
    turnId: string,
    stage: Stage = 'development',
  ): Promise<{ text: string }> {
    const dir = projectDir(this.config.projectsDir(), projectId);
    const cached = this.explained.get(turnId);
    if (cached) return { text: cached };
    const items = this.current(projectId, stage)?.conversation.list() ?? [];
    const text = await explainTurn(this.runner, dir, items, turnId);
    this.explained.set(turnId, text);
    return { text };
  }

  async stop(projectId: string, stage: Stage = 'development'): Promise<void> {
    const live = this.current(projectId, stage);
    if (!live?.running) return;
    const source = `chat:${live.conversationId}`;
    this.approvals.cancel(source, 'Stopped by the user');
    this.decisions.cancel(source);
    await live.running.interrupt();
  }

  async newConversation(projectId: string, stage: Stage = 'development'): Promise<void> {
    this.queued.delete(key(projectId, stage));
    const live = this.current(projectId, stage);
    if (live) {
      await this.stop(projectId, stage);
      this.db
        .prepare('UPDATE sessions SET ended_at = ? WHERE id = ?')
        .run(Date.now(), live.conversationId);
      this.approvals.clearSession(`chat:${live.conversationId}`);
      this.live.delete(key(projectId, stage));
    }
    this.publishState(projectId, stage, null);
  }

  upload(projectId: string, name: string, data: Buffer) {
    return saveUpload(projectDir(this.config.projectsDir(), projectId), name, data);
  }

  /** Deletes an upload that was never sent (the user removed its chip). */
  discardUpload(projectId: string, id: string): void {
    const file = this.uploadFile(projectId, id);
    const sent = STAGES.some((stage) =>
      this.current(projectId, stage)
        ?.conversation.list(Infinity)
        .some((i) => i.kind === 'user' && i.attachments?.includes(id)),
    );
    if (sent) throw conflict('This file was already sent in a message, so it stays.');
    rmSync(file);
  }

  uploadFile(projectId: string, id: string): string {
    return uploadPath(projectDir(this.config.projectsDir(), projectId), id);
  }

  /** Stops every running turn (daemon shutdown). */
  async stopAll(): Promise<void> {
    await Promise.all(
      [...this.live.entries()].map(([k, live]) =>
        this.stop(k.slice(0, k.length - live.stage.length - 1), live.stage),
      ),
    );
  }
}
