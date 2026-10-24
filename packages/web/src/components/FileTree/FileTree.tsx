import { ChevronRight, ChevronsDownUp, Folder, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { STAGE_LABEL, fileTag, type GitLetter, type Stage, type TreeEntry } from '@cherry/shared';
import { useStageFocus } from '../../api/stages.ts';
import { useChanges, useTree } from '../../api/workspace.ts';
import styles from './FileTree.module.css';

const PINNED = new Set(['CLAUDE.md', 'docs', '_project']);

type Fold = { stage: boolean; project: boolean };
const foldKey = (stage: Stage) => `cherry.treeFold.${stage}`;

/** Folded sections per stage: the stage's files open, the project tree folded (except in
 * Development, which has no stage files). Remembered in this browser. */
function readFold(stage: Stage): Fold {
  const fallback = { stage: false, project: stage !== 'development' };
  try {
    const raw = JSON.parse(localStorage.getItem(foldKey(stage)) ?? 'null') as Partial<Fold> | null;
    return raw ? { ...fallback, ...raw } : fallback;
  } catch {
    return fallback;
  }
}

function storeFold(stage: Stage, fold: Fold): void {
  try {
    localStorage.setItem(foldKey(stage), JSON.stringify(fold));
  } catch {
    // Private window: the fold is not remembered.
  }
}

interface FileTreeProps {
  projectId: string;
  projectPath: string;
  selected: string | null;
  onOpen(path: string): void;
  /** Files Claude changed this session (M3). */
  touched?: Set<string>;
  /** The open stage: its files show first (ADR-0034). */
  stage?: Stage;
  /** Find a file (the palette in files mode). */
  onSearch?(): void;
}

export function FileTree({
  projectId,
  projectPath,
  selected,
  onOpen,
  touched,
  stage,
  onSearch,
}: FileTreeProps) {
  const focus = useStageFocus(projectId, stage ?? 'development');
  const stageFiles = stage ? (focus.data?.files ?? []) : [];
  const [open, setOpen] = useState<Set<string>>(() => initialOpen(selected));
  const [filter, setFilter] = useState<'all' | 'changed' | 'touched'>('all');
  const foldStage = stage ?? 'development';
  const [folds, setFolds] = useState<Partial<Record<Stage, Fold>>>({});
  const fold = folds[foldStage] ?? readFold(foldStage);
  const setFold = (next: Fold) => {
    storeFold(foldStage, next);
    setFolds((f) => ({ ...f, [foldStage]: next }));
  };
  // A file opened from outside the stage's files keeps the project tree open.
  const projectFolded =
    fold.project && !(selected && stageFiles.length > 0 && !stageFiles.includes(selected));
  const root = useTree(projectId, '');
  const changes = useChanges(projectId);

  const toggle = (p: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });

  const counts = useMemo(() => {
    const c = { M: 0, A: 0, U: 0, D: 0, R: 0 } as Record<GitLetter, number>;
    for (const e of changes.data?.entries ?? []) c[e.letter]++;
    return c;
  }, [changes.data]);

  const entries = root.data?.entries ?? [];
  const pinned = entries.filter((e) => PINNED.has(e.name));
  const rest = entries.filter((e) => !PINNED.has(e.name));
  const flat =
    filter === 'changed'
      ? (changes.data?.entries ?? []).map((e) => e)
      : filter === 'touched'
        ? [...(touched ?? [])].map((p) => ({ path: p, letter: null }))
        : null;

  return (
    <aside aria-label="Files" className={styles.panel}>
      <div className={styles.head}>
        <span className={styles.title}>Explorer</span>
        <span className={styles.grow} />
        {onSearch && (
          <button
            type="button"
            className={styles.collapseAll}
            aria-label="Find a file"
            title="Find a file (Ctrl K, then >)"
            onClick={onSearch}
          >
            <Search size={14} aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          className={styles.collapseAll}
          aria-label="Collapse all"
          title="Collapse all"
          onClick={() => {
            setOpen(new Set());
            setFold({ stage: true, project: true });
          }}
        >
          <ChevronsDownUp size={14} aria-hidden="true" />
        </button>
      </div>
      <div className={styles.scroll} role="tree" aria-label="Project files">
        {!flat && stage && stage !== 'development' && (
          <>
            <SectionHead
              label={`${STAGE_LABEL[stage]} files`}
              folded={fold.stage}
              onToggle={() => setFold({ ...fold, stage: !fold.stage })}
            />
            {!fold.stage && stageFiles.length === 0 && (
              <p className={styles.empty}>No {STAGE_LABEL[stage]} files yet.</p>
            )}
            {!fold.stage &&
              stageFiles.map((p) => (
                <Row
                  key={`stage-${p}`}
                  entry={{
                    name: p,
                    path: p,
                    type: 'file',
                    tag: fileTag(p),
                    git: null,
                    ignored: false,
                    changedInside: 0,
                  }}
                  depth={0}
                  selected={selected === p}
                  touched={touched?.has(p) ?? false}
                  onClick={() => onOpen(p)}
                />
              ))}
            <div className={styles.divider} />
          </>
        )}
        {flat ? (
          <div className="label" style={{ padding: '4px 8px 6px' }}>
            {filter === 'changed' ? 'Changed files' : 'Claude touched'}
          </div>
        ) : (
          <SectionHead
            label={projectId}
            ariaLabel="Project files"
            title={projectPath}
            folded={projectFolded}
            onToggle={() => setFold({ ...fold, project: !projectFolded })}
          />
        )}
        {root.isPending && !projectFolded && <TreeSkeleton />}
        {flat ? (
          flat.map((e) => (
            <Row
              key={e.path}
              entry={{
                name: e.path,
                path: e.path,
                type: 'file',
                tag: fileTag(e.path),
                git: e.letter,
                ignored: false,
                changedInside: 0,
              }}
              depth={0}
              selected={selected === e.path}
              touched={touched?.has(e.path) ?? false}
              onClick={() => onOpen(e.path)}
            />
          ))
        ) : projectFolded ? null : (
          <>
            {pinned.map((e) => (
              <Node
                key={e.path}
                projectId={projectId}
                entry={e}
                depth={0}
                open={open}
                toggle={toggle}
                selected={selected}
                onOpen={onOpen}
                touched={touched}
              />
            ))}
            {pinned.length > 0 && <div className={styles.divider} />}
            {rest.map((e) => (
              <Node
                key={e.path}
                projectId={projectId}
                entry={e}
                depth={0}
                open={open}
                toggle={toggle}
                selected={selected}
                onOpen={onOpen}
                touched={touched}
              />
            ))}
          </>
        )}
        {flat && flat.length === 0 && <p className={styles.empty}>Nothing here.</p>}
      </div>
      <div className={styles.foot}>
        <FilterChip
          active={filter === 'changed'}
          onClick={() => setFilter(filter === 'changed' ? 'all' : 'changed')}
        >
          <span className={styles.letter} data-letter="M">
            M
          </span>
          {counts.M + counts.R} modified
        </FilterChip>
        <FilterChip
          active={filter === 'changed'}
          onClick={() => setFilter(filter === 'changed' ? 'all' : 'changed')}
        >
          <span className={styles.letter} data-letter="A">
            A
          </span>
          {counts.A + counts.U} added
        </FilterChip>
        <FilterChip
          active={filter === 'touched'}
          onClick={() => setFilter(filter === 'touched' ? 'all' : 'touched')}
        >
          <span className={styles.touchedDot} />
          Claude touched
        </FilterChip>
      </div>
    </aside>
  );
}

/** A foldable section title in the file panel ("Plan files", "Project files"). */
function SectionHead({
  label,
  ariaLabel,
  title,
  folded,
  onToggle,
}: {
  label: string;
  ariaLabel?: string;
  title?: string;
  folded: boolean;
  onToggle(): void;
}) {
  return (
    <button
      type="button"
      className={styles.section}
      aria-expanded={!folded}
      aria-label={ariaLabel}
      title={title}
      onClick={onToggle}
    >
      <ChevronRight
        size={12}
        strokeWidth={2}
        aria-hidden="true"
        style={{ transform: folded ? undefined : 'rotate(90deg)' }}
      />
      <span className={ariaLabel ? styles.root : 'label'}>{label}</span>
    </button>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick(): void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" className={styles.chip} aria-pressed={active} onClick={onClick}>
      {children}
    </button>
  );
}

function initialOpen(selected: string | null): Set<string> {
  const s = new Set<string>();
  if (!selected) return s;
  const parts = selected.split('/');
  for (let i = 1; i < parts.length; i++) s.add(parts.slice(0, i).join('/'));
  return s;
}

interface NodeProps {
  projectId: string;
  entry: TreeEntry;
  depth: number;
  open: Set<string>;
  toggle(p: string): void;
  selected: string | null;
  onOpen(p: string): void;
  touched?: Set<string>;
}

function Node({ projectId, entry, depth, open, toggle, selected, onOpen, touched }: NodeProps) {
  const isOpen = entry.type === 'dir' && open.has(entry.path);
  const children = useTree(projectId, entry.path, isOpen);
  return (
    <>
      <Row
        entry={entry}
        depth={depth}
        expanded={entry.type === 'dir' ? isOpen : undefined}
        selected={selected === entry.path}
        touched={touched?.has(entry.path) ?? false}
        onClick={() => (entry.type === 'dir' ? toggle(entry.path) : onOpen(entry.path))}
      />
      {isOpen &&
        (children.data?.entries ?? []).map((c) => (
          <Node
            key={c.path}
            projectId={projectId}
            entry={c}
            depth={depth + 1}
            open={open}
            toggle={toggle}
            selected={selected}
            onOpen={onOpen}
            touched={touched}
          />
        ))}
    </>
  );
}

function Row({
  entry,
  depth,
  expanded,
  selected,
  touched,
  onClick,
}: {
  entry: TreeEntry;
  depth: number;
  expanded?: boolean;
  selected: boolean;
  touched: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      role="treeitem"
      aria-expanded={expanded}
      aria-selected={selected}
      className={styles.row}
      data-ignored={entry.ignored || undefined}
      data-deleted={entry.git === 'D' || undefined}
      style={{ paddingLeft: 8 + depth * 16 }}
      onClick={onClick}
      title={entry.path}
    >
      {Array.from({ length: depth }, (_, i) => (
        <span key={i} className={styles.guide} style={{ left: 15 + i * 16 }} aria-hidden="true" />
      ))}
      <span className={styles.chev} aria-hidden="true">
        {entry.type === 'dir' && (
          <ChevronRight
            size={12}
            strokeWidth={2}
            style={{ transform: expanded ? 'rotate(90deg)' : undefined }}
          />
        )}
      </span>
      <span className={styles.type} data-tag={entry.tag ?? undefined} aria-hidden="true">
        {entry.type === 'dir' ? <Folder size={14} strokeWidth={1.6} /> : entry.tag}
      </span>
      <span className={styles.name}>{entry.name}</span>
      {touched && <span className={styles.touchedDot} title="Touched by Claude this session" />}
      {entry.ignored && <span className={styles.meta}>ignored</span>}
      {entry.git && (
        <span
          className={styles.letter}
          data-letter={entry.git}
          aria-label={LETTER_LABEL[entry.git]}
        >
          {entry.git}
        </span>
      )}
    </button>
  );
}

const LETTER_LABEL: Record<GitLetter, string> = {
  M: 'modified',
  A: 'added',
  U: 'untracked',
  D: 'deleted',
  R: 'renamed',
};

function TreeSkeleton() {
  return (
    <div
      aria-hidden="true"
      style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 8 }}
    >
      {Array.from({ length: 8 }, (_, i) => (
        <span
          key={i}
          className="shimmer"
          style={{ height: 14, width: `${50 + ((i * 17) % 40)}%` }}
        />
      ))}
    </div>
  );
}

/** The file type as a short coloured tag ("TS", "MD"), as the explorer shows it. */
export function TypeTag({ path }: { path: string }) {
  const tag = fileTag(path);
  return (
    <span className={styles.type} data-tag={tag ?? undefined} aria-hidden="true">
      {tag ?? ''}
    </span>
  );
}
