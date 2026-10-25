import { FileText, History, RotateCcw, Undo2 } from 'lucide-react';
import { create } from 'zustand';
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
  relativeTime,
  type ChatItem,
  type ChatMode,
  type ChatState,
  type Effort,
  type Stage,
  AUTOPILOT_STAGES,
  type AutopilotStage,
} from '@cherry/shared';
import { ApiFailure } from '../../api/client.ts';
import {
  approvePlan,
  dismissPlan,
  answerApproval,
  answerDecision,
  chatKey,
  newChat,
  resumeChat,
  rewindChat,
  sendChat,
  stopChat,
  uploadAttachment,
  discardAttachment,
  attachmentLabel,
  attachmentUrl,
  isImageFile,
  useChat,
  useChatDraft,
  useChatHistory,
  useProjectCommands,
} from '../../api/chat.ts';
import { queryClient } from '../../api/queries.ts';
import { searchFiles } from '../../api/workspace.ts';
import { stageInfo, useStageInfo } from '../../api/stages.ts';
import {
  CcAnswered,
  CcFold,
  CcPrompt,
  CcSpinner,
  CcText,
  CcThinking,
  CcTool,
  CcUser,
} from '../../components/ClaudeCode/ClaudeCode.tsx';
import { elapsed } from '../../components/ClaudeCode/cli.ts';
import { ChangeSummary } from '../../components/ChangeSummary/ChangeSummary.tsx';
import { Composer, type SlashCommand } from '../../components/Composer/Composer.tsx';
import { DecisionCard } from '../../components/DecisionCard/DecisionCard.tsx';
import { DecisionInChat } from '../../components/Decisions/Decisions.tsx';
import { Markdown } from '../../components/Markdown/Markdown.tsx';
import { stepsSummary, type ToolItem } from '../../components/Timeline/Timeline.tsx';
import { PlanProposal } from '../../components/PlanProposal/PlanProposal.tsx';
import { useStages } from '../../state/stage.ts';
import { useSideView } from './SidePanel.tsx';
import { NextStageChip, StuckHint } from './StageHints.tsx';
import {
  AutopilotReport,
  MagnetAsk,
  MagnetBusy,
  MagnetEvent,
  MagnetOrder,
  flying,
  taskCount,
} from '../../components/Autopilot/Autopilot.tsx';
import {
  dismissAutopilot,
  startAutopilot,
  stopAutopilot,
  useAutopilot,
} from '../../api/autopilot.ts';
import styles from './Chat.module.css';

type Block =
  | { t: 'user'; item: Extract<ChatItem, { kind: 'user' }> }
  | { t: 'claude'; id: string; parts: Part[] };

type ThinkingItem = Extract<ChatItem, { kind: 'thinking' }>;

