import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { chromeTool, type BrowserTest, type ChatItem } from '@cherry/shared';
import type { ApprovalBroker } from '../claude/approvals.ts';
import { Conversation } from '../claude/conversation.ts';
import type { DecisionBroker } from '../claude/decisions.ts';
import { READ_TOOLS, type CustomTool, type RunHandle, type Runner } from '../claude/runner.ts';
import { Transcript } from '../claude/transcript.ts';
import { ensureIgnored } from '../chat/uploads.ts';
import type { ConfigStore } from '../config.ts';
import { notify, projectLink, type EventHub } from '../events.ts';
import { badRequest, conflict, notFound } from '../http.ts';
import { projectDir } from '../projects/workspace.ts';
import { resolveInside } from '../paths.ts';

export const TESTS_DIR = 'cherry/tests';

const StepInput = z.object({
  name: z.string().min(1).max(120),
  ok: z.boolean(),
  detail: z.string().max(400).default(''),
});
const DoneInput = z.object({ summary: z.string().min(1).max(600) });

const idle = (blocked: string | null = null): BrowserTest => ({
  id: null,
  status: 'idle',
  url: null,
  startedAt: null,
  finishedAt: null,
  steps: [],
  summary: null,
  log: [],
  blocked,
});

/** The test's order to Claude: the plan's steps, one test_step call each, in ASD-STE100. */
export function testPrompt(url: string, hasPlan: boolean): string {
  return [
    `Test the app at ${url} in Chrome, as a user would.`,
    hasPlan
      ? 'Take the steps from docs/test-plan.md (the browser or end-to-end steps of the current milestone).'
      : 'There is no docs/test-plan.md. Take the main flow from docs/prd.md, or from what the app shows: at most 8 steps.',
    'For each step: do it in a new tab, take a screenshot, then call test_step with a short name (for example "Log a run: 5.2 km"), ok, and, when it fails, what you saw in one line.',
    'When all steps are done, call test_done with two short lines: the result and the most important failure.',
    "Rules: do not change any file. Do not submit payments, passwords or messages. Do not touch the user's other tabs. Use short, plain sentences.",
  ].join('\n');
}

interface Live {
  test: BrowserTest;
  handle: RunHandle | null;
  stopped: boolean;
}

/**
 * The quiet browser test (V3 r11): Claude in Chrome walks through the app from the test plan in
 * the background. Chrome tools run without asking (ADR-0038); nothing else runs (no edits, no
 * commands). Each step is one row with its screenshot; the full log opens on a click.
 */
export class BrowserTestService {
  private tests = new Map<string, Live>();

  constructor(
    private readonly config: ConfigStore,
    private readonly hub: EventHub,
    private readonly approvals: ApprovalBroker,
    private readonly decisions: DecisionBroker,
    private readonly runner: Runner,
    private readonly home: string,
  ) {}

  private blocked(): string | null {
    return this.config.get().claude.chrome
      ? null
      : 'Claude in Chrome is off. Turn it on in Settings, Claude Code, to run the browser test.';
  }

  get(projectId: string): BrowserTest {
    const live = this.tests.get(projectId);
    return live ? { ...live.test, blocked: this.blocked() } : idle(this.blocked());
  }

  private publish(projectId: string) {
    this.hub.publish(`project:${projectId}`, 'browsertest.updated', {
      projectId,
      test: this.get(projectId),
    });
  }

  /** The screenshot file of a step, for the cockpit. */
  shot(projectId: string, runId: string, file: string): string {
    if (!/^[\w-]+$/.test(runId) || !/^\d+\.(png|jpe?g|webp)$/.test(file)) throw notFound('No shot');
    const dir = projectDir(this.config.projectsDir(), projectId);
    const abs = resolveInside(dir, `${TESTS_DIR}/${runId}/${file}`);
    if (!existsSync(abs)) throw notFound('No shot');
    return abs;
  }

