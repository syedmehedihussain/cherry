import { describe, expect, it } from 'vitest';
import type { ChatItem, DocsList } from '@cherry/shared';
import { PLAN_DOCS, planDocRows, quoteFor, writingNow } from './planDocs.ts';

const doc = (path: string, tag = 'MD') => ({ path, title: path, tag, mtime: 1 });
const docs: DocsList = {
  project: [doc('CLAUDE.md')],
  engineering: [
    doc('docs/prd.md', 'PRD'),
    doc('docs/specs/offline.md'),
    doc('docs/issues/0001-x.md'),
  ],
  decisions: [doc('docs/adr/0001-a.md', '0001'), doc('docs/adr/0002-b.md', '0002')],
};

describe('plan documents', () => {
  it('ticks the documents that exist and opens the newest ADR', () => {
    const { rows, more } = planDocRows(docs, new Set());
    expect(rows).toHaveLength(PLAN_DOCS.length);
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(by.prd!.state).toBe('written');
    expect(by.claude!.state).toBe('written');
    expect(by.trd!.state).toBe('missing');
    expect(by.trd!.open).toBeNull();
    expect(by.adr!.state).toBe('written');
    expect(by.adr!.open).toBe('docs/adr/0002-b.md');
    // Specs show under the set; issues do not.
    expect(more.map((m) => m.path)).toEqual(['docs/specs/offline.md']);
  });

  it('marks a document the Planner is writing now', () => {
    const items = [
      {
        kind: 'tool',
        id: 't',
        at: 0,
        turnId: 'x',
        tool: 'Write',
        verb: 'edit',
        target: 'docs/api.md',
        status: 'running',
        meta: null,
        added: null,
        removed: null,
        durationMs: null,
        approvalId: null,
      },
    ] satisfies ChatItem[];
    const { rows } = planDocRows(docs, writingNow(items));
    expect(rows.find((r) => r.id === 'api')!.state).toBe('writing');
  });

  it('quotes a selection for the composer', () => {
    expect(quoteFor('docs/prd.md', 'one\ntwo ')).toBe('About docs/prd.md:\n> one\n> two\n\n');
  });
});
