import { FileText, MessageSquarePlus, RotateCcw } from 'lucide-react';
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ChatModeSchema,
  type ChatItem,
  type ChatMode,
  type ChatState,
  type Effort,
} from '@cherry/shared';
import { ApiFailure } from '../../api/client.ts';
import {
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
} from '../../api/chat.ts';
import { queryClient } from '../../api/queries.ts';
import { ApprovalCard } from '../../components/ApprovalCard/ApprovalCard.tsx';
import { ChangeSummary } from '../../components/ChangeSummary/ChangeSummary.tsx';
import { Composer } from '../../components/Composer/Composer.tsx';
import { DecisionCard } from '../../components/DecisionCard/DecisionCard.tsx';
import { DecisionInChat } from '../../components/Decisions/Decisions.tsx';
import { Markdown } from '../../components/Markdown/Markdown.tsx';
import { ReadGroup, TimelineRow, type ToolItem } from '../../components/Timeline/Timeline.tsx';
import styles from './Chat.module.css';

type Block =
  | { t: 'user'; item: Extract<ChatItem, { kind: 'user' }> }
  | { t: 'claude'; id: string; parts: Part[] };

type Part =
  | { t: 'text'; item: Extract<ChatItem, { kind: 'text' }> }
  | { t: 'tools'; items: ToolItem[] }
  | { t: 'decision'; item: Extract<ChatItem, { kind: 'decision' }> }
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
    } else if (item.kind === 'tool') {
      if (last?.t === 'tools') last.items.push(item);
      else claude.parts.push({ t: 'tools', items: [item] });
    } else if (item.kind === 'decision') claude.parts.push({ t: 'decision', item });
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

const modeKey = (projectId: string) => `cherry.chatMode.${projectId}`;

/** The chat mode is remembered per project; Ask when nothing is stored. */
function readMode(projectId: string): ChatMode {
  try {
    return ChatModeSchema.catch('ask').parse(localStorage.getItem(modeKey(projectId)));
  } catch {
    return 'ask';
  }
}

function storeMode(projectId: string, mode: ChatMode): void {
  try {
    localStorage.setItem(modeKey(projectId), mode);
  } catch {
    // Private window: the mode just isn't remembered.
  }
}

interface ChatTabProps {
  projectId: string;
  now: number;
}

export function ChatTab({ projectId, now }: ChatTabProps) {
  const chat = useChat(projectId);
  const draft = useChatDraft((s) => s.drafts[projectId]);
  const setDraft = useChatDraft((s) => s.set);
  const [model, setModel] = useState<string | null>(null);
  const [effort, setEffort] = useState<Effort | null>(null);
  const [mode, setMode] = useState<{ projectId: string; mode: ChatMode }>(() => ({
    projectId,
    mode: readMode(projectId),
  }));
  // Another project: load its mode while rendering, so the menu never shows the old one.
  if (mode.projectId !== projectId) setMode({ projectId, mode: readMode(projectId) });
  const changeMode = (m: ChatMode) => {
    storeMode(projectId, m);
    setMode({ projectId, mode: m });
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
      await sendChat(projectId, text, chatMode, m, attachments, effort ?? undefined);
      if (!state?.conversationId)
        await queryClient.invalidateQueries({ queryKey: chatKey(projectId) });
      return true;
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : 'Could not send the message.');
      return false;
    }
  };

  const lastUserText = [...items].reverse().find((i) => i.kind === 'user')?.text;

  return (
    <div className={styles.chat}>
      <div className={styles.scroll} ref={scroller} onScroll={onScroll}>
        <div className={styles.thread}>
          {chat.isPending && <span className="shimmer" style={{ height: 80 }} />}
          {state && items.length === 0 && <EmptyChat mode={mode.mode} />}
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
          onStop={() => void stopChat(projectId)}
          onUpload={(file) => uploadAttachment(projectId, file)}
          onDiscard={(file) => void discardAttachment(projectId, file).catch(() => undefined)}
          onModel={setModel}
          onEffort={setEffort}
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

function EmptyChat({ mode }: { mode: ChatMode }) {
  return (
    <div className={styles.empty}>
      <h2>Start a conversation</h2>
      <p>Ask Claude to look into something or describe the next task. {MODE_NOTE[mode]}</p>
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
                  {toolRuns(p.items).map((r, i, all) =>
                    Array.isArray(r) ? (
                      <ReadGroup key={r[0]!.id} items={r} />
                    ) : (
                      <TimelineRow key={r.id} item={r} last={i === all.length - 1} />
                    ),
                  )}
                </div>
                {/* A big choice Claude proposed: approve it right here (ADR-0029). */}
                {proposals(p.items).map((n) => (
                  <DecisionInChat key={n} projectId={projectId} number={n} />
                ))}
              </Fragment>
            );
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

export function NewChatButton({
  projectId,
  state,
}: {
  projectId: string;
  state: ChatState | undefined;
}) {
  if (!state?.conversationId) return null;
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={() => void newChat(projectId)}
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