  start(projectId: string, url: string): BrowserTest {
    const blocked = this.blocked();
    if (blocked) throw badRequest(blocked);
    if (!/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/.test(url))
      throw badRequest('The browser test only opens the app on this computer (localhost).');
    if (this.tests.get(projectId)?.test.status === 'running')
      throw conflict('The browser test is already running.');
    const dir = projectDir(this.config.projectsDir(), projectId);
    const runId = `t${Date.now().toString(36)}${randomUUID().slice(0, 4)}`;
    const shots = path.join(dir, TESTS_DIR, runId);
    const live: Live = {
      test: { ...idle(), id: runId, status: 'running', url, startedAt: Date.now() },
      handle: null,
      stopped: false,
    };
    this.tests.set(projectId, live);
    const update = (change: Partial<BrowserTest>) => {
      live.test = { ...live.test, ...change };
      this.publish(projectId);
    };

    /** The newest screenshot Chrome returned, kept for the next test_step. */
    let lastShot: { mediaType: string; data: string } | null = null;
    const source = `test:${runId}`;
    const conversation = new Conversation({
      projectId,
      cwd: dir,
      source,
      transcript: new Transcript(path.join(this.home, 'transcripts', `${runId}.jsonl`)),
      approvals: this.approvals,
      decisions: this.decisions,
      onItem: (item: ChatItem) => {
        if (item.kind !== 'tool' || item.status === 'running') return;
        const chrome = chromeTool(item.tool);
        const line = `${item.status === 'ok' ? '✓' : '✗'} ${chrome ?? item.tool}: ${item.target}${item.meta ? ` (${item.meta})` : ''}`;
        update({ log: [...live.test.log, line].slice(-300) });
      },
      onDelta: () => undefined,
      // Never asks: Chrome and reading the plan only (ADR-0038).
      policy: (tool) =>
        chromeTool(tool) || READ_TOOLS.includes(tool)
          ? 'allow'
          : { deny: 'The browser test only uses Chrome and reads the plan. It changes nothing.' },
    });
    conversation.startTurn(runId);

    const step: CustomTool = {
      name: 'test_step',
      description:
        'Record one step of the browser test: a short name, ok (true or false), and when it fails what you saw. Take a screenshot just before; Cherry keeps it with the step.',
      shape: StepInput.shape,
      handler: async (args) => {
        const parsed = StepInput.safeParse(args);
        if (!parsed.success) return { ok: false, text: 'Give name, ok and detail.' };
        const n = live.test.steps.length + 1;
        let shot: string | null = null;
        if (lastShot) {
          const ext = lastShot.mediaType.includes('jpeg')
            ? 'jpg'
            : lastShot.mediaType.includes('webp')
              ? 'webp'
              : 'png';
          mkdirSync(shots, { recursive: true });
          ensureIgnored(dir);
          shot = `${n}.${ext}`;
          writeFileSync(path.join(shots, shot), Buffer.from(lastShot.data, 'base64'));
          lastShot = null;
        }
        update({ steps: [...live.test.steps, { n, ...parsed.data, shot }] });
        return { ok: true, text: `Step ${n} saved.` };
      },
    };
    const done: CustomTool = {
      name: 'test_done',
      description:
        'Finish the browser test with two short lines: the result and the most important failure.',
      shape: DoneInput.shape,
      handler: async (args) => {
        const parsed = DoneInput.safeParse(args);
        if (!parsed.success) return { ok: false, text: 'Give a summary.' };
        update({ summary: parsed.data.summary });
        return { ok: true, text: 'Saved. You are done; stop here.' };
      },
    };

    let finished = false;
    const handle = this.runner({
      cwd: dir,
      prompt: testPrompt(url, existsSync(path.join(dir, 'docs', 'test-plan.md'))),
      resume: null,
      model: this.config.get().claude.defaultModel,
      planMode: false,
      chrome: true,
      appendSystemPrompt:
        'You are the browser tester inside Cherry. You use Chrome and read files; you never edit. Record every step with test_step and finish with test_done.',
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
      extraTools: [step, done],
      onPermission: (tool, input, toolUseId) => conversation.permission(tool, input, toolUseId),
      onDecision: async () => ({ ok: false, error: 'The browser test cannot ask questions.' }),
      onEvent: (ev) => {
        conversation.handle(ev);
        if (ev.t === 'tool_end' && ev.images?.length) lastShot = ev.images.at(-1)!;
        if (ev.t !== 'result') return;
        finished = true;
        this.approvals.cancel(source, 'Browser test finished');
        const failed = live.test.steps.filter((s) => !s.ok).length;
        const status =
          live.stopped || ev.stopped
            ? 'stopped'
            : ev.ok && live.test.steps.length
              ? 'done'
              : 'failed';
        update({
          status,
          finishedAt: Date.now(),
          summary:
            live.test.summary ??
            (status === 'failed'
              ? (ev.error ?? 'The test ended before it recorded a step.')
              : null),
        });
        if (status !== 'stopped')
          notify(this.hub, {
            projectId,
            kind: failed || status === 'failed' ? 'test.failed' : 'test.done',
            title: `Browser test ${status === 'failed' ? 'failed' : failed ? `${failed} step${failed === 1 ? '' : 's'} failed` : 'passed'}`,
            body: live.test.summary ?? `${live.test.steps.length} steps.`,
            link: projectLink(projectId, ''),
          });
      },
    });
    if (!finished) live.handle = handle;
    this.publish(projectId);
    return this.get(projectId);
  }

  async stop(projectId: string): Promise<void> {
    const live = this.tests.get(projectId);
    if (!live || live.test.status !== 'running') return;
    live.stopped = true;
    await live.handle?.interrupt();
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.tests.keys()].map((id) => this.stop(id)));
  }
}
