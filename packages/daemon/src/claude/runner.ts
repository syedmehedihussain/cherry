import { createSdkMcpServer, query, tool, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import path from 'node:path';
import { z } from 'zod';
import { isInside, isSecretFile } from '../paths.ts';

/** The internal event stream every runner produces (claude-runner.md). */
export type RunnerEvent =
  | { t: 'session'; sessionId: string }
  | { t: 'text_start'; blockId: string }
  | { t: 'text'; blockId: string; delta: string }
  /** Claude's thinking (V2.1 w7.4): start, text as it streams (may stay empty), end. */
  | { t: 'thinking_start'; blockId: string }
  | { t: 'thinking'; blockId: string; delta: string }
  | { t: 'thinking_end'; blockId: string }
  | { t: 'tool_start'; id: string; name: string; input: Record<string, unknown> }
  | { t: 'tool_end'; id: string; ok: boolean; output: string }
  /** A subagent's own tool calls, under the Task / Agent call `parentId` (V2.1 w7.5). */
  | {
      t: 'sub_tool_start';
      parentId: string;
      id: string;
      name: string;
      input: Record<string, unknown>;
    }
  | { t: 'sub_tool_end'; parentId: string; id: string; ok: boolean }
  | {
      t: 'result';
      ok: boolean;
      stopped: boolean;
      error: string | null;
      durationMs: number;
      costUsd: number | null;
      /** How full the context window is after the turn (V2.1 w7.3); null if unknown. */
      context?: ContextUse | null;
    };

export interface ContextUse {
  used: number;
  window: number;
}

/** An extra in-process tool (served as mcp__cherry__<name>). */
export interface CustomTool {
  name: string;
  description: string;
  shape: Record<string, z.ZodType>;
  handler(args: unknown): Promise<{ ok: boolean; text: string }>;
}

export const customToolName = (name: string) => `mcp__cherry__${name}`;

export type PermissionAnswer =
  { allow: true; input?: Record<string, unknown> } | { allow: false; message: string };
export type DecisionReply = { ok: true; text: string } | { ok: false; error: string };

export interface RunRequest {
  cwd: string;
  prompt: string;
  /** Claude session id to continue, if any. */
  resume: string | null;
  model: string;
  /** Reasoning effort; left out, the model's default. */
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  planMode: boolean;
  /** Turn on the CLI's built-in Claude in Chrome tools (ADR-0037). Off: `--no-chrome`. */
  chrome?: boolean;
  appendSystemPrompt: string;
  /** Tools that run without asking (read-only ones). */
  allowedTools: string[];
  /** Tools Claude may not use at all. */
  disallowedTools?: string[];
  additionalDirectories?: string[];
  /** Local plugin folders to load; Cherry only builds skills-only ones (ADR-0034). */
  plugins?: string[];
  /** Offer the ask_decision tool. */
  decisions: boolean;
  /** More in-process tools (calibration's note_found / propose_files). */
  extraTools?: CustomTool[];
  /**
   * Runs before every tool call, whatever the permission mode (PreToolUse hook). Return a reason
   * to refuse the call. Secret files are always refused on top of this.
   */
  guard?(tool: string, input: Record<string, unknown>): string | null;
  onPermission(
    tool: string,
    input: Record<string, unknown>,
    toolUseId: string,
  ): Promise<PermissionAnswer>;
  onDecision(input: unknown): Promise<DecisionReply>;
  onEvent(event: RunnerEvent): void;
}

export interface RunHandle {
  /** Resolves when the turn has finished (a `result` event was sent). */
  done: Promise<void>;
  interrupt(): Promise<void>;
}

export type Runner = (req: RunRequest) => RunHandle;

export const DECISION_TOOL = 'mcp__cherry__ask_decision';

/**
 * Turns off the usage telemetry of bundled skills' tools (ADR-0034): nothing leaves the machine
 * except to Claude and GitHub. Superpowers' brainstorm page loads a logo from its site and
 * HyperFrames sends PostHog events unless these are set.
 */
export const NO_TELEMETRY_ENV: Record<string, string> = {
  DO_NOT_TRACK: '1',
  SUPERPOWERS_DISABLE_TELEMETRY: '1',
  HYPERFRAMES_NO_TELEMETRY: '1',
};

/** Refuses tools that would read a secret file (docs/security.md → Files never read). */
export function secretGuard(
  cwd: string,
  tool: string,
  input: Record<string, unknown>,
): string | null {
  const candidates = ['file_path', 'notebook_path', 'path']
    .map((k) => input[k])
    .filter((v): v is string => typeof v === 'string');
  for (const p of candidates) {
    const rel = path.relative(cwd, path.resolve(cwd, p));
    if (isSecretFile(rel))
      return `Cherry never lets Claude read secret files like ${path.basename(p)}.`;
  }
  if (
    tool === 'Grep' &&
    typeof input.glob === 'string' &&
    /\.env|\.pem|\.key|\.p12|\.pfx|id_rsa|id_ed25519|id_ecdsa|credentials/.test(input.glob)
  ) {
    return 'Cherry never lets Claude search secret files.';
  }
  return null;
}
const FILE_TOOLS = new Set([
  'Read',
  'Glob',
  'Grep',
  'LS',
  'Edit',
  'Write',
  'MultiEdit',
  'NotebookEdit',
]);

/**
 * Refuses file tools aimed outside the run's folders (cwd + additionalDirectories), with
 * symlinks resolved. Covers chat, scans, agents, calibration and Magnet alike.
 */
export function pathGuard(
  roots: string[],
  tool: string,
  input: Record<string, unknown>,
): string | null {
  if (!FILE_TOOLS.has(tool)) return null;
  const paths = ['file_path', 'notebook_path', 'path']
    .map((k) => input[k])
    .filter((v): v is string => typeof v === 'string' && v !== '');
  // An absolute Glob pattern carries its own folder: check the part before the first wildcard.
  if (tool === 'Glob' && typeof input.pattern === 'string' && path.isAbsolute(input.pattern))
    paths.push(input.pattern.split(/[*?[{]/)[0]!);
  const outside = paths.find((p) => !roots.some((r) => isInside(r, path.resolve(roots[0]!, p))));
  return outside
    ? `Cherry keeps Claude inside the project folder. ${outside} is outside it.`
    : null;
}

/** Every Cherry rule that runs before a tool call, then the request's own guard. */
export function preToolGuard(
  req: Pick<RunRequest, 'cwd' | 'additionalDirectories' | 'guard'>,
  tool: string,
  input: Record<string, unknown>,
): string | null {
  return (
    secretGuard(req.cwd, tool, input) ??
    pathGuard([req.cwd, ...(req.additionalDirectories ?? [])], tool, input) ??
    req.guard?.(tool, input) ??
    null
  );
}

/** Tools that only read. ToolSearch just loads tool definitions (the SDK defers MCP tools). */
/** Run without asking: reading, and Claude's own checklist (TaskCreate…, TodoWrite). */
export const READ_TOOLS = [
  'Read',
  'Glob',
  'Grep',
  'LS',
  'TodoWrite',
  'TaskCreate',
  'TaskUpdate',
  'TaskList',
  'TaskGet',
  'ToolSearch',
  // Starting a subagent; its own edits and commands still ask (ADR-0042).
  'Task',
  'Agent',
];

/** Loose input shape for the tool; the strict card schema is checked by the caller. */
const decisionShape = {
  topic: z.string().describe('Short topic, e.g. "Data model" or "Stack"'),
  question: z.string(),
  context: z
    .string()
    .optional()
    .describe('One line that starts "You said: …" when it builds on the user\'s words'),
  options: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        detail: z.string().optional(),
        tradeoff: z.string(),
        recommended: z.boolean().optional(),
      }),
    )
    .describe('2 to 4 options; exactly one has recommended: true; every option has a trade-off'),
  why: z.string().optional().describe('Why you recommend that option, 2-4 sentences'),
  allowCustom: z.boolean().optional(),
};

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((c) =>
        c && typeof c === 'object' && 'text' in c ? String((c as { text: unknown }).text) : '',
      )
      .join('\n');
  }
  return '';
}

