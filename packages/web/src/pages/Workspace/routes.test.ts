import { describe, expect, it } from 'vitest';
import { parseSplat } from './Workspace.tsx';

describe('workspace routes', () => {
  it('is the stage when no view is open', () => {
    expect(parseSplat('')).toBeNull();
    expect(parseSplat('issues')).toBeNull();
  });
  it('opens views from the palette', () => {
    expect(parseSplat('notes')).toEqual({ view: 'notes' });
    expect(parseSplat('decisions')).toEqual({ view: 'decisions' });
    expect(parseSplat('docs')).toEqual({ view: 'docs', path: null });
    expect(parseSplat('docs/docs/prd.md')).toEqual({ view: 'docs', path: 'docs/prd.md' });
    expect(parseSplat('files/lib/a.ts')).toEqual({ view: 'file', path: 'lib/a.ts' });
    expect(parseSplat('reports/security/r1')).toEqual({ view: 'report', path: 'security/r1' });
  });
});
