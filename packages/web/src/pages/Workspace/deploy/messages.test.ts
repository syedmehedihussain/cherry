import { describe, expect, it } from 'vitest';
import type { Check, DeployInfo } from '@cherry/shared';
import { deployMessage, fixMessage } from './DeployStage.tsx';

describe('cockpit messages', () => {
  it('Fix in Development names the check, the command and the end of the output', () => {
    const check: Check = {
      id: 'lint',
      label: 'Lint',
      command: 'pnpm lint',
      status: 'fail',
      summary: '1 error',
      durationMs: 10,
      output: Array.from({ length: 80 }, (_, i) => `line ${i}`).join('\n'),
      finishedAt: 1,
    };
    const m = fixMessage(check);
    expect(m).toMatch(/^The lint check fails/);
    expect(m).toContain('`pnpm lint`');
    expect(m).toContain('line 79');
    expect(m).not.toContain('line 10\n');
  });
  it('Deploy says what and where', () => {
    const info: DeployInfo = {
      target: { kind: 'github-pages', label: 'GitHub Pages', source: 'workflow' },
      repo: 'me/runlog',
      version: '0.1.0',
      last: null,
      branch: 'main',
      changes: 0,
    };
    expect(deployMessage(info)).toMatch(/^Deploy version 0\.1\.0 to GitHub Pages \(me\/runlog\)\./);
  });
});
