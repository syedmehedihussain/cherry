import { describe, expect, it } from 'vitest';
import { tidyGitignore } from '../src/survey/gitignore.ts';

describe('tidyGitignore', () => {
  it('drops code fences and _project/, keeps the base lines once', () => {
    const out = tidyGitignore('```gitignore\n# Python\n__pycache__/\n.env\n_project/\n```\n');
    expect(out).not.toContain('```');
    expect(out).not.toMatch(/^_project\/$/m);
    expect(out.match(/^\.env$/gm)).toHaveLength(1);
    expect(out).toContain('__pycache__/');
    expect(out.endsWith('\n')).toBe(true);
  });

  it('falls back to the base lines when Claude gives nothing', () => {
    expect(tidyGitignore('')).toContain('.env');
  });
});
