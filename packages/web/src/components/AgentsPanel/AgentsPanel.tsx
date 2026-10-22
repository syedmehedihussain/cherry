import { Bot, ListTodo, StickyNote, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { Agent } from '@cherry/shared';
import { ApiFailure } from '../../api/client.ts';
import { startAgent, useAgentDiff, useAgents, useLiveAgents } from '../../api/agents.ts';
import { queryClient, useConfig } from '../../api/queries.ts';
import { addTask, organiseNote, wk } from '../../api/workspace.ts';
import { AgentCard } from '../AgentCard/AgentCard.tsx';
import { ChipSelect, type ChipOption } from '../ChipSelect/ChipSelect.tsx';
import { FileDiff } from '../ApprovalCard/ApprovalCard.tsx';
import { ScanAgents } from '../ScanAgents/ScanAgents.tsx';
import styles from './AgentsPanel.module.css';

type Model = 'sonnet' | 'opus' | 'haiku';

/** Right column under the GitHub box: a timeline of agents and a task box to start one. */
export function AgentsPanel({
  projectId,
  branch,
  now,
  limit,
  onSeeAll,
  kinds,
  onDone,
}: {
  projectId: string;
  branch: string | null;
  now: number;
  /** Show only the newest few (the Overview); the rest are one click away. */
  limit?: number;
  onSeeAll?(): void;
  /** Offer Task and Note in the box as well as Agent (the Overview). */
  kinds?: boolean;
  onDone?(kind: BoxKind): void;
}) {
  const agents = useAgents(projectId);
  useLiveAgents(projectId);
  const [params] = useSearchParams();
  const focus = params.get('agent');
  const [diffOf, setDiffOf] = useState<Agent | null>(null);
  const list = agents.data?.agents ?? [];
  const shown = limit ? list.slice(0, limit) : list;
  const running = list.filter((a) => a.status === 'running' || a.status === 'waiting').length;

  useEffect(() => {
    if (!focus) return;
    document.getElementById(`agent-${focus}`)?.scrollIntoView({ block: 'nearest' });
  }, [focus, list.length]);

  return (
    <section className={styles.panel} aria-label="Agents">
      {!limit && <ScanAgents projectId={projectId} now={now} />}
      <div className={styles.feed}>
        {!limit && (
          <div className="label" style={{ padding: '8px 0 6px' }}>
            Tasks
          </div>
        )}
        {list.length === 0 ? (
          <p className={styles.empty}>
            {kinds ? 'Choose Agent in the box below to start one.' : 'Give an agent a task below.'}{' '}
            It works on its own branch while you keep chatting, and you review the diff before
            anything lands.
          </p>
        ) : (
          shown.map((a, i) => (
            <AgentCard
              key={a.id}
              agent={a}
              now={now}
              last={i === shown.length - 1}
              focus={a.id === focus}
              onReviewDiff={setDiffOf}
            />
          ))
        )}
        {shown.length < list.length && onSeeAll && (
          <button type="button" className={styles.seeAll} onClick={onSeeAll}>
            All {list.length} agents →
          </button>
        )}
      </div>
      <TaskBox
        projectId={projectId}
        branch={branch}
        full={!!agents.data && running >= agents.data.maxRunning}
        kinds={kinds}
        onDone={onDone}
      />
      {diffOf && <DiffDialog agent={diffOf} onClose={() => setDiffOf(null)} />}
    </section>
  );
}

export type BoxKind = 'task' | 'note' | 'agent';

const KIND_KEY = 'cherry.boxKind';

const KINDS: ChipOption<BoxKind>[] = [
  { value: 'task', label: 'Task', hint: 'Add it to your task list', icon: ListTodo },
  { value: 'note', label: 'Note', hint: 'Claude tidies it into your notes', icon: StickyNote },
  { value: 'agent', label: 'Agent', hint: 'Works on it in its own branch', icon: Bot },
];

const MODELS: ChipOption<Model>[] = [
  { value: 'sonnet', label: 'Sonnet', hint: 'Balanced, the usual choice' },
  { value: 'opus', label: 'Opus', hint: 'Most capable, slower' },
  { value: 'haiku', label: 'Haiku', hint: 'Fastest, for small tasks' },
];

function readKind(): BoxKind {
  try {
    const v = localStorage.getItem(KIND_KEY);
    return v === 'task' || v === 'note' || v === 'agent' ? v : 'task';
  } catch {
    return 'task';
  }
}

const KIND_TEXT: Record<BoxKind, { placeholder: string; send: string; busy: string }> = {
  task: { placeholder: 'Add a task…', send: 'Add', busy: 'Adding…' },
  note: {
    placeholder: 'Write a note. Claude tidies it into your notes…',
    send: 'Save',
    busy: 'Organising…',
  },
  agent: { placeholder: 'Give an agent a task…', send: 'Start', busy: 'Starting…' },
};

/**
 * The box at the bottom: add a task, save a note (the note-taker files it in notes.md), or
 * start an agent. `kinds` off means agents only (the Agents view).
 */
function TaskBox({
  projectId,
  branch,
  full,
  kinds,
  onDone,
}: {
  projectId: string;
  branch: string | null;
  full: boolean;
  kinds?: boolean;
  onDone?(kind: BoxKind): void;
}) {
  const [text, setText] = useState('');
  const [chosen, setChosen] = useState<BoxKind>(readKind);
  const kind: BoxKind = kinds ? chosen : 'agent';
  const fallback = useConfig().data?.claude.defaultModel;
  const [picked, setModel] = useState<Model | null>(null);
  // The model from Settings until the user picks one here (Opus out of the box).
  const model: Model =
    picked ?? (fallback === 'sonnet' || fallback === 'haiku' ? fallback : 'opus');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = text.trim().length >= (kind === 'agent' ? 3 : 1) && !busy;
  const words = KIND_TEXT[kind];

  const choose = (k: BoxKind) => {
    setChosen(k);
    setError(null);
    try {
      localStorage.setItem(KIND_KEY, k);
    } catch {
      // Private window: the choice just isn't remembered.
    }
  };

  const start = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    const value = text.trim();
    try {
      if (kind === 'task') {
        queryClient.setQueryData(wk.tasks(projectId), await addTask(projectId, value));
      } else if (kind === 'note') {
        const res = await organiseNote(projectId, value);
        queryClient.setQueryData(wk.notes(projectId), { content: res.content, mtime: res.mtime });
      } else {
        await startAgent(projectId, { task: value, model });
      }
      setText('');
      onDone?.(kind);
    } catch (e) {
      setError(
        e instanceof ApiFailure
          ? e.message
          : kind === 'agent'
            ? 'Could not start the agent.'
            : kind === 'note'
              ? 'Could not save the note.'
              : 'Could not add the task.',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className={styles.box}
      aria-label={kinds ? 'Quick add' : 'New agent'}
      onSubmit={(e) => {
        e.preventDefault();
        void start();
      }}
    >
      <textarea
        className={styles.text}
        rows={2}
        value={text}
        aria-label={kind === 'note' ? 'Note' : 'Task'}
        placeholder={words.placeholder}
        title={
          kind === 'agent'
            ? `Starts from your last commit${branch ? ` on ${branch}` : ''}, in its own worktree. It runs on its own: push, publish and rm -r are left for you.`
            : kind === 'note'
              ? 'Claude cleans up the note and adds it under the right heading in _project/notes.md. Your other notes stay as they are.'
              : 'Adds a task to _project/tasks.json.'
        }
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void start();
          }
        }}
      />
      {full && kind === 'agent' && (
        <p className={styles.hint}>All agent slots are busy, so it will wait in the queue.</p>
      )}
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.row}>
        {kinds && (
          <ChipSelect label="Type" value={kind} options={KINDS} onChange={choose} disabled={busy} />
        )}
        {kind === 'agent' && (
          <ChipSelect label="Model" value={model} options={MODELS} onChange={(m) => setModel(m)} />
        )}
        <span className={styles.spacer} />
        <button type="submit" className={styles.send} disabled={!ready}>
          {busy ? words.busy : words.send}
        </button>
      </div>
    </form>
  );
}

function DiffDialog({ agent, onClose }: { agent: Agent; onClose(): void }) {
  const diff = useAgentDiff(agent.id);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Diff of ${agent.branch}`}
        className={styles.dialog}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.dialogHead}>
          <div>
            <h3>{agent.task}</h3>
            <span className={styles.hint}>
              <span className="mono">{agent.branch}</span> →{' '}
              <span className="mono">{agent.baseBranch}</span>
            </span>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
        <div className={styles.dialogBody}>
          {diff.isPending && <span className="shimmer" style={{ height: 120 }} />}
          {diff.data?.files.length === 0 && <p className={styles.hint}>No changes.</p>}
          {diff.data?.files.map((f) => (
            <FileDiff key={f.path} file={f} defaultOpen />
          ))}
        </div>
      </div>
    </div>
  );
}
