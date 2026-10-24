import { beforeEach, describe, expect, it } from 'vitest';
import { tabKey, useDevTabs } from './devTabs.ts';

describe('Development tabs', () => {
  beforeEach(() => {
    localStorage.clear();
    useDevTabs.setState({ tabs: {}, dirty: {} });
  });

  it('opens each file once and remembers file tabs, not terminals', () => {
    const s = useDevTabs.getState();
    s.open('p', { kind: 'file', path: 'a.ts' });
    s.open('p', { kind: 'file', path: 'a.ts' });
    s.open('p', { kind: 'term', id: 't1', title: 'Terminal' });
    expect(useDevTabs.getState().list('p').map(tabKey)).toEqual(['file:a.ts', 'term:t1']);
    useDevTabs.setState({ tabs: {} });
    expect(useDevTabs.getState().list('p').map(tabKey)).toEqual(['file:a.ts']);
  });

  it('closing shows the tab before it, then the next one', () => {
    const s = useDevTabs.getState();
    for (const path of ['a.ts', 'b.ts', 'c.ts']) s.open('p', { kind: 'file', path });
    expect(s.close('p', 'file:b.ts')).toEqual({ kind: 'file', path: 'a.ts' });
    expect(s.close('p', 'file:a.ts')).toEqual({ kind: 'file', path: 'c.ts' });
    expect(s.close('p', 'file:c.ts')).toBeNull();
  });

  it('tracks unsaved files', () => {
    const s = useDevTabs.getState();
    s.open('p', { kind: 'file', path: 'a.ts' });
    s.setDirty('p', 'a.ts', true);
    expect(useDevTabs.getState().dirty.p).toEqual(['a.ts']);
    s.close('p', 'file:a.ts');
    expect(useDevTabs.getState().dirty.p).toEqual([]);
  });
});
