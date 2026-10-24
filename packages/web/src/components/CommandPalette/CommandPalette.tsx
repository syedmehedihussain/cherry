import { FileText, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { create } from 'zustand';
import styles from './CommandPalette.module.css';

export interface PaletteItem {
  id: string;
  group: 'Views' | 'Stages' | 'Actions';
  label: string;
  /** Right side: a count ("2 running") or a hint. */
  hint?: string;
  /** Keys shown on the right, e.g. ['Ctrl', 'N'] or ['/resume']. */
  keys?: string[];
  icon?: ReactNode;
  /** Words that also find it ("terminal" finds "New terminal"). */
  words?: string;
  run(): void;
}

/** Whether the palette is open; Ctrl+K anywhere in a workspace toggles it. */
export const usePalette = create<{ open: boolean; set(open: boolean): void }>((set) => ({
  open: false,
  set: (open) => set({ open }),
}));

/**
 * Where a query matches a label: the indexes to show bold. Prefers one run of letters (a
 * substring); falls back to the letters in order, like VS Code's quick open. Null: no match.
 */
export function matchLabel(label: string, query: string): number[] | null {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const l = label.toLowerCase();
  const at = l.indexOf(q);
  if (at >= 0) return Array.from({ length: q.length }, (_, i) => at + i);
  const out: number[] = [];
  let from = 0;
  for (const ch of q.replace(/\s+/g, '')) {
    const i = l.indexOf(ch, from);
    if (i < 0) return null;
    out.push(i);
    from = i + 1;
  }
  return out;
}

function Label({ text, marks }: { text: string; marks: number[] }) {
  if (!marks.length) return <>{text}</>;
  const set = new Set(marks);
  return (
    <>
      {[...text].map((ch, i) =>
        set.has(i) ? (
          <b key={i} className={styles.mark}>
            {ch}
          </b>
        ) : (
          <span key={i}>{ch}</span>
        ),
      )}
    </>
  );
}

type Row =
  | { kind: 'item'; item: PaletteItem; marks: number[] }
  | { kind: 'file'; path: string; marks: number[] };

const GROUP_ORDER: PaletteItem['group'][] = ['Views', 'Stages', 'Actions'];

/**
 * The command palette (ADR-0045, artboard 06): every action and every hidden view. Typing
 * also finds project files; a leading `>` finds files only.
 */
export function CommandPalette({
  items,
  searchFiles,
  onOpenFile,
}: {
  items: PaletteItem[];
  searchFiles(q: string): Promise<string[]>;
  onOpenFile(path: string): void;
}) {
  const { open, set } = usePalette();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        set(!usePalette.getState().open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [set]);
  useEffect(() => () => set(false), [set]);
  if (!open) return null;
  return (
    <Palette
      items={items}
      searchFiles={searchFiles}
      onOpenFile={onOpenFile}
      onClose={() => set(false)}
    />
  );
}

function Palette({
  items,
  searchFiles,
  onOpenFile,
  onClose,
}: {
  items: PaletteItem[];
  searchFiles(q: string): Promise<string[]>;
  onOpenFile(path: string): void;
  onClose(): void;
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [files, setFiles] = useState<{ q: string; list: string[] }>({ q: '', list: [] });
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const filesOnly = query.startsWith('>');
  const fileQuery = (filesOnly ? query.slice(1) : query).trim();

  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    if (!fileQuery) return;
    let alive = true;
    const t = window.setTimeout(() => {
      void searchFiles(fileQuery)
        .then((list) => alive && setFiles({ q: fileQuery, list }))
        .catch(() => alive && setFiles({ q: fileQuery, list: [] }));
    }, 120);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [fileQuery, searchFiles]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    if (!filesOnly) {
      for (const g of GROUP_ORDER)
        for (const item of items.filter((i) => i.group === g)) {
          const marks = matchLabel(item.label, query);
          const alt = marks ?? (item.words && matchLabel(item.words, query) ? [] : null);
          if (alt) out.push({ kind: 'item', item, marks: alt });
        }
    }
    if (fileQuery && files.q === fileQuery)
      for (const path of files.list.slice(0, filesOnly ? 30 : 8))
        out.push({
          kind: 'file',
          path,
          marks: matchLabel(path.split('/').pop() ?? path, fileQuery) ?? [],
        });
    return out;
  }, [items, query, filesOnly, fileQuery, files]);

  const current = Math.min(active, Math.max(0, rows.length - 1));
  useEffect(() => {
    list.current
      ?.querySelector(`[data-index="${current}"]`)
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [current]);

  const run = (row: Row | undefined) => {
    if (!row) return;
    onClose();
    if (row.kind === 'file') onOpenFile(row.path);
    else row.item.run();
  };

  let lastGroup: string | null = null;
  return (
    <div className={styles.scrim} onMouseDown={onClose}>
      <div
        className={styles.palette}
        role="dialog"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className={styles.search}>
          <Search size={16} aria-hidden="true" />
          <input
            ref={input}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-label="Search or run a command"
            placeholder="Search or run a command, > for files"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((current + 1) % Math.max(1, rows.length));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((current - 1 + rows.length) % Math.max(1, rows.length));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                run(rows[current]);
              }
            }}
          />
          <kbd className={styles.kbd}>Esc</kbd>
        </div>
        <div className={styles.list} id="palette-list" role="listbox" ref={list}>
          {rows.length === 0 && (
            <p className={styles.empty}>
              {fileQuery && files.q !== fileQuery ? 'Searching…' : 'Nothing found.'}
            </p>
          )}
          {rows.map((row, i) => {
            const group = row.kind === 'file' ? 'Files' : row.item.group;
            const head = group !== lastGroup;
            lastGroup = group;
            const label =
              row.kind === 'file' ? (row.path.split('/').pop() ?? row.path) : row.item.label;
            return (
              <div key={row.kind === 'file' ? `f:${row.path}` : row.item.id}>
                {head && <div className={styles.group}>{group}</div>}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === current}
                  data-index={i}
                  className={styles.row}
                  onMouseMove={() => i !== current && setActive(i)}
                  onClick={() => run(row)}
                >
                  <span className={styles.icon}>
                    {row.kind === 'file' ? (
                      <FileText size={15} aria-hidden="true" />
                    ) : (
                      row.item.icon
                    )}
                  </span>
                  <span className={styles.label}>
                    <Label text={label} marks={row.marks} />
                  </span>
                  {row.kind === 'file' ? (
                    <span className={styles.hint}>{row.path}</span>
                  ) : (
                    <>
                      {row.item.hint && <span className={styles.hint}>{row.item.hint}</span>}
                      {row.item.keys?.map((k) => (
                        <kbd key={k} className={styles.kbd}>
                          {k}
                        </kbd>
                      ))}
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
        <div className={styles.foot}>
          <kbd className={styles.kbd}>↑</kbd>
          <kbd className={styles.kbd}>↓</kbd>
          <span>move</span>
          <kbd className={styles.kbd}>Enter</kbd>
          <span>open</span>
          <kbd className={styles.kbd}>&gt;</kbd>
          <span>files</span>
          <span className={styles.grow} />
          <span>Ctrl K anywhere</span>
        </div>
      </div>
    </div>
  );
}
