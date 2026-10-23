import { ChevronRight, FileText, Globe, MessageSquarePlus, RotateCcw } from 'lucide-react';
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router';
import {
  ChatModeSchema,
  DOCS_ONLY_STAGES,
  chromeTool,
  type ChatItem,
  type ChatMode,
  type ChatState,
  type Effort,
  type Stage,
} from '@cherry/shared';
import { ApiFailure } from '../../api/client.ts';
import {
  approvePlan,
  dismissPlan,
  answerApproval,
  answerDecision,
  chatKey,
  newChat,
  sendChat,
  stopChat,
  uploadAttachment,
  discardAttachment,
  attachmentLabel,
  attachmentUrl,
  isImageFile,
  useChat,
  useChatDraft,
  useProjectCommands,
} from '../../api/chat.ts';
import { queryClient } from '../../api/queries.ts';
import { searchFiles } from '../../api/workspace.ts';
import { stageInfo, useStageInfo } from '../../api/stages.ts';
import { ApprovalCard } from '../../components/ApprovalCard/ApprovalCard.tsx';
import { ChangeSummary } from '../../components/ChangeSummary/ChangeSummary.tsx';
import { Composer, type SlashCommand } from '../../components/Composer/Composer.tsx';
import { DecisionCard } from '../../components/DecisionCard/DecisionCard.tsx';
import { DecisionInChat } from '../../components/Decisions/Decisions.tsx';
import { Markdown } from '../../components/Markdown/Markdown.tsx';
import {
  ReadGroup,
  StepsGroup,
  TimelineRow,
  type ToolItem,
} from '../../components/Timeline/Timeline.tsx';
import { PlanProposal } from '../../components/PlanProposal/PlanProposal.tsx';
import { useStages } from '../../state/stage.ts';
import { useSideView } from './SidePanel.tsx';
import styles from './Chat.module.css';

type Block =
  | { t: 'user'; item: Extract<ChatItem, { kind: 'user' }> }
  | { t: 'claude'; id: string; parts: Part[] };

type Part =
  | { t: 'text'; item: Extract<ChatItem, { kind: 'text' }> }
  | { t: 'tools'; items: ToolItem[] }
  /** Claude in Chrome steps of this reply, as one row; the steps show in Live (ADR-0038). */
  | { t: 'chrome'; items: ToolItem[] }
  | { t: 'decision'; item: Extract<ChatItem, { kind: 'decision' }> }
  | { t: 'plan'; item: Extract<ChatItem, { kind: 'plan' }> }
  | { t: 'approval'; item: Extract<ChatItem, { kind: 'approval' }> }
  | { t: 'end'; item: Extract<ChatItem, { kind: 'turn-end' }> };

/** Groups items: user bubbles, then one "Claude" block per reply with text, timeline and cards. */
export function toBlocks(items: ChatItem[]): Block[] {
  const blocks: Block[] = [];
  let claude: Extract<Block, { t: 'claude' }> | null = null;
  for (const item of items) {
    if (item.kind === 'user') {
      claude = null;
      blocks.push({ t: 'user', item });
      continue;
    }
    if (!claude) {
      claude = { t: 'claude', id: `c_${item.id}`, parts: [] };
      blocks.push(claude);
    }
    const last = claude.parts[claude.parts.length - 1];
    if (item.kind === 'text') {
      if (item.text.trim()) claude.parts.push({ t: 'text', item });
    } else if (item.kind === 'tool' && chromeTool(item.tool)) {
      const chrome = claude.parts.find((p) => p.t === 'chrome');
      if (chrome?.t === 'chrome') chrome.items.push(item);
      else claude.parts.push({ t: 'chrome', items: [item] });
    } else if (item.kind === 'tool') {
      if (last?.t === 'tools') last.items.push(item);
      else claude.parts.push({ t: 'tools', items: [item] });
    } else if (item.kind === 'decision') claude.parts.push({ t: 'decision', item });
    else if (item.kind === 'plan') claude.parts.push({ t: 'plan', item });
    else if (item.kind === 'approval') claude.parts.push({ t: 'approval', item });
    else if (item.kind === 'turn-end') claude.parts.push({ t: 'end', item });
    // projects / action items belong to Magnet's panel.
  }
  return blocks;
}

