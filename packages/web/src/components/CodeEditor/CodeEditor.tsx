import { DiffEditor, Editor, type OnMount } from '@monaco-editor/react';
import { ArrowUpRight, Eye, FileDiff, Pencil, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { relativeTime } from '@cherry/shared';
import { ApiFailure } from '../../api/client.ts';
import { openInEditor, saveFile, useDiff, useFile } from '../../api/workspace.ts';
import { defineCherryTheme, monaco, monacoLanguage } from '../../lib/monaco.ts';
import { themeMode, useTheme } from '../../lib/theme.ts';
import { Markdown } from '../Markdown/Markdown.tsx';
import { modelKey, registerModel } from './editorModels.ts';
import styles from './CodeEditor.module.css';

type Editor = Parameters<OnMount>[0];

const LANG_LABEL: Record<string, string> = {
  typescript: 'TypeScript',
  tsx: 'TypeScript JSX',
  javascript: 'JavaScript',
  jsx: 'JavaScript JSX',
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
  text: 'Plain Text',
};

/**
 * A file tab in Development (V3 r5, ADR-0048): Monaco with VS Code keys, find and
 * multi-cursor. Save (Ctrl+S) writes after the unchanged-on-disk check (ADR-0021). A file
 * Claude changed shows a band with Show diff and Undo, and the changed lines are marked.
 */
export default function CodeEditor({
  projectId,
  path,
  claudeAt,
  now,
  onDirty,
}: {
  projectId: string;
  path: string;
  /** When Claude last changed this file in the chat; null when it did not. */
  claudeAt: number | null;
  now: number;
  onDirty(dirty: boolean): void;
}) {
  const file = useFile(projectId, path);
  const changed = !!file.data?.git && !file.data.hidden && !file.data.binary;
  const diff = useDiff(projectId, path, changed);
  const themeId = useTheme();
  const mode = themeMode(themeId);
  // The editor theme follows Cherry's (all four), built from the tokens.
  const theme = useMemo(() => {
    void themeId;
    return defineCherryTheme(mode);
  }, [mode, themeId]);
  const editor = useRef<Editor | null>(null);
  const decorations = useRef<ReturnType<Editor['createDecorationsCollection']> | null>(null);
  /** The text on disk this buffer was opened from, and its time. */
  const base = useRef<{ text: string; mtime: number } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [view, setView] = useState<'edit' | 'diff' | 'preview'>('edit');
  /** The diff view's two models; disposed after the widget lets go of them. */
  const diffModels = useRef<{ dispose(): void }[]>([]);
  useEffect(() => {
    if (view !== 'diff') return;
    return () => {
      const models = diffModels.current;
      diffModels.current = [];
      window.setTimeout(() => models.forEach((m) => m.dispose()), 0);
    };
  }, [view]);
  const [pos, setPos] = useState({ ln: 1, col: 1 });
  const [text, setText] = useState('');
  const [indent, setIndent] = useState({ spaces: true, size: 2 });
  const key = modelKey(projectId, path);
  const lang = file.data?.language ?? 'text';
  const readOnly = !!file.data?.truncated;

  useEffect(() => {
    // Wait for the fonts, so Monaco measures Geist Mono and not a fallback.
    void document.fonts?.ready.then(() => monaco.editor.remeasureFonts());
  }, []);

  const markDirty = useCallback(
    (d: boolean) => {
      setDirty(d);
      onDirty(d);
    },
    [onDirty],
  );

  /** HEAD's text, from the full-file diff: unchanged and removed lines. */
  const endsWithNewline = !!file.data?.content.endsWith('\n');
  const original = useMemo(() => {
    const lines = diff.data?.lines;
    if (!lines?.length) return null;
    const text = lines
      .filter((l) => l.kind !== '+')
      .map((l) => l.text)
      .join('\n');
    return endsWithNewline ? `${text}\n` : text;
  }, [diff.data, endsWithNewline]);
  const isNew = file.data?.git === 'U' || file.data?.git === 'A';

  // A newer file on disk: take it, unless the buffer has edits of its own.
  useEffect(() => {
    const ed = editor.current;
    const data = file.data;
    if (!ed || !data || data.hidden || data.binary) return;
    if (base.current && base.current.mtime === data.mtime) return;
    const model = ed.getModel();
    if (!model) return;
    const current = model.getValue();
    if (base.current && current !== base.current.text) {
      // The user has unsaved edits: say so, do not overwrite them.
      if (data.content !== current) setConflict(true);
      return;
    }
    base.current = { text: data.content, mtime: data.mtime };
    if (current !== data.content) {
      model.pushEditOperations(
        [],
        [{ range: model.getFullModelRange(), text: data.content }],
        () => null,
      );
    }
    markDirty(false);
  }, [file.data, markDirty]);

  // Lines that differ from the last commit get a mark in the gutter.
  useEffect(() => {
    const ed = editor.current;
    if (!ed) return;
    const lines = diff.data?.lines ?? [];
    const marks = lines
      .filter((l) => l.kind === '+' && l.b !== null)
      .map((l) => ({
        range: new monaco.Range(l.b!, 1, l.b!, 1),
        options: {
          isWholeLine: true,
          className: claudeAt ? 'cc-line-add' : undefined,
          linesDecorationsClassName: 'cc-gutter-add',
        },
      }));
    decorations.current ??= ed.createDecorationsCollection();
    decorations.current.set(marks);
  }, [diff.data, claudeAt, view]);

  const save = useCallback(
    async (force = false) => {
      const ed = editor.current;
      const value = ed?.getModel()?.getValue();
      if (value === undefined || !base.current) return;
      setSaving(true);
      setError(null);
      try {
        let mtime = base.current.mtime;
        if (force) mtime = (await file.refetch()).data?.mtime ?? mtime;
        const view = await saveFile(projectId, path, value, mtime);
        base.current = { text: value, mtime: view.mtime };
        setConflict(false);
        markDirty(false);
      } catch (e) {
        if (e instanceof ApiFailure && e.status === 409) setConflict(true);
        else setError(e instanceof ApiFailure ? e.message : 'Could not save the file.');
      } finally {
        setSaving(false);
      }
    },
    [file, projectId, path, markDirty],
  );
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const onMount: OnMount = (ed) => {
    editor.current = ed;
    const model = ed.getModel();
    if (model) registerModel(key, () => model.dispose());
    const data = file.data;
    if (data && model) {
      // A buffer kept from before (an unsaved tab) stays; otherwise it is the file on disk.
      base.current = { text: data.content, mtime: data.mtime };
      markDirty(model.getValue() !== data.content);
    }
    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => void saveRef.current());
    ed.onDidChangeCursorPosition((e) =>
      setPos({ ln: e.position.lineNumber, col: e.position.column }),
    );
    const opts = model?.getOptions();
    if (opts) setIndent({ spaces: opts.insertSpaces, size: opts.tabSize });
    ed.focus();
  };

  const undoClaude = () => {
    const model = editor.current?.getModel();
    if (!model || original === null) return;
    model.pushEditOperations(
      [],
      [{ range: model.getFullModelRange(), text: original }],
      () => null,
    );
    setView('edit');
  };

  if (file.isPending) return <div className={styles.loading} />;
  if (file.isError)
    return <p className={styles.note}>No file {path}. It may have been moved or deleted.</p>;
  const data = file.data;
  if (data.hidden)
    return (
      <p className={styles.note}>
        {path} is a secret file. Cherry does not show it or send it to Claude.
      </p>
    );
  if (data.binary)
    return <p className={styles.note}>{path} is a binary file and cannot be edited here.</p>;

  const crumbs = path.split('/');
  return (
    <section className={styles.wrap} aria-label={`Contents of ${path}`}>
      {claudeAt && (
        <div className={styles.band}>
          <Pencil size={13} aria-hidden="true" />
          <span>Claude changed this file {relativeTime(claudeAt, now)}</span>
          <span className={styles.grow} />
          {original !== null && (
            <button
              type="button"
              className={styles.bandBtn}
              aria-pressed={view === 'diff'}
              onClick={() => {
                setText(editor.current?.getValue() ?? '');
                setView(view === 'diff' ? 'edit' : 'diff');
              }}
            >
              <FileDiff size={13} aria-hidden="true" />
              {view === 'diff' ? 'Hide diff' : 'Show diff'}
            </button>
          )}
          {!isNew && original !== null && (
            <button
              type="button"
              className={styles.bandBtn}
              title="Put the last committed version in the editor. Save to keep it."
              onClick={undoClaude}
            >
              <Undo2 size={13} aria-hidden="true" />
              Undo
            </button>
          )}
        </div>
      )}
      {conflict && (
        <div className={styles.conflict} role="alert">
          <span>The file changed on disk while you edited it.</span>
          <span className={styles.grow} />
          <button
            type="button"
            className={styles.bandBtn}
            onClick={() => {
              base.current = null;
              setConflict(false);
              void file.refetch();
            }}
          >
            Reload from disk
          </button>
          <button
            type="button"
            className={styles.bandBtn}
            disabled={saving}
            onClick={() => void save(true)}
          >
            Overwrite with mine
          </button>
        </div>
      )}
      <div className={styles.crumbs}>
        {crumbs.map((c, i) => (
          <span key={i} className={i === crumbs.length - 1 ? styles.crumbLast : undefined}>
            {i > 0 && <span className={styles.sep}>›</span>}
            {c}
          </span>
        ))}
        <span className={styles.grow} />
        {dirty && (
          <>
            <span className={styles.unsaved}>Not saved · Ctrl+S</span>
            <button
              type="button"
              className={styles.bandBtn}
              disabled={saving || readOnly}
              onClick={() => void save()}
            >
              Save
            </button>
          </>
        )}
        {lang === 'markdown' && (
          <button
            type="button"
            className={styles.bandBtn}
            aria-pressed={view === 'preview'}
            onClick={() => {
              setText(editor.current?.getValue() ?? data.content);
              setView(view === 'preview' ? 'edit' : 'preview');
            }}
          >
            <Eye size={13} aria-hidden="true" />
            {view === 'preview' ? 'Edit' : 'Preview'}
          </button>
        )}
        <button
          type="button"
          className={styles.iconBtn}
          aria-label="Open in your editor"
          title="Open in your editor"
          onClick={() => void openInEditor(projectId, path).catch(() => undefined)}
        >
          <ArrowUpRight size={14} aria-hidden="true" />
        </button>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.editor}>
        {/* The buffer stays mounted under the diff and the preview, with its edits. */}
        <div className={styles.layer} hidden={view !== 'edit'}>
          <Editor
            path={key}
            defaultValue={data.content}
            defaultLanguage={monacoLanguage(lang)}
            theme={theme}
            onMount={onMount}
            onChange={(v) => markDirty(!!base.current && v !== base.current.text)}
            loading={null}
            options={{
              ariaLabel: `Edit ${path}`,
              readOnly,
              fontFamily: getComputedStyle(document.documentElement)
                .getPropertyValue('--mono')
                .trim(),
              fontSize: 13,
              lineHeight: 20,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              padding: { top: 6 },
              renderLineHighlight: 'line',
              smoothScrolling: true,
              tabSize: 2,
              stickyScroll: { enabled: false },
              overviewRulerBorder: false,
            }}
          />
        </div>
        {view === 'diff' && original !== null && (
          <div className={styles.layer}>
            <DiffEditor
              original={original}
              modified={text}
              language={monacoLanguage(lang)}
              theme={theme}
              loading={null}
              keepCurrentOriginalModel
              keepCurrentModifiedModel
              onMount={(d) => {
                const m = d.getModel();
                if (m) diffModels.current = [m.original, m.modified];
              }}
              options={{
                readOnly: true,
                renderSideBySide: false,
                fontSize: 13,
                lineHeight: 20,
                minimap: { enabled: false },
                automaticLayout: true,
                scrollBeyondLastLine: false,
              }}
            />
          </div>
        )}
        {view === 'preview' && (
          <div className={`${styles.layer} ${styles.preview}`}>
            <Markdown source={text} docPath={path} />
          </div>
        )}
      </div>
      <footer className={styles.foot}>
        {readOnly && <span>Read only: the file is too big to edit here</span>}
        <span className={styles.grow} />
        <span>
          Ln {pos.ln}, Col {pos.col}
        </span>
        <span>
          {indent.spaces ? 'Spaces' : 'Tab Size'}: {indent.size}
        </span>
        <span>UTF-8</span>
        <span>{LANG_LABEL[lang] ?? lang}</span>
      </footer>
    </section>
  );
}
