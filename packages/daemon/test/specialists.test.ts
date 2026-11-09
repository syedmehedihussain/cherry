import { describe, expect, it } from 'vitest';
import { stageSpecialists } from '../src/stages/specialists.ts';

// ADR-0061: ECC agents bundled per stage, handed work by the room's staff member.
describe('stage specialists', () => {
  it('loads the bundled ECC agents with their own model and tools', () => {
    const dev = stageSpecialists('development');
    expect(dev.map((a) => a.name)).toEqual([
      'build-error-resolver',
      'code-reviewer',
      'react-reviewer',
      'security-reviewer',
      'tdd-guide',
      'typescript-reviewer',
    ]);
    const reviewer = dev.find((a) => a.name === 'code-reviewer')!;
    expect(reviewer.description).toMatch(/review/i);
    expect(reviewer.prompt.length).toBeGreaterThan(500);
    expect(reviewer.tools).toEqual(['Read', 'Grep', 'Glob', 'Bash']);
    expect(stageSpecialists('plan').find((a) => a.name === 'planner')?.model).toBe('opus');
  });

  it('takes the edit tools from specialists of a docs-only stage', () => {
    const a11y = stageSpecialists('design').find((a) => a.name === 'a11y-architect')!;
    expect(a11y.tools).toEqual(['Read', 'Grep', 'Glob']);
  });

  it('has none for a stage without an agents folder', () => {
    expect(stageSpecialists('idea')).toEqual([]);
  });
});