/** ADR numbers Claude proposed in these rows (propose_decision; the row's meta is "ADR-0012"). */
function proposals(items: ToolItem[]): number[] {
  return items
    .filter((t) => t.tool === 'mcp__cherry__propose_decision' && t.status === 'ok')
    .map((t) => Number(/ADR-(\d+)/.exec(t.meta ?? '')?.[1]))
    .filter((n) => n > 0);
}

/** Splits a tool run into runs of reads (3+ collapse) and single rows. */
function toolRuns(items: ToolItem[]): (ToolItem | ToolItem[])[] {
  const out: (ToolItem | ToolItem[])[] = [];
  let reads: ToolItem[] = [];
  const flush = () => {
    if (reads.length >= 3) out.push(reads);
    else out.push(...reads);
    reads = [];
  };
  for (const it of items) {
    if (it.verb === 'read' && it.status === 'ok') reads.push(it);
    else {
      flush();
      out.push(it);
    }
  }
  flush();
  return out;
}

const modeKey = (projectId: string, stage: Stage) => `cherry.chatMode.${projectId}.${stage}`;

/**
 * The chat mode is remembered per project and stage. Nothing stored: docs-only stages (Plan,
 * Design, Issues) open in Auto, since their agent can only write docs (ADR-0041); the others
 * use the project's older single setting, or Ask.
 */
export function readMode(projectId: string, stage: Stage): ChatMode {
  const fallback: ChatMode = DOCS_ONLY_STAGES.has(stage) ? 'auto' : 'ask';
  try {
    const stored =
      localStorage.getItem(modeKey(projectId, stage)) ??
      (DOCS_ONLY_STAGES.has(stage) ? null : localStorage.getItem(`cherry.chatMode.${projectId}`));
    return ChatModeSchema.catch(fallback).parse(stored ?? fallback);
  } catch {
    return fallback;
  }
}

export function storeMode(projectId: string, stage: Stage, mode: ChatMode): void {
  try {
    localStorage.setItem(modeKey(projectId, stage), mode);
  } catch {
    // Private window: the mode just isn't remembered.
  }
}

interface ChatTabProps {
  projectId: string;
  /** Which stage's agent and chat (ADR-0034). */
  stage: Stage;
  now: number;
}

