import { ArrowUpRight, Pencil } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Fragment, useEffect, useState, type KeyboardEvent } from 'react';
import type { ThemedToken } from 'shiki';
import type { DiffLine } from '@cherry/shared';
import { ApiFailure } from '../../api/client.ts';
import { openInEditor, saveFile, useDiff, useFile } from '../../api/workspace.ts';
import { highlightLines } from '../../lib/highlight.ts';
import { Markdown } from '../Markdown/Markdown.tsx';
import { themeMode, useTheme } from '../../lib/theme.ts';
import { Switch } from '../Switch/Switch.tsx';
import styles from './FileViewer.module.css';

const LANG_LABEL: Record<string, string> = {
  typescript: 'TypeScript',
  tsx: 'TypeScript (TSX)',
  javascript: 'JavaScript',
  jsx: 'JavaScript (JSX)',
  json: 'JSON',
  markdown: 'Markdown',
  python: 'Python',
  rust: 'Rust',
  go: 'Go',
  css: 'CSS',
  html: 'HTML',
  shellscript: 'Shell',
  yaml: 'YAML',
  toml: 'TOML',
  sql: 'SQL',
  c: 'C',
  cpp: 'C++',
  text: 'Plain text',
};

/** YAML frontmatter is metadata, not reading text: the preview leaves it out. */
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

