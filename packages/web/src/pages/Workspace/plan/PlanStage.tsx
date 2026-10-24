import {
  ChevronDown,
  CircleCheck,
  CircleDashed,
  Copy,
  FileText,
  Maximize,
  MessageCircle,
  Pencil,
  RefreshCw,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { create } from 'zustand';
import { relativeTime } from '@cherry/shared';
import { ApiFailure } from '../../../api/client.ts';
import { useChat, useChatDraft } from '../../../api/chat.ts';
import { saveFile, useDocs, useFile } from '../../../api/workspace.ts';
import { Markdown } from '../../../components/Markdown/Markdown.tsx';
import { ChatTab } from '../ChatTab.tsx';
import { planDocRows, quoteFor, writingNow, type PlanDocRow } from './planDocs.ts';
import styles from './PlanStage.module.css';

/** The open document per project, and whether the list is folded. */
const usePlanPanel = create<{
  open: Record<string, string | undefined>;
  folded: boolean;
  setOpen(id: string, path: string): void;
  fold(folded: boolean): void;
}>((set) => ({
  open: {},
  folded: false,
  setOpen: (id, path) => set((s) => ({ open: { ...s.open, [id]: path } })),
  fold: (folded) => set({ folded }),
}));

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

/**
 * Plan (V3 r3, artboard 01): a Claude chat that writes documents. The chat in the centre; the
 * Documents panel on the right ticks each document when it is written and reads the open one.
 */
export function PlanStage({
  projectId,
  now,
  onOpenFile,
}: {
  projectId: string;
  now: number;
  onOpenFile(path: string): void;
}) {
  const docs = useDocs(projectId).data;
  const items = useChat(projectId, 'plan').data?.items;
  const writing = useMemo(() => writingNow(items ?? []), [items]);
  const { rows, more } = useMemo(() => planDocRows(docs, writing), [docs, writing]);
  const openPath = usePlanPanel((s) => s.open[projectId]);
  const setOpen = usePlanPanel((s) => s.setOpen);
  // The PRD first, or the first document that exists.
  const shown = openPath ?? [...rows, ...more].find((r) => r.open)?.open ?? null;
  const known = new Set([...rows, ...more].flatMap((r) => (r.open ? [r.open] : [])));
  const openDoc = useCallback(
    (path: string) => {
      // Documents open in the panel; any other file in the editor view.
      if (/\.md$/i.test(path)) setOpen(projectId, path);
      else onOpenFile(path);
    },
    [setOpen, projectId, onOpenFile],
  );

  return (
    <div className={styles.plan}>
      <div className={styles.chat}>
        <ChatTab projectId={projectId} stage="plan" now={now} onOpenFile={openDoc} />
      </div>
      <DocsPanel
        projectId={projectId}
        rows={rows}
        more={more}
        shown={shown}
        onOpen={(p) => setOpen(projectId, p)}
        now={now}
        unknown={!!shown && !known.has(shown)}
      />
    </div>
  );
}

function StateIcon({ state }: { state: PlanDocRow['state'] }) {
  if (state === 'written')
    return <CircleCheck size={15} className={styles.ok} aria-label="written" />;
  if (state === 'writing')
    return <RefreshCw size={15} className={styles.busy} aria-label="writing now" />;
  return <CircleDashed size={15} className={styles.todo} aria-label="not written yet" />;
}

function DocsPanel({
  projectId,
  rows,
  more,
  shown,
  onOpen,
  now,
  unknown,
}: {
  projectId: string;
  rows: PlanDocRow[];
  more: PlanDocRow[];
  shown: string | null;
  onOpen(path: string): void;
  now: number;
  /** The open file is not in the list (opened from the chat). */
  unknown: boolean;
}) {
  const folded = usePlanPanel((s) => s.folded);
  const fold = usePlanPanel((s) => s.fold);
  const written = rows.filter((r) => r.state === 'written').length;
  const row = (r: PlanDocRow) => {
    const selected = !!r.open && r.open === shown;
    return (
      <li key={r.id}>
        <button
          type="button"
          className={styles.row}
          aria-current={selected || undefined}
          disabled={!r.open}
          title={r.open ? `Open ${r.open}` : `${r.label} is not written yet`}
          onClick={() => r.open && onOpen(r.open)}
        >
          <StateIcon state={r.state} />
          <span className={styles.label}>{r.label}</span>
          <span className={styles.path}>{r.state === 'writing' ? 'writing…' : r.path}</span>
        </button>
      </li>
    );
  };
  return (
    <aside className={styles.panel} aria-label="Documents">
      <header className={styles.head}>
        <span className={styles.title}>Documents</span>
        <span className={styles.count}>
          {written} of {rows.length}
        </span>
        <span className={styles.grow} />
        <button
          type="button"
          className={styles.icon}
          aria-label={folded ? 'Show the document list' : 'Hide the document list'}
          aria-expanded={!folded}
          onClick={() => fold(!folded)}
        >
          <ChevronDown
            size={15}
            aria-hidden="true"
            style={{ transform: folded ? 'rotate(-90deg)' : undefined }}
          />
        </button>
      </header>
      {!folded && (
        <ul className={styles.list} aria-label="Plan documents">
          {rows.map(row)}
          {more.length > 0 && <li className={styles.moreHead}>More</li>}
          {more.map(row)}
        </ul>
      )}
      {shown ? (
        <DocReader key={shown} projectId={projectId} path={shown} now={now} extra={unknown} />
      ) : (
        <p className={styles.empty}>
          Nothing written yet. Tell the Planner what you want to build; each document shows here
          when it is written.
        </p>
      )}
    </aside>
  );
}

/**
 * The open document: rendered Markdown, Edit in the built-in editor (rule 5, ADR-0021), and
 * Ask about this for a selection.
 */
function DocReader({
  projectId,
  path,
  now,
  extra,
}: {
  projectId: string;
  path: string;
  now: number;
  extra: boolean;
}) {
  const file = useFile(projectId, path);
  const navigate = useNavigate();
  const setDraft = useChatDraft((s) => s.set);
  const [draft, setText] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [ask, setAsk] = useState<{ text: string; top: number; left: number } | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const content = file.data?.content ?? '';
  const editing = draft !== null;
  const dirty = editing && draft !== content;

  const askAbout = useCallback(
    (text: string) => {
      setDraft(projectId, quoteFor(path, text));
      setAsk(null);
      window.getSelection()?.removeAllRanges();
    },
    [projectId, path, setDraft],
  );
  // Ctrl+L sends the selection to the composer, like the artboard's hint.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!ask || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'l') return;
      e.preventDefault();
      askAbout(ask.text);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ask, askAbout]);

  const onSelect = () => {
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? '';
    const box = body.current;
    if (!sel || !text || !box || !sel.rangeCount || !box.contains(sel.anchorNode)) {
      setAsk(null);
      return;
    }
    const r = sel.getRangeAt(0).getBoundingClientRect();
    const b = box.getBoundingClientRect();
    setAsk({
      text,
      top: r.top - b.top + box.scrollTop - 34,
      left: Math.min(Math.max(0, r.left - b.left), b.width - 190),
    });
  };

  const save = async () => {
    if (draft === null || !file.data) return;
    setSaving(true);
    setError(null);
    try {
      await saveFile(projectId, path, draft, file.data.mtime);
      setText(null);
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : 'Could not save the file.');
    } finally {
      setSaving(false);
    }
  };

  const git = file.data?.git;
  const meta = file.data
    ? `${git === 'U' || git === 'A' ? 'New' : git === 'M' ? 'Changed' : 'Saved'} · updated ${relativeTime(file.data.mtime, now)}`
    : '';

  return (
    <section className={styles.reader} aria-label={`Document ${path}`}>
      <div className={styles.readerHead}>
        <FileText size={13} aria-hidden="true" />
        <span className={styles.readerPath} title={path}>
          {path}
        </span>
        {extra && <span className={styles.tag}>from the chat</span>}
        <span className={styles.grow} />
        {editing ? (
          <>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={saving}
              onClick={() => {
                setText(null);
                setError(null);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={saving || !dirty}
              onClick={() => void save()}
            >
              Save
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={styles.headBtn}
              disabled={!file.data || file.data.hidden || file.data.binary}
              onClick={() => setText(content)}
            >
              <Pencil size={13} aria-hidden="true" />
              Edit
            </button>
            <button
              type="button"
              className={styles.icon}
              aria-label={copied ? 'Copied' : 'Copy the document'}
              title={copied ? 'Copied' : 'Copy'}
              onClick={() =>
                void navigator.clipboard?.writeText(content).then(() => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1500);
                })
              }
            >
              <Copy size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={styles.icon}
              aria-label="Open large"
              title="Open large"
              onClick={() => void navigate(`/p/${encodeURIComponent(projectId)}/docs/${path}`)}
            >
              <Maximize size={14} aria-hidden="true" />
            </button>
          </>
        )}
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {editing ? (
        <textarea
          className={styles.editor}
          aria-label={`Edit ${path}`}
          value={draft}
          spellCheck
          autoFocus
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
              e.preventDefault();
              void save();
            }
            if (e.key === 'Escape' && !dirty) setText(null);
          }}
        />
      ) : (
        <div className={styles.readerBody} ref={body} onMouseUp={onSelect}>
          {file.isPending && <span className="shimmer" style={{ height: 120 }} />}
          {file.isError && <p className={styles.empty}>Could not read {path}.</p>}
          {file.data && (
            <>
              <p className={styles.readerMeta}>{meta}</p>
              <div className={styles.md}>
                <Markdown
                  source={content.replace(FRONTMATTER, '')}
                  docPath={path}
                  docHref={(p) => `/p/${encodeURIComponent(projectId)}/docs/${p}`}
                />
              </div>
            </>
          )}
          {ask && (
            <button
              type="button"
              className={styles.ask}
              style={{ top: ask.top, left: ask.left }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => askAbout(ask.text)}
            >
              <MessageCircle size={13} aria-hidden="true" />
              Ask about this
              <kbd>Ctrl L</kbd>
            </button>
          )}
        </div>
      )}
    </section>
  );
}