type Part =
  | { t: 'text'; item: Extract<ChatItem, { kind: 'text' }> }
  /** All of a reply's thinking as one row at its top, like the CLI (V2.1 w7.4). */
  | { t: 'thinking'; items: ThinkingItem[] }
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
    } else if (item.kind === 'thinking') {
      const thinking = claude.parts[0];
      if (thinking?.t === 'thinking') thinking.items.push(item);
      else claude.parts.unshift({ t: 'thinking', items: [item] });
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

/** When a Claude block began: its first item's time. */
function firstAt(b: Extract<Block, { t: 'claude' }>): number {
  const p = b.parts[0];
  if (!p) return 0;
  if (p.t === 'thinking' || p.t === 'tools' || p.t === 'chrome') return p.items[0]!.at;
  return p.item.at;
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
  /** Opens a file the agent wrote (the Plan reader, an editor tab). */
  onOpenFile?: (path: string) => void;
}

export function ChatTab({ projectId, stage, now, onOpenFile }: ChatTabProps) {
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
  const lastUser = items.findLast((i) => i.kind === 'user');
  const turnStart = lastUser?.at;
  const turnSeed = lastUser?.id ?? 'turn';
  const agentName = stageInfo(useStageInfo().data, stage)?.name;
  // Autopilot (ADR-0046): Magnet flies Plan, Design and Development.
  const apStage = (AUTOPILOT_STAGES as readonly Stage[]).includes(stage)
    ? (stage as AutopilotStage)
    : null;
  const ap = useAutopilot(projectId, apStage).data;
  const apFlying = flying(ap);
  const apAsking = ap?.status === 'asking';
  // Esc stops Magnet (after the current step) or cancels his question.
  useEffect(() => {
    if (!apStage || (!apFlying && !apAsking)) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (apFlying) void stopAutopilot(projectId, apStage).catch(() => undefined);
      else void dismissAutopilot(projectId, apStage).catch(() => undefined);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [apStage, apFlying, apAsking, projectId]);
  const setStages = useStages((st) => st.set);
  const sideView = useSideView((st) => st.set);
  // Magnet's own lines, placed between the turns by time.
  const events = ap?.events ?? [];
  const starts = blocks.map((b) => (b.t === 'user' ? b.item.at : b.parts.length ? firstAt(b) : 0));
  const eventsAfter = (i: number) =>
    events.filter((e) => e.at >= (starts[i] ?? 0) && e.at < (starts[i + 1] ?? Infinity));

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
  // Rewind (V2.1 w7.9): the message whose rewind panel is open, and what the last rewind did.
  const [rewindAt, setRewindAt] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const lastEnd = items.findLast((i) => i.kind === 'turn-end');
  const sentTexts = useMemo(
    () => items.flatMap((i) => (i.kind === 'user' && i.text.trim() ? [i.text] : [])),
    [items],
  );
  const context = lastEnd?.kind === 'turn-end' ? (lastEnd.context ?? null) : null;
  const findFiles = useCallback((q: string) => searchFiles(projectId, q), [projectId]);
  const commands = useSlashCommands({
    projectId,
    stage,
    onRewind: () => {
      const last = items.findLast((i) => i.kind === 'user');
      if (last) setRewindAt(last.id);
      else setError('There is no message to rewind to yet.');
    },
    onMode: changeMode,
    onModel: setModel,
    onError: setError,
  });

  return (
    <div className={styles.chat}>
      <ChatHistoryMenu projectId={projectId} stage={stage} state={state} now={now} />
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
          {events
            .filter((e) => e.at < (starts[0] ?? Infinity))
            .map((e) => (
              <MagnetEvent key={`ev-${e.at}`} event={e} />
            ))}
          {blocks.map((b, bi) => (
            <Fragment key={b.t === 'user' ? b.item.id : b.id}>
              {b.t === 'user' && b.item.by === 'magnet' ? (
                <MagnetOrder
                  text={b.item.text}
                  role={b.item.role}
                  source={b.item.source}
                  agent={agentName ?? 'agent'}
                />
              ) : b.t === 'user' ? (
                <div key={b.item.id} className={styles.userBlock}>
                  <CcUser
                    actions={
                      !state?.running &&
                      rewindAt !== b.item.id && (
                        <button
                          type="button"
                          className={styles.rewindBtn}
                          aria-label="Rewind to before this message"
                          title="Rewind to before this message"
                          onClick={() => setRewindAt(b.item.id)}
                        >
                          <Undo2 size={13} aria-hidden="true" />
                        </button>
                      )
                    }
                  >
                    <span>
                      {b.item.attachments && b.item.attachments.length > 0 && (
                        <Attachments projectId={projectId} files={b.item.attachments} />
                      )}
                      {b.item.text}
                    </span>
                  </CcUser>
                  {rewindAt === b.item.id && (
                    <RewindPanel
                      hasCheckpoint={!!b.item.checkpoint}
                      onCancel={() => setRewindAt(null)}
                      onRewind={async (code, chat) => {
                        const r = await rewindChat(projectId, stage, {
                          itemId: b.item.id,
                          code,
                          chat,
                        });
                        setRewindAt(null);
                        if (chat) setDraft(projectId, r.text);
                        setNotice(
                          [
                            chat ? 'Rewound the chat; your message is back in the box.' : null,
                            code
                              ? r.files.length
                                ? `Put back ${r.files.length} file${r.files.length === 1 ? '' : 's'}: ${r.files.join(', ')}.`
                                : 'No files had changed since that message.'
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' '),
                        );
                      }}
                    />
                  )}
                </div>
              ) : (
                <ClaudeBlock
                  key={b.id}
                  projectId={projectId}
                  block={b}
                  now={now}
                  running={!!state?.running}
                  streamingId={state?.running && lastItem?.kind === 'text' ? lastItem.id : null}
                  onOpenFile={onOpenFile}
                  onRetry={
                    lastUserText
                      ? () => void send(lastUserText, mode.mode, model ?? state?.model ?? 'opus')
                      : undefined
                  }
                />
              )}
              {eventsAfter(bi).map((e) => (
                <MagnetEvent key={`ev-${e.at}`} event={e} />
              ))}
            </Fragment>
          ))}
          {ap && apAsking && (
            <MagnetAsk projectId={projectId} state={ap} agent={agentName ?? 'agent'} />
          )}
          {ap && apFlying && !state?.running && <MagnetBusy state={ap} now={now} />}
          {ap?.report && (
            <AutopilotReport
              projectId={projectId}
              state={ap}
              onChange={(adr, title) =>
                setDraft(projectId, `Change ADR-${String(adr).padStart(4, '0')} (${title}): `)
              }
              onOpenStage={(s2) => setStages(projectId, s2)}
              onNeedsYou={(n) => sideView(/^Push/.test(n) ? 'github' : 'overview')}
            />
          )}
          {state && !state.running && items.length > 0 && !apFlying && !apAsking && (
            <>
              <StuckHint
                projectId={projectId}
                stage={stage}
                items={items}
                onRewind={() => {
                  const last = items.findLast((i) => i.kind === 'user');
                  if (last) setRewindAt(last.id);
                }}
              />
              <NextStageChip projectId={projectId} stage={stage} />
            </>
          )}
          {state?.running && !paused && <CcSpinner since={turnStart ?? now} seed={turnSeed} />}
        </div>
      </div>
      <div className={styles.composer}>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className={styles.notice} role="status">
            {notice}
            <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)}>
              ×
            </button>
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
          onSend={
            apAsking && apStage
              ? async (text) => {
                  try {
                    await startAutopilot(projectId, apStage, text);
                    return true;
                  } catch (e) {
                    setError(e instanceof ApiFailure ? e.message : 'Could not start Autopilot.');
                    return false;
                  }
                }
              : send
          }
          disabled={apFlying ? 'Magnet is flying. Click the pill or press Esc to stop him.' : null}
          autopilotLine={
            apAsking
              ? 'autopilot · waiting for you · nothing runs until you answer · esc cancels'
              : apFlying && ap
                ? [
                    'autopilot',
                    ap.goal,
                    taskCount(ap) && `task ${taskCount(ap)}`,
                    ap.decisions.length &&
                      `${ap.decisions.length} decision${ap.decisions.length === 1 ? '' : 's'}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : undefined
          }
          onStop={() => void stopChat(projectId, stage)}
          onUpload={(file) => uploadAttachment(projectId, file)}
          onDiscard={(file) => void discardAttachment(projectId, file).catch(() => undefined)}
          onModel={setModel}
          onEffort={setEffort}
          commands={commands}
          searchFiles={findFiles}
          context={context}
          history={sentTexts}
          onCompact={() => void send('/compact', mode.mode, model ?? state?.model ?? 'opus')}
          placeholder={
            apAsking ? 'Tell Magnet the job' : agentName ? `Reply to the ${agentName}` : undefined
          }
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

/** The stage's agent introduces itself, like the CLI's welcome box (ADR-0034). */
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
      <div className={styles.welcome}>
        <h2>{agent ? `${agent.label}: the ${agent.name}` : 'Start a conversation'}</h2>
        <p>
          {agent?.summary ?? 'Ask Claude to look into something or describe the next task.'}{' '}
          {agent?.docsOnly && 'It writes docs and notes only, never code. '}
        </p>
        <p className={styles.welcomeMode}>{MODE_NOTE[mode]}</p>
      </div>
      {!!agent?.skills.length && (
        <div className={styles.skillsWrap}>
          <span className={styles.skillsLabel}>Skills</span>
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
        </div>
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
  onOpenFile,
}: {
  projectId: string;
  block: Extract<Block, { t: 'claude' }>;
  now: number;
  running: boolean;
  streamingId: string | null;
  onRetry?: () => void;
  onOpenFile?: (path: string) => void;
}) {
  const firstPending = block.parts.find(
    (p) => p.t === 'approval' && p.item.approval.status === 'pending',
  );
  const end = block.parts.find((p) => p.t === 'end')?.item;
  const tools = block.parts.flatMap((p) => (p.t === 'tools' ? p.items : []));
  const lastTools = block.parts.findLast((p) => p.t === 'tools');
  // An allowed edit shows its diff under the call, as the CLI does.
  const diffs = new Map(
    block.parts.flatMap((p) =>
      p.t === 'approval' && p.item.approval.kind === 'edit'
        ? [[p.item.approval.id, p.item.approval.files] as const]
        : [],
    ),
  );
  const row = (t: ToolItem) => (
    <CcTool
      key={t.id}
      item={t}
      diff={t.approvalId ? diffs.get(t.approvalId) : undefined}
      extra={
        onOpenFile && t.tool === 'Write' && t.status === 'ok' ? (
          <FileLine path={t.target} onOpen={() => onOpenFile(t.target)} />
        ) : undefined
      }
    />
  );
  /** Rows for a run of steps: reads of 3+ fold into one line, the rest one row each. */
  const rowsOf = (list: ToolItem[]) =>
    toolRuns(list).map((r) =>
      Array.isArray(r) ? (
        <CcFold key={r[0]!.id} summary={`Read ${r.length} files`}>
          {r.map(row)}
        </CcFold>
      ) : (
        row(r)
      ),
    );
  /**
   * Calmer chat (V2.1 w6): finished steps fold into one line. While Claude works, only the
   * newest few steps show as rows; anything waiting for you always shows.
   */
  const LIVE_ROWS = 3;
  const renderTools = (list: ToolItem[], live: boolean) => {
    const keep = list.findIndex((i) => i.status === 'waiting' || i.status === 'running');
    // Done: the last two steps stay as rows under the fold, as the CLI leaves them.
    const cut = live
      ? Math.max(0, Math.min(keep < 0 ? list.length : keep, list.length - LIVE_ROWS))
      : list.length >= 4
        ? list.length - 2
        : 0;
    const folded = list.slice(0, cut);
    const shown = list.slice(cut);
    const took = folded.reduce((ms, t) => ms + (t.durationMs ?? 0), 0);
    return (
      <>
        {folded.length >= 2 ? (
          <CcFold
            summary={`${stepsSummary(folded)}${took >= 1000 ? ` · ${elapsed(took)}` : ''}`}
            failed={folded.filter((i) => i.status === 'failed').length}
          >
            {rowsOf(folded)}
          </CcFold>
        ) : (
          rowsOf(folded)
        )}
        {rowsOf(shown)}
      </>
    );
  };
  return (
    <div className={styles.claude}>
      {block.parts.map((p) => {
        switch (p.t) {
          case 'text':
            return (
              <CcText key={p.item.id}>
                <div className={styles.text}>
                  <Markdown source={p.item.text} variant="cli" />
                  {p.item.id === streamingId && (
                    <span className={styles.cursor} aria-hidden="true" />
                  )}
                </div>
              </CcText>
            );
          case 'tools':
            return (
              <Fragment key={p.items[0]!.id}>
                {renderTools(p.items, !end && p === lastTools)}
                {/* A big choice Claude proposed: approve it right here (ADR-0029). */}
                {proposals(p.items).map((n) => (
                  <div key={n} className={styles.card}>
                    <DecisionInChat projectId={projectId} number={n} />
                  </div>
                ))}
              </Fragment>
            );
          case 'thinking':
            return <ThinkingRow key={p.items[0]!.id} items={p.items} now={now} />;
          case 'chrome':
            return <ChromeRow key={p.items[0]!.id} items={p.items} />;
          case 'plan':
            return (
              <div key={p.item.id} className={styles.card}>
                <PlanCard projectId={projectId} plan={p.item} />
              </div>
            );
          case 'decision':
            return (
              <div key={p.item.id} className={styles.card}>
                <DecisionCard
                  card={p.item.card}
                  state={
                    p.item.status === 'open' ? (running ? 'open' : 'cancelled') : p.item.status
                  }
                  answer={p.item.answer}
                  onConfirm={async (a) => {
                    await answerDecision(p.item.id, a);
                  }}
                />
              </div>
            );
          case 'approval':
            return p.item.approval.status === 'pending' ? (
              <CcPrompt
                key={p.item.id}
                approval={p.item.approval}
                autoFocus={p === firstPending}
                onAnswer={async (answer, reason) => {
                  await answerApproval(p.item.approval.id, {
                    answer,
                    ...(reason ? { reason } : {}),
                  });
                }}
              />
            ) : (
              <CcAnswered key={p.item.id} approval={p.item.approval} />
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
                    <button type="button" className={styles.retry} onClick={onRetry}>
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

/** A file the agent wrote: one line with Open (V3, artboard 01). */
function FileLine({ path, onOpen }: { path: string; onOpen(): void }) {
  return (
    <div className={styles.fileLine}>
      <FileText size={13} aria-hidden="true" />
      <span className={styles.fileName}>{path.split('/').pop()}</span>
      <span className={styles.filePath}>{path}</span>
      <button
        type="button"
        className={styles.fileOpen}
        onClick={onOpen}
        aria-label={`Open ${path}`}
      >
        Open
      </button>
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
  onRewind,
  onMode,
  onModel,
  onError,
}: {
  projectId: string;
  stage: Stage;
  onRewind(): void;
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
      name: 'resume',
      description: 'Open an earlier chat of this stage',
      group: 'Cherry',
      instant: true,
      run: () => useHistoryMenu.getState().set(true),
    },
    {
      name: 'rewind',
      description: 'Go back to before your last message: the code, the chat or both',
      group: 'Cherry',
      instant: true,
      run: onRewind,
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
      name: 'permissions',
      description: 'See and remove what you chose to Always allow',
      group: 'Cherry',
      instant: true,
      run: () => void navigate('/settings/permissions'),
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
  return (
    <PlanProposal
      plan={plan}
      projectId={projectId}
      onApprove={async () => {
        await approvePlan(projectId, plan.id);
        storeMode(projectId, 'development', 'auto');
        setStage(projectId, 'development');
      }}
      onDismiss={async () => {
        await dismissPlan(projectId, plan.id);
      }}
    />
  );
}

/** Rewind to before a message, like the CLI's Esc Esc (V2.1 w7.9). */
function RewindPanel({
  hasCheckpoint,
  onCancel,
  onRewind,
}: {
  hasCheckpoint: boolean;
  onCancel(): void;
  onRewind(code: boolean, chat: boolean): Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (code: boolean, chat: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await onRewind(code, chat);
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : 'Could not rewind.');
      setBusy(false);
    }
  };
  return (
    <div className={styles.rewind} role="group" aria-label="Rewind">
      <p className={styles.rewindTitle}>Rewind to before this message?</p>
      <p className={styles.rewindNote}>
        {hasCheckpoint
          ? 'Code puts back the files Claude edited since. Changes made by commands stay. Chat removes this message and everything after it, and Claude forgets them.'
          : 'This message has no checkpoint, so only the chat can go back.'}
      </p>
      {error && (
        <p className={styles.rewindError} role="alert">
          {error}
        </p>
      )}
      <div className={styles.rewindActions}>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy || !hasCheckpoint}
          onClick={() => void run(true, true)}
        >
          Code and chat
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={busy}
          onClick={() => void run(false, true)}
        >
          Chat only
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={busy || !hasCheckpoint}
          onClick={() => void run(true, false)}
        >
          Code only
        </button>
        <span className={styles.spacer} />
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

const seconds = (ms: number) => `${Math.max(1, Math.round(ms / 1000))}s`;

/** "✻ Thought for 12s", folded; a click shows what Claude thought (V2.1 w7.4). */
function ThinkingRow({ items, now }: { items: ThinkingItem[]; now: number }) {
  const thinking = items.some((i) => i.durationMs === null);
  const ms = items.reduce((sum, i) => sum + (i.durationMs ?? now - i.at), 0);
  const text = items
    .map((i) => i.text.trim())
    .filter(Boolean)
    .join('\n\n');
  return (
    <CcThinking label={thinking ? 'Thinking…' : `Thought for ${seconds(ms)}`} busy={thinking}>
      {text ? <Markdown source={text} variant="cli" /> : undefined}
    </CcThinking>
  );
}

/** One row for every Chrome step of a reply; Live shows them (ADR-0038). */
function ChromeRow({ items }: { items: ToolItem[] }) {
  const setView = useSideView((s) => s.set);
  const running = items.some((i) => i.status === 'running' || i.status === 'waiting');
  const failed = items.filter((i) => i.status === 'failed').length;
  const last = items.at(-1)!;
  return (
    <div className={styles.chromeRow} data-running={running || undefined}>
      <button type="button" className={styles.chromeBtn} onClick={() => setView('live')}>
        <span className={styles.chromeTitle}>
          {running ? 'Using Chrome' : 'Used Chrome'} · {items.length} step
          {items.length === 1 ? '' : 's'}
          {failed > 0 && ` · ${failed} failed`}
        </span>
        <span className={styles.chromeOpen}>Live ›</span>
      </button>
      <span className={styles.chromeLast} title={last.target}>
        ⎿ {last.target}
      </span>
    </div>
  );
}

/** Whether the History menu is open; /resume opens it too. */
export const useHistoryMenu = create<{ open: boolean; set(open: boolean): void }>((set) => ({
  open: false,
  set: (open) => set({ open }),
}));

/** Earlier chats of the stage, from /resume or the palette; a click opens one (V2.1 w7.6). */
function ChatHistoryMenu(props: {
  projectId: string;
  stage: Stage;
  state: ChatState | undefined;
  now: number;
}) {
  const { open, set } = useHistoryMenu();
  const close = useCallback(() => set(false), [set]);
  useEffect(() => close, [props.projectId, props.stage, close]);
  // Mounted only while open, so an old error never shows again.
  return open ? <HistoryList {...props} onClose={close} /> : null;
}

function HistoryList({
  projectId,
  stage,
  state,
  now,
  onClose,
}: {
  projectId: string;
  stage: Stage;
  state: ChatState | undefined;
  now: number;
  onClose(): void;
}) {
  const history = useChatHistory(projectId, stage, true);
  const [error, setError] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: ['chat-history', projectId, stage] });
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent ? e.key === 'Escape' : !wrap.current?.contains(e.target as Node)
      )
        onClose();
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [onClose, projectId, stage]);
  const sessions = history.data ?? [];
  return (
    <div className={styles.history} role="menu" aria-label="Chat history" ref={wrap}>
      <div className={styles.historyHead}>
        <History size={13} aria-hidden="true" />
        Resume a chat of this stage
      </div>
      {history.isPending && <span className={styles.historyEmpty}>Loading…</span>}
      {history.isSuccess && sessions.length === 0 && (
        <span className={styles.historyEmpty}>No chats in this stage yet.</span>
      )}
      {sessions.map((s) => (
        <button
          key={s.id}
          type="button"
          role="menuitemradio"
          aria-checked={s.current}
          disabled={s.current || !!state?.running}
          onClick={async () => {
            try {
              await resumeChat(projectId, stage, s.id);
              onClose();
            } catch (e) {
              setError(e instanceof ApiFailure ? e.message : 'Could not open that chat.');
            }
          }}
        >
          <span className={styles.historyTitle}>{s.title}</span>
          <span className={styles.historyMeta}>
            {s.current ? 'open now' : relativeTime(s.startedAt, now)}
          </span>
        </button>
      ))}
      {state?.running && (
        <span className={styles.historyEmpty}>Stop Claude to open another chat.</span>
      )}
      {error && (
        <span className={styles.historyError} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