export function ChatTab({ projectId, stage, now }: ChatTabProps) {
  const chat = useChat(projectId, stage);
  const draft = useChatDraft((s) => s.drafts[projectId]);
  const setDraft = useChatDraft((s) => s.set);
  const [model, setModel] = useState<string | null>(null);
  const [effort, setEffort] = useState<Effort | null>(null);
  const scope = `${projectId}:${stage}`;
  const [mode, setMode] = useState<{ scope: string; mode: ChatMode }>(() => ({
    scope,
    mode: readMode(projectId, stage),
  }));
  // Another project or stage: load its mode while rendering, so the menu never shows the old one.
  if (mode.scope !== scope) setMode({ scope, mode: readMode(projectId, stage) });
  const changeMode = (m: ChatMode) => {
    storeMode(projectId, stage, m);
    setMode({ scope, mode: m });
  };
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const state = chat.data;
  const items = useMemo(() => state?.items ?? [], [state?.items]);
  const blocks = useMemo(() => toBlocks(items), [items]);
  const paused = items.some(
    (i) =>
      (i.kind === 'approval' && i.approval.status === 'pending') ||
      (i.kind === 'decision' && i.status === 'open'),
  );
  const lastItem = items[items.length - 1];

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [items]);

  const onScroll = () => {
    const el = scroller.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const send = async (text: string, chatMode: ChatMode, m: string, attachments: string[] = []) => {
    setError(null);
    stick.current = true;
    try {
      await sendChat(projectId, stage, text, chatMode, m, attachments, effort ?? undefined);
      if (!state?.conversationId)
        await queryClient.invalidateQueries({ queryKey: chatKey(projectId, stage) });
      return true;
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : 'Could not send the message.');
      return false;
    }
  };

  const lastUserText = [...items].reverse().find((i) => i.kind === 'user')?.text;
  const findFiles = useCallback((q: string) => searchFiles(projectId, q), [projectId]);
  const commands = useSlashCommands({
    projectId,
    stage,
    onMode: changeMode,
    onModel: setModel,
    onError: setError,
  });

  return (
    <div className={styles.chat}>
      <div className={styles.scroll} ref={scroller} onScroll={onScroll}>
        <div className={styles.thread}>
          {chat.isPending && <span className="shimmer" style={{ height: 80 }} />}
          {state && items.length === 0 && (
            <EmptyChat
              stage={stage}
              mode={mode.mode}
              onSkill={(name) => setDraft(projectId, `/cherry-${stage}:${name} `)}
            />
          )}
          {blocks.map((b) =>
            b.t === 'user' ? (
              <div key={b.item.id} className={styles.userRow}>
                <div className={styles.user}>
                  {b.item.attachments && b.item.attachments.length > 0 && (
                    <Attachments projectId={projectId} files={b.item.attachments} />
                  )}
                  {b.item.text}
                </div>
              </div>
            ) : (
              <ClaudeBlock
                key={b.id}
                projectId={projectId}
                block={b}
                now={now}
                running={!!state?.running}
                streamingId={state?.running && lastItem?.kind === 'text' ? lastItem.id : null}
                onRetry={
                  lastUserText
                    ? () => void send(lastUserText, mode.mode, model ?? state?.model ?? 'opus')
                    : undefined
                }
              />
            ),
          )}
          {state?.running && lastItem?.kind !== 'text' && !paused && (
            <div className={styles.working}>
              <span className="spinner" /> Claude is working…
            </div>
          )}
        </div>
      </div>
      <div className={styles.composer}>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <Composer
          running={!!state?.running}
          paused={paused}
          model={model ?? state?.model ?? 'sonnet'}
          effort={effort}
          mode={mode.mode}
          onMode={changeMode}
          draft={draft}
          onDraftUsed={() => setDraft(projectId, '')}
          onSend={send}
          onStop={() => void stopChat(projectId, stage)}
          onUpload={(file) => uploadAttachment(projectId, file)}
          onDiscard={(file) => void discardAttachment(projectId, file).catch(() => undefined)}
          onModel={setModel}
          onEffort={setEffort}
          commands={commands}
          searchFiles={findFiles}
        />
      </div>
    </div>
  );
}

/** Files sent with a message: image thumbnails that open full size, other files as links. */
function Attachments({ projectId, files }: { projectId: string; files: string[] }) {
  return (
    <div className={styles.attachments}>
      {files.map((f) => (
        <a
          key={f}
          href={attachmentUrl(projectId, f)}
          target="_blank"
          rel="noreferrer"
          className={isImageFile(f) ? styles.attachImage : styles.attachFile}
          title={attachmentLabel(f)}
        >
          {isImageFile(f) ? (
            <img src={attachmentUrl(projectId, f)} alt={attachmentLabel(f)} loading="lazy" />
          ) : (
            <>
              <FileText size={13} aria-hidden="true" />
              <span>{attachmentLabel(f)}</span>
            </>
          )}
        </a>
      ))}
    </div>
  );
}

const MODE_NOTE: Record<ChatMode, string> = {
  ask: 'Every edit and command waits for your approval.',
  auto: 'Auto mode: edits and most commands run without asking; pushing, publishing and deleting folders still ask.',
  plan: 'Plan mode: Claude reads and plans, and changes nothing until you approve the plan.',
};

