import { Ellipsis, Plus, SquareTerminal, X } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { newChat, useChat } from '../../../api/chat.ts';
import { useProjectDetail } from '../../../api/workspace.ts';
import { closeTerminal, createTerminal, useTerminals } from '../../../api/terminals.ts';
import { usePalette } from '../../../components/CommandPalette/CommandPalette.tsx';
import { FileTree, TypeTag } from '../../../components/FileTree/FileTree.tsx';
import { disposeModel } from '../../../components/CodeEditor/editorModels.ts';
import { tildify } from '../../../lib/paths.ts';
import { ChatTab, useHistoryMenu } from '../ChatTab.tsx';
import { tabKey, useDevTabs, useTabList, type ActiveTab, type DevTab } from './devTabs.ts';
import styles from './DevStage.module.css';

// Monaco is big: it loads with the first file tab, not with the page.
const CodeEditor = lazy(() => import('../../../components/CodeEditor/CodeEditor.tsx'));
const TerminalView = lazy(() => import('../../../components/TerminalView/TerminalView.tsx'));

/**
 * Development (V3 r4, artboard 03): the explorer, and one tabbed area. Claude is the first tab
 * and is pinned; files and terminals open as tabs next to it and switch back and forth.
 */
export function DevStage({
  projectId,
  now,
  active,
  onShow,
}: {
  projectId: string;
  now: number;
  active: ActiveTab;
  /** Shows a tab (changes the URL). */
  onShow(tab: ActiveTab): void;
}) {
  const card = useProjectDetail(projectId).data?.card;
  const chat = useChat(projectId, 'development');
  const touched = useMemo(() => new Set(chat.data?.touched ?? []), [chat.data?.touched]);
  const tabs = useTabList(projectId);
  const open = useDevTabs((s) => s.open);
  const close = useDevTabs((s) => s.close);
  const closeAll = useDevTabs((s) => s.closeAll);
  const dirty = useDevTabs((s) => s.dirty[projectId]);
  const setDirty = useDevTabs((s) => s.setDirty);
  // When Claude last changed each file in this chat (r5: the band in the editor).
  const claudeAt = useMemo(() => {
    const at = new Map<string, number>();
    for (const i of chat.data?.items ?? [])
      if (i.kind === 'tool' && i.verb === 'edit' && i.status === 'ok')
        at.set(i.target.replace(/^\.\//, ''), i.at);
    return at;
  }, [chat.data?.items]);
  const openPalette = usePalette((s) => s.set);
  const activeKey = tabKey(active);

  // A file opened by URL (a link, the palette) gets its tab.
  // Shells live in the daemon: after a reload their tabs come back; a gone one is dropped.
  const terminals = useTerminals(projectId).data;
  useEffect(() => {
    if (!terminals) return;
    const ids = new Set(terminals.map((t) => t.id));
    for (const t of terminals) open(projectId, { kind: 'term', id: t.id, title: t.title });
    for (const t of useDevTabs.getState().list(projectId))
      if (t.kind === 'term' && !ids.has(t.id)) close(projectId, `term:${t.id}`);
  }, [terminals, open, close, projectId]);
  const [termError, setTermError] = useState<string | null>(null);
  const newTerminal = () => {
    setTermError(null);
    void createTerminal(projectId)
      .then((t) => {
        open(projectId, { kind: 'term', id: t.id, title: t.title });
        onShow({ kind: 'term', id: t.id });
      })
      .catch((e: unknown) =>
        setTermError(e instanceof Error ? e.message : 'Could not start a terminal.'),
      );
  };

  const activePath = active.kind === 'file' ? active.path : null;
  useEffect(() => {
    if (activePath) open(projectId, { kind: 'file', path: activePath });
  }, [activePath, open, projectId]);

  const closeTab = (t: DevTab) => {
    const key = tabKey(t);
    if (
      t.kind === 'file' &&
      dirty?.includes(t.path) &&
      !window.confirm(`${t.path} has changes that are not saved. Close it anyway?`)
    )
      return;
    if (t.kind === 'file') disposeModel(projectId, t.path);
    if (t.kind === 'term') void closeTerminal(projectId, t.id).catch(() => undefined);
    const next = close(projectId, key);
    if (key === activeKey) onShow(next ?? { kind: 'claude' });
  };

  return (
    <div className={styles.dev}>
      <FileTree
        projectId={projectId}
        projectPath={card ? tildify(card.path) : ''}
        selected={active.kind === 'file' ? active.path : null}
        onOpen={(path) => onShow({ kind: 'file', path })}
        touched={touched}
        stage="development"
        onSearch={() => openPalette(true)}
      />
      <section className={styles.area} aria-label="Editor area">
        <div className={styles.bar}>
          <div className={styles.tabs} role="tablist" aria-label="Open tabs">
            <Tab
              active={activeKey === 'claude'}
              label="Claude"
              icon={<span className={styles.star} aria-hidden="true" />}
              mark={chat.data?.running ? 'running' : undefined}
              onSelect={() => onShow({ kind: 'claude' })}
            />
            {tabs.map((t) => (
              <Tab
                key={tabKey(t)}
                active={activeKey === tabKey(t)}
                label={t.kind === 'file' ? (t.path.split('/').pop() ?? t.path) : t.title}
                title={t.kind === 'file' ? t.path : t.title}
                icon={
                  t.kind === 'file' ? (
                    <TypeTag path={t.path} />
                  ) : (
                    <SquareTerminal size={13} aria-hidden="true" />
                  )
                }
                mark={t.kind === 'file' && dirty?.includes(t.path) ? 'dirty' : undefined}
                onSelect={() => onShow(t)}
                onClose={() => closeTab(t)}
              />
            ))}
          </div>
          <span className={styles.grow} />
          <Menu
            label="Open"
            icon={<Plus size={15} aria-hidden="true" />}
            items={[
              ['New terminal', newTerminal],
              ['Open a file…  Ctrl K', () => openPalette(true)],
            ]}
          />
          <Menu
            label="More"
            icon={<Ellipsis size={15} aria-hidden="true" />}
            items={[
              [
                'New chat',
                () => {
                  onShow({ kind: 'claude' });
                  void newChat(projectId, 'development');
                },
              ],
              [
                'Chat history',
                () => {
                  onShow({ kind: 'claude' });
                  useHistoryMenu.getState().set(true);
                },
              ],
              [
                'Close all tabs',
                () => {
                  if (
                    dirty?.length &&
                    !window.confirm(`${dirty.length} file(s) are not saved. Close them anyway?`)
                  )
                    return;
                  for (const t of tabs) {
                    if (t.kind === 'file') disposeModel(projectId, t.path);
                    else void closeTerminal(projectId, t.id).catch(() => undefined);
                  }
                  closeAll(projectId);
                  onShow({ kind: 'claude' });
                },
              ],
            ]}
          />
        </div>
        {termError && (
          <p className={styles.error} role="alert">
            {termError}
          </p>
        )}
        <div className={styles.body}>
          {/* The chat stays mounted, so its scroll and draft survive a tab switch. */}
          <div className={styles.pane} hidden={activeKey !== 'claude'}>
            <ChatTab
              projectId={projectId}
              stage="development"
              now={now}
              onOpenFile={(path) => onShow({ kind: 'file', path })}
            />
          </div>
          {/* Terminals stay mounted, so a tab switch keeps the shell's screen. */}
          {tabs.map(
            (t) =>
              t.kind === 'term' && (
                <div key={t.id} className={styles.pane} hidden={activeKey !== tabKey(t)}>
                  <Suspense fallback={<div className={styles.loading} />}>
                    <TerminalView
                      projectId={projectId}
                      id={t.id}
                      title={t.title}
                      active={activeKey === tabKey(t)}
                    />
                  </Suspense>
                </div>
              ),
          )}
          {active.kind === 'file' && (
            <div className={styles.pane}>
              <Suspense fallback={<div className={styles.loading} />}>
                <CodeEditor
                  key={active.path}
                  projectId={projectId}
                  path={active.path}
                  claudeAt={claudeAt.get(active.path) ?? null}
                  now={now}
                  onDirty={(d) => setDirty(projectId, active.path, d)}
                />
              </Suspense>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Tab({
  active,
  label,
  title,
  icon,
  mark,
  onSelect,
  onClose,
}: {
  active: boolean;
  label: string;
  title?: string;
  icon?: ReactNode;
  mark?: 'running' | 'dirty';
  onSelect(): void;
  onClose?(): void;
}) {
  return (
    <div className={styles.tab} data-active={active || undefined} title={title}>
      <button
        type="button"
        role="tab"
        aria-selected={active}
        className={styles.tabMain}
        onClick={onSelect}
        onAuxClick={(e) => {
          if (e.button === 1 && onClose) {
            e.preventDefault();
            onClose();
          }
        }}
      >
        {icon}
        <span className={styles.tabLabel}>{label}</span>
        {mark === 'running' && <span className={styles.running} aria-label="working" />}
      </button>
      {onClose && (
        <button
          type="button"
          className={styles.tabClose}
          data-dirty={mark === 'dirty' || undefined}
          aria-label={`Close ${label}`}
          title={mark === 'dirty' ? 'Not saved. Close' : 'Close'}
          onClick={onClose}
        >
          <span className={styles.dirtyDot} aria-hidden="true" />
          <X size={13} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/** A small menu on the tab bar (+ and …). */
function Menu({
  label,
  icon,
  items,
}: {
  label: string;
  icon: ReactNode;
  items: [string, () => void][];
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent ? e.key === 'Escape' : !wrap.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  return (
    <div className={styles.menuWrap} ref={wrap}>
      <button
        type="button"
        className={styles.barBtn}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {icon}
      </button>
      {open && (
        <div className={styles.menu} role="menu" aria-label={label}>
          {items.map(([text, run]) => (
            <button
              key={text}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                run();
              }}
            >
              {text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
