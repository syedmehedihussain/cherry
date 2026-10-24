import { create } from 'zustand';

/**
 * Development's one tabbed area (V3 r4, artboard 03): Claude is pinned first; files and
 * terminals open as tabs next to it. No split (the user's choice, 2026-10-25).
 */
export type DevTab = { kind: 'file'; path: string } | { kind: 'term'; id: string; title: string };

/** Which tab shows: Claude, or one of the open tabs. Comes from the URL. */
export type ActiveTab =
  { kind: 'claude' } | { kind: 'file'; path: string } | { kind: 'term'; id: string };

export const tabKey = (t: DevTab | ActiveTab): string =>
  t.kind === 'claude' ? 'claude' : t.kind === 'file' ? `file:${t.path}` : `term:${t.id}`;

const KEY = (projectId: string) => `cherry.devTabs.${projectId}`;

function load(projectId: string): DevTab[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY(projectId)) ?? '[]') as unknown;
    // Terminals end with the page; only file tabs come back.
    return Array.isArray(raw)
      ? raw.filter(
          (t): t is DevTab =>
            !!t && typeof t === 'object' && t.kind === 'file' && typeof t.path === 'string',
        )
      : [];
  } catch {
    return [];
  }
}

function keep(projectId: string, tabs: DevTab[]) {
  try {
    localStorage.setItem(KEY(projectId), JSON.stringify(tabs.filter((t) => t.kind === 'file')));
  } catch {
    // Private window: the tabs are not remembered.
  }
}

interface DevTabsState {
  tabs: Record<string, DevTab[] | undefined>;
  /** Files with unsaved edits, per project. */
  dirty: Record<string, string[] | undefined>;
  list(projectId: string): DevTab[];
  open(projectId: string, tab: DevTab): void;
  /** Closes a tab; returns the tab to show next, when the closed one was showing. */
  close(projectId: string, key: string): DevTab | null;
  closeAll(projectId: string): void;
  setDirty(projectId: string, path: string, dirty: boolean): void;
}

export const useDevTabs = create<DevTabsState>((set, get) => ({
  tabs: {},
  dirty: {},
  list: (projectId) => get().tabs[projectId] ?? load(projectId),
  open: (projectId, tab) => {
    const list = get().list(projectId);
    if (list.some((t) => tabKey(t) === tabKey(tab))) {
      if (!get().tabs[projectId]) set((s) => ({ tabs: { ...s.tabs, [projectId]: list } }));
      return;
    }
    const next = [...list, tab];
    keep(projectId, next);
    set((s) => ({ tabs: { ...s.tabs, [projectId]: next } }));
  },
  close: (projectId, key) => {
    const list = get().list(projectId);
    const i = list.findIndex((t) => tabKey(t) === key);
    if (i < 0) return null;
    const next = list.filter((_, n) => n !== i);
    keep(projectId, next);
    set((s) => ({
      tabs: { ...s.tabs, [projectId]: next },
      dirty: {
        ...s.dirty,
        [projectId]: (s.dirty[projectId] ?? []).filter((p) => `file:${p}` !== key),
      },
    }));
    return next[i - 1] ?? next[i] ?? null;
  },
  closeAll: (projectId) => {
    keep(projectId, []);
    set((s) => ({ tabs: { ...s.tabs, [projectId]: [] }, dirty: { ...s.dirty, [projectId]: [] } }));
  },
  setDirty: (projectId, path, dirty) =>
    set((s) => {
      const now = new Set(s.dirty[projectId] ?? []);
      if (dirty === now.has(path)) return s;
      if (dirty) now.add(path);
      else now.delete(path);
      return { dirty: { ...s.dirty, [projectId]: [...now] } };
    }),
}));

/** The project's tabs, in a form a component can subscribe to. */
export const useTabList = (projectId: string): DevTab[] =>
  useDevTabs((s) => s.tabs[projectId]) ?? load(projectId);