/** Drives Claude Code through the Claude Agent SDK (ADR-0004). */
export const sdkRunner: Runner = (req) => {
  const extra = (req.extraTools ?? []).map((t) =>
    tool(t.name, t.description, t.shape, async (args) => {
      const r = await t.handler(args);
      return { content: [{ type: 'text', text: r.text }], ...(r.ok ? {} : { isError: true }) };
    }),
  );
  const server =
    req.decisions || extra.length
      ? createSdkMcpServer({
          name: 'cherry',
          tools: [
            ...extra,
            ...(req.decisions
              ? [
                  tool(
                    'ask_decision',
                    'Ask the user to choose between 2-4 options. Use it for every real choice instead of picking yourself. The call waits until the user answers and returns their choice.',
                    decisionShape,
                    async (args) => {
                      const reply = await req.onDecision(args);
                      return reply.ok
                        ? { content: [{ type: 'text', text: reply.text }] }
                        : { content: [{ type: 'text', text: reply.error }], isError: true };
                    },
                  ),
                ]
              : []),
          ],
        })
      : null;

  const q = query({
    prompt: req.prompt,
    options: {
      cwd: req.cwd,
      model: req.model,
      ...(req.effort ? { effort: req.effort } : {}),
      ...(req.resume ? { resume: req.resume } : {}),
      includePartialMessages: true,
      permissionMode: req.planMode ? 'plan' : 'default',
      allowedTools: [
        ...req.allowedTools,
        ...(req.decisions ? [DECISION_TOOL] : []),
        ...(req.extraTools ?? []).map((t) => customToolName(t.name)),
      ],
      ...(req.disallowedTools ? { disallowedTools: req.disallowedTools } : {}),
      ...(req.additionalDirectories ? { additionalDirectories: req.additionalDirectories } : {}),
      ...(req.plugins?.length
        ? {
            plugins: req.plugins.map((p) => ({
              type: 'local' as const,
              path: p,
              skipMcpDiscovery: true,
            })),
          }
        : {}),
      ...(server ? { mcpServers: { cherry: server } } : {}),
      // No settings files: their allow rules would bypass Cherry's approvals (ADR-0004).
      settingSources: [],
      // Claude in Chrome only when the caller asks; every Chrome tool still asks (ADR-0037).
      extraArgs: { [req.chrome ? 'chrome' : 'no-chrome']: null },
      env: { ...process.env, ...NO_TELEMETRY_ENV },
      systemPrompt: { type: 'preset', preset: 'claude_code', append: req.appendSystemPrompt },
      hooks: {
        PreToolUse: [
          {
            hooks: [
              async (hookInput) => {
                if (hookInput.hook_event_name !== 'PreToolUse') return {};
                const input = (hookInput.tool_input ?? {}) as Record<string, unknown>;
                const reason = preToolGuard(req, hookInput.tool_name, input);
                return reason
                  ? {
                      hookSpecificOutput: {
                        hookEventName: 'PreToolUse',
                        permissionDecision: 'deny',
                        permissionDecisionReason: reason,
                      },
                    }
                  : {};
              },
            ],
          },
        ],
      },
      canUseTool: async (name, input, { toolUseID }) => {
        const answer = await req.onPermission(name, input, toolUseID);
        return answer.allow
          ? { behavior: 'allow', updatedInput: answer.input ?? input }
          : { behavior: 'deny', message: answer.message };
      },
      stderr: () => undefined,
    },
  });

  let messageId = '';
  // Content block indexes of the current message that are thinking blocks.
  const thinking = new Set<number>();
  // Tokens in the context after the last main-agent message, like the CLI's /context.
  let used: number | null = null;
  let sentResult = false;
  let stopped = false;
  const started = Date.now();

  const handle = (m: SDKMessage) => {
    if (m.type === 'system' && m.subtype === 'init') {
      req.onEvent({ t: 'session', sessionId: m.session_id });
    } else if (m.type === 'system' && m.subtype === 'compact_boundary') {
      used = m.compact_metadata.post_tokens ?? null;
    } else if (m.type === 'stream_event') {
      if (m.parent_tool_use_id) return;
      const ev = m.event;
      if (ev.type === 'message_start') {
        messageId = ev.message.id;
        thinking.clear();
      } else if (
        ev.type === 'content_block_start' &&
        (ev.content_block.type === 'thinking' || ev.content_block.type === 'redacted_thinking')
      ) {
        thinking.add(ev.index);
        req.onEvent({ t: 'thinking_start', blockId: `${messageId}:${ev.index}` });
      } else if (ev.type === 'content_block_delta' && ev.delta.type === 'thinking_delta') {
        req.onEvent({
          t: 'thinking',
          blockId: `${messageId}:${ev.index}`,
          delta: ev.delta.thinking,
        });
      } else if (ev.type === 'content_block_stop' && thinking.delete(ev.index)) {
        req.onEvent({ t: 'thinking_end', blockId: `${messageId}:${ev.index}` });
      } else if (ev.type === 'content_block_start' && ev.content_block.type === 'text') {
        req.onEvent({ t: 'text_start', blockId: `${messageId}:${ev.index}` });
      } else if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
        req.onEvent({ t: 'text', blockId: `${messageId}:${ev.index}`, delta: ev.delta.text });
      }
    } else if (m.type === 'assistant' && m.parent_tool_use_id) {
      for (const block of m.message.content)
        if (block.type === 'tool_use')
          req.onEvent({
            t: 'sub_tool_start',
            parentId: m.parent_tool_use_id,
            id: block.id,
            name: block.name,
            input: (block.input ?? {}) as Record<string, unknown>,
          });
    } else if (m.type === 'user' && m.parent_tool_use_id) {
      const content = m.message.content;
      if (Array.isArray(content))
        for (const block of content)
          if (block.type === 'tool_result')
            req.onEvent({
              t: 'sub_tool_end',
              parentId: m.parent_tool_use_id,
              id: block.tool_use_id,
              ok: !block.is_error,
            });
    } else if (m.type === 'assistant') {
      const u = m.message.usage;
      if (u)
        used =
          u.input_tokens +
          (u.cache_read_input_tokens ?? 0) +
          (u.cache_creation_input_tokens ?? 0) +
          u.output_tokens;
      for (const block of m.message.content) {
        if (block.type === 'tool_use') {
          req.onEvent({
            t: 'tool_start',
            id: block.id,
            name: block.name,
            input: (block.input ?? {}) as Record<string, unknown>,
          });
        }
      }
    } else if (m.type === 'user') {
      const content = m.message.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'tool_result') {
            req.onEvent({
              t: 'tool_end',
              id: block.tool_use_id,
              ok: !block.is_error,
              output: textOf(block.content),
            });
          }
        }
      }
    } else if (m.type === 'result') {
      sentResult = true;
      const ok = m.subtype === 'success' && !m.is_error;
      const error = ok
        ? null
        : stopped
          ? null
          : 'result' in m && typeof m.result === 'string' && m.result
            ? m.result
            : (m as { errors?: string[] }).errors?.join('; ') || m.subtype;
      req.onEvent({
        t: 'result',
        ok,
        stopped,
        error,
        durationMs: m.duration_ms,
        costUsd: m.total_cost_usd ?? null,
        context: contextUse(used, m.modelUsage),
      });
    }
  };

  const done = (async () => {
    try {
      for await (const m of q) handle(m);
    } catch (e) {
      if (!sentResult) {
        sentResult = true;
        req.onEvent({
          t: 'result',
          ok: false,
          stopped,
          error: stopped ? null : (e as Error).message,
          durationMs: Date.now() - started,
          costUsd: null,
        });
      }
    }
    if (!sentResult)
      req.onEvent({
        t: 'result',
        ok: !stopped,
        stopped,
        error: null,
        durationMs: Date.now() - started,
        costUsd: null,
      });
  })();

  return {
    done,
    async interrupt() {
      stopped = true;
      try {
        await q.interrupt();
      } catch {
        q.close();
      }
    },
  };
};

/**
 * The context meter (V2.1 w7.3): `used` tokens of the main model's window. modelUsage has one
 * entry per model the turn used (subagents and helpers too); the main model sent the most input.
 * The window is 0 when no model was called.
 */
export function contextUse(
  used: number | null,
  modelUsage:
    | Record<
        string,
        {
          inputTokens: number;
          cacheReadInputTokens: number;
          cacheCreationInputTokens: number;
          contextWindow: number;
        }
      >
    | undefined,
): ContextUse | null {
  if (used === null) return null;
  const main = Object.values(modelUsage ?? {}).sort(
    (a, b) =>
      b.inputTokens +
      b.cacheReadInputTokens +
      b.cacheCreationInputTokens -
      (a.inputTokens + a.cacheReadInputTokens + a.cacheCreationInputTokens),
  )[0];
  // A /compact turn may call no model: window 0, the conversation keeps the last one it saw.
  return { used, window: main?.contextWindow ?? 0 };
}