export function FileViewer({
  projectId,
  path,
  fileHref,
}: {
  projectId: string;
  path: string;
  /** In-app link to another file of the project, for links in a Markdown preview. */
  fileHref?(path: string): string;
}) {
  const file = useFile(projectId, path);
  const [source, setSource] = useState(false);
  const changed = !!file.data?.git && !file.data.hidden && !file.data.binary;
  const [showChanges, setShowChanges] = useState(true);
  // The built-in editor (ADR-0021): a draft per file, saved only on Save or Ctrl+S.
  const [draft, setDraft] = useState<{ path: string; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const editing = draft?.path === path ? draft.text : null;
  const dirty = editing !== null && editing !== file.data?.content;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const diff = useDiff(projectId, path, changed);
  const diffOn = changed && showChanges && !!diff.data && diff.data.lines.length > 0;

  const code = file.data?.content ?? '';
  const highlightSource = diffOn
    ? diff.data!.lines.map((l) => l.text).join('\n')
    : code.replace(/\n$/, '');
  const lang = file.data?.language ?? 'text';
  const mode = themeMode(useTheme());
  const highlighted = useQuery({
    queryKey: ['highlight', projectId, path, file.data?.mtime, diffOn, lang, mode],
    queryFn: () => highlightLines(highlightSource, lang, mode),
    enabled: !!file.data,
    staleTime: Infinity,
  });
  const tokens: ThemedToken[][] | null = highlighted.data ?? null;

  if (file.isError) return <p className={styles.message}>{(file.error as Error).message}</p>;
  if (!file.data)
    return (
      <div className={styles.loading}>
        <span className="shimmer" style={{ height: 300 }} />
      </div>
    );

  const editable = !file.data.hidden && !file.data.binary && !file.data.truncated;
  const isMarkdown = file.data.language === 'markdown' && !file.data.hidden && !file.data.binary;
  const preview = isMarkdown && !source && editing === null;
  const startEdit = () => {
    setSaveError(null);
    setDraft({ path, text: file.data!.content });
  };
  const stopEdit = () => {
    if (dirty && !window.confirm('Discard your changes to this file?')) return;
    setDraft(null);
    setSaveError(null);
  };
  const save = async () => {
    if (editing === null || !dirty || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveFile(projectId, path, editing, file.data!.mtime);
      setDraft(null);
    } catch (e) {
      setSaveError(e instanceof ApiFailure ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      void save();
    } else if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      const el = e.currentTarget;
      const { selectionStart: a, selectionEnd: b, value } = el;
      const next = value.slice(0, a) + '  ' + value.slice(b);
      setDraft({ path, text: next });
      requestAnimationFrame(() => el.setSelectionRange(a + 2, a + 2));
    }
  };

  const parts = file.data.path.split('/');
  const lines: DiffLine[] = diffOn
    ? diff.data!.lines
    : highlightSource.split('\n').map((text, i) => ({ kind: ' ', a: i + 1, b: i + 1, text }));

  return (
    <div className={styles.viewer}>
      <div className={styles.bar}>
        <div className={styles.crumbs} aria-label="File path">
          {parts.map((p, i) => (
            <Fragment key={i}>
              {i > 0 && <span>/</span>}
              <span className={i === parts.length - 1 ? styles.leaf : undefined}>{p}</span>
            </Fragment>
          ))}
        </div>
        {editing !== null && <span className={styles.readonly}>Editing</span>}
        <span className={styles.meta}>
          {file.data.lines} lines · {LANG_LABEL[file.data.language] ?? file.data.language}
          {file.data.truncated && ' · first 1 MB'}
        </span>
        <span className={styles.spacer} />
        {saveError && (
          <span className={styles.saveError} role="alert">
            {saveError}
          </span>
        )}
        {editing !== null ? (
          <>
            <button type="button" className="btn btn-ghost" onClick={stopEdit}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!dirty || saving}
              onClick={() => void save()}
              title="Save (Ctrl+S)"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </>
        ) : (
          editable && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={startEdit}
              aria-label="Edit file"
            >
              <Pencil size={12} strokeWidth={2} aria-hidden="true" />
              Edit
            </button>
          )
        )}
        {isMarkdown && editing === null && (
          <div className={styles.seg} role="group" aria-label="Markdown view">
            <button type="button" aria-pressed={!source} onClick={() => setSource(false)}>
              Preview
            </button>
            <button type="button" aria-pressed={source} onClick={() => setSource(true)}>
              Source
            </button>
          </div>
        )}
        {changed && editing === null && !preview && (
          <>
            <Switch checked={showChanges} onChange={setShowChanges} label="Show changes" />
            {diff.data && (
              <span className={styles.counts}>
                <span className={styles.add}>+{diff.data.added}</span>{' '}
                <span className={styles.del}>−{diff.data.removed}</span>
              </span>
            )}
          </>
        )}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void openInEditor(projectId, path)}
        >
          Open in editor
          <ArrowUpRight size={12} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
      {file.data.hidden ? (
        <p className={styles.message}>
          Hidden for safety. Cherry never reads secret files like {parts[parts.length - 1]}.
        </p>
      ) : file.data.binary ? (
        <p className={styles.message}>This is a binary file.</p>
      ) : editing !== null ? (
        <textarea
          className={styles.editor}
          value={editing}
          onChange={(e) => setDraft({ path, text: e.target.value })}
          onKeyDown={onKey}
          aria-label={`Edit ${file.data.path}`}
          spellCheck={false}
          autoFocus
        />
      ) : preview ? (
        <div
          className={styles.preview}
          role="region"
          aria-label={`Preview of ${file.data.path}`}
          tabIndex={0}
        >
          <div className={styles.article}>
            <Markdown
              source={code.replace(FRONTMATTER, '')}
              docPath={file.data.path}
              docHref={fileHref}
            />
          </div>
        </div>
      ) : (
        <div
          className={styles.code}
          role="region"
          aria-label={`Contents of ${file.data.path}`}
          tabIndex={0}
        >
          <div className={styles.lines} data-diff={diffOn || undefined}>
            {lines.map((l, i) => (
              <div key={i} className={styles.line} data-kind={l.kind}>
                {diffOn ? (
                  <>
                    <span className={styles.num}>{l.a ?? ''}</span>
                    <span className={styles.num}>{l.b ?? ''}</span>
                    <span className={styles.sign}>
                      {l.kind === ' ' ? '' : l.kind === '-' ? '−' : '+'}
                    </span>
                  </>
                ) : (
                  <span className={styles.num}>{l.b}</span>
                )}
                <span className={styles.text}>
                  {tokens?.[i]
                    ? tokens[i].map((t, j) => (
                        <span key={j} style={{ color: t.color }}>
                          {t.content}
                        </span>
                      ))
                    : l.text || ' '}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