/** The stage's agent introduces itself: name, what it does, its skills (ADR-0034). */
function EmptyChat({
  stage,
  mode,
  onSkill,
}: {
  stage: Stage;
  mode: ChatMode;
  /** Puts the skill's command in the composer (`/cherry-<stage>:<name> `). */
  onSkill(name: string): void;
}) {
  const agent = stageInfo(useStageInfo().data, stage);
  return (
    <div className={styles.empty}>
      <h2>{agent ? `${agent.label}: the ${agent.name}` : 'Start a conversation'}</h2>
      <p>
        {agent?.summary ?? 'Ask Claude to look into something or describe the next task.'}{' '}
        {agent?.docsOnly && 'It writes docs and notes only, never code. '}
        {MODE_NOTE[mode]}
      </p>
      {!!agent?.skills.length && (
        <ul className={styles.skills} aria-label="Skills">
          {agent.skills.map((s) => (
            <li key={s.name}>
              <button
                type="button"
                title={`${s.description}\n\nClick to start it: /cherry-${stage}:${s.name}`}
                onClick={() => onSkill(s.name)}
              >
                {s.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ClaudeBlock({
  projectId,
  block,
  now,
  running,
  streamingId,
  onRetry,
}: {
  projectId: string;
  block: Extract<Block, { t: 'claude' }>;
  now: number;
  running: boolean;
  streamingId: string | null;
  onRetry?: () => void;
}) {
  const firstPending = block.parts.find(
    (p) => p.t === 'approval' && p.item.approval.status === 'pending',
  );
  const end = block.parts.find((p) => p.t === 'end')?.item;
  const tools = block.parts.flatMap((p) => (p.t === 'tools' ? p.items : []));
  const lastTools = block.parts.findLast((p) => p.t === 'tools');
  /** Rows for a run of steps: reads of 3+ collapse, the rest one row each. */
  const rowsOf = (list: ToolItem[]) =>
    toolRuns(list).map((r, i, all) =>
      Array.isArray(r) ? (
        <ReadGroup key={r[0]!.id} items={r} />
      ) : (
        <TimelineRow key={r.id} item={r} last={i === all.length - 1} />
      ),
    );
  /**
   * Calmer chat (V2.1 w6): finished steps fold into one line. While Claude works, only the
   * newest few steps show as rows; anything waiting for you always shows.
   */
  const LIVE_ROWS = 3;
  const renderTools = (list: ToolItem[], live: boolean) => {
    const keep = list.findIndex((i) => i.status === 'waiting' || i.status === 'running');
    const cut = live
      ? Math.max(0, Math.min(keep < 0 ? list.length : keep, list.length - LIVE_ROWS))
      : list.length;
    const folded = list.slice(0, cut);
    const shown = list.slice(cut);
    return (
      <>
        {folded.length >= 2 ? (
          <StepsGroup items={folded}>{rowsOf(folded)}</StepsGroup>
        ) : (
          rowsOf(folded)
        )}
        {rowsOf(shown)}
      </>
    );
  };
  return (
    <div className={styles.claude}>
      <div className={styles.claudeLabel}>Claude</div>
      {block.parts.map((p) => {
        switch (p.t) {
          case 'text':
            return (
              <div key={p.item.id} className={styles.text}>
                <Markdown source={p.item.text} variant="chat" />
                {p.item.id === streamingId && <span className={styles.cursor} aria-hidden="true" />}
              </div>
            );
          case 'tools':
            return (
              <Fragment key={p.items[0]!.id}>
                <div className={styles.timeline}>
                  {renderTools(p.items, !end && p === lastTools)}
                </div>
                {/* A big choice Claude proposed: approve it right here (ADR-0029). */}
                {proposals(p.items).map((n) => (
                  <DecisionInChat key={n} projectId={projectId} number={n} />
                ))}
              </Fragment>
            );
          case 'chrome':
            return <ChromeRow key={p.items[0]!.id} items={p.items} />;
          case 'plan':
            return <PlanCard key={p.item.id} projectId={projectId} plan={p.item} />;
          case 'decision':
            return (
              <DecisionCard
                key={p.item.id}
                card={p.item.card}
                state={p.item.status === 'open' ? (running ? 'open' : 'cancelled') : p.item.status}
                answer={p.item.answer}
                onConfirm={async (a) => {
                  await answerDecision(p.item.id, a);
                }}
              />
            );
          case 'approval':
            return (
              <ApprovalCard
                key={p.item.id}
                approval={p.item.approval}
                now={now}
                autoFocus={p === firstPending}
                onAnswer={async (answer, reason) => {
                  await answerApproval(p.item.approval.id, {
                    answer,
                    ...(reason ? { reason } : {}),
                  });
                }}
              />
            );
          case 'end':
            if (p.item.stopped)
              return (
                <div key={p.item.id} className={styles.stopped}>
                  Stopped.
                </div>
              );
            if (!p.item.ok)
              return (
                <div key={p.item.id} className={styles.failed} role="alert">
                  <span>{p.item.error ?? 'Claude stopped with an error.'}</span>
                  {onRetry && (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
                      <RotateCcw size={12} aria-hidden="true" />
                      Retry
                    </button>
                  )}
                </div>
              );
            return null;
        }
      })}
      {end && <ChangeSummary projectId={projectId} tools={tools} end={end} />}
    </div>
  );
}

/** INIT and REVIEW follow the CLI's /init and /review, in Cherry's words. */
const INIT_PROMPT =
  'Read the project and write CLAUDE.md for it, or update the one there: a one-paragraph summary, the stack, the commands to install, run, test and lint, the folder layout, and the project rules. Keep it short. Then tell me what you wrote.';
const REVIEW_PROMPT =
  'Review the uncommitted changes and the commits not yet on main for bugs, security problems and missing tests. List the findings most serious first, each with the file and line and a fix. Do not change anything.';

/**
 * The composer's slash commands (V2.1 w7.1), like the Claude Code CLI: Cherry's own actions,
 * Claude's /compact, the stage's skills, and the project's `.claude/commands`.
 */
function useSlashCommands({
  projectId,
  stage,
  onMode,
  onModel,
  onError,
}: {
  projectId: string;
  stage: Stage;
  onMode(m: ChatMode): void;
  onModel(m: string): void;
  onError(e: string | null): void;
}): SlashCommand[] {
  const navigate = useNavigate();
  const skills = stageInfo(useStageInfo().data, stage)?.skills ?? [];
  const project = useProjectCommands(projectId).data ?? [];
  const base = `/p/${encodeURIComponent(projectId)}`;
  const models = ['opus', 'sonnet', 'haiku'];
  return [
    {
      name: 'clear',
      description: 'Start a new chat (this one stays in history)',
      group: 'Cherry',
      instant: true,
      run: () => void newChat(projectId, stage),
    },
    {
      name: 'stop',
      description: 'Stop Claude',
      group: 'Cherry',
      instant: true,
      run: () => void stopChat(projectId, stage),
    },
    ...(['ask', 'auto', 'plan'] as const).map((m) => ({
      name: m,
      description:
        m === 'ask'
          ? 'Ask mode: every edit and command asks first'
          : m === 'auto'
            ? 'Auto mode: runs without asking; push and serious commands still ask'
            : 'Plan mode: Claude plans and does not edit',
      group: 'Cherry' as const,
      instant: true,
      run: () => onMode(m),
    })),
    {
      name: 'model',
      description: 'Switch the model: /model opus, sonnet or haiku',
      group: 'Cherry',
      run: (args: string) => {
        const m = args.toLowerCase();
        if (models.includes(m)) {
          onModel(m);
          onError(null);
        } else onError('Use /model opus, /model sonnet or /model haiku.');
      },
    },
    {
      name: 'status',
      description: 'Open the status report',
      group: 'Cherry',
      instant: true,
      run: () => void navigate(`${base}/status`),
    },
    {
      name: 'compact',
      description: 'Summarise the conversation so far to free up context',
      group: 'Claude',
    },
    { name: 'context', description: 'Show how full the context window is', group: 'Claude' },
    {
      name: 'security-review',
      description: 'Security review of the pending changes',
      group: 'Claude',
    },
    {
      name: 'init',
      description: 'Write or update CLAUDE.md for this project',
      group: 'Claude',
      expand: (args: string) => (args ? `${INIT_PROMPT}\n\n${args}` : INIT_PROMPT),
    },
    {
      name: 'review',
      description: 'Review the changes for bugs, security and tests',
      group: 'Claude',
      expand: (args: string) => (args ? `${REVIEW_PROMPT}\n\nFocus: ${args}` : REVIEW_PROMPT),
    },
    ...skills.map((k) => ({
      name: `cherry-${stage}:${k.name}`,
      description: k.description,
      group: 'Skill' as const,
    })),
    ...project.map((c) => ({
      name: c.name,
      description: c.description,
      group: 'Project' as const,
    })),
  ];
}

/** Approve plan opens Development in Auto, where the Builder has already started (ADR-0041). */
function PlanCard({
  projectId,
  plan,
}: {
  projectId: string;
  plan: Extract<ChatItem, { kind: 'plan' }>;
}) {
  const setStage = useStages((s) => s.set);
  const setView = useSideView((s) => s.set);
  return (
    <PlanProposal
      plan={plan}
      projectId={projectId}
      onApprove={async () => {
        await approvePlan(projectId, plan.id);
        storeMode(projectId, 'development', 'auto');
        setStage(projectId, 'development');
        setView('live');
      }}
      onDismiss={async () => {
        await dismissPlan(projectId, plan.id);
      }}
    />
  );
}

/** One row for every Chrome step of a reply; Live shows them (ADR-0038). */
function ChromeRow({ items }: { items: ToolItem[] }) {
  const setView = useSideView((s) => s.set);
  const running = items.some((i) => i.status === 'running' || i.status === 'waiting');
  const failed = items.filter((i) => i.status === 'failed').length;
  const last = items.at(-1)!;
  return (
    <button type="button" className={styles.chromeRow} onClick={() => setView('live')}>
      <Globe size={13} aria-hidden="true" className={running ? styles.chromeBusy : undefined} />
      <span className={styles.chromeTitle}>
        {running ? 'Using Chrome' : 'Used Chrome'} · {items.length} step
        {items.length === 1 ? '' : 's'}
        {failed > 0 && ` · ${failed} failed`}
      </span>
      <span className={styles.chromeLast} title={last.target}>
        {last.target}
      </span>
      <span className={styles.chromeOpen}>
        Live <ChevronRight size={12} aria-hidden="true" />
      </span>
    </button>
  );
}

export function NewChatButton({
  projectId,
  stage,
  state,
}: {
  projectId: string;
  stage: Stage;
  state: ChatState | undefined;
}) {
  if (!state?.conversationId) return null;
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={() => void newChat(projectId, stage)}
      title="Start a fresh conversation"
    >
      <MessageSquarePlus size={13} aria-hidden="true" />
      New chat
    </button>
  );
}

export function useSessionMeta(state: ChatState | undefined, now: number): string | null {
  const [, force] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => force((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);
  if (!state?.conversationId || !state.startedAt) return null;
  const mins = Math.max(0, Math.round((now - state.startedAt) / 60_000));
  const dur = mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${mins % 60} min`;
  return `session ${state.turns} · ${dur}`;
}
