import { mkdirSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  foregroundSubagent,
  isTaskNotification,
  pathGuard,
  preToolGuard,
} from '../src/claude/runner.ts';
import { isSecretFile } from '../src/paths.ts';
import { tempDir, write } from './helpers.ts';

// Security review 2026-10-11, medium finding: auto-allowed file tools stay inside the project.
describe('pathGuard', () => {
  const root = tempDir();
  write(path.join(root, 'src', 'a.ts'), 'x');
  const outside = tempDir();
  write(path.join(outside, 'hosts.yml'), 'token');
  symlinkSync(outside, path.join(root, 'link-out'));
  const extra = tempDir();
  mkdirSync(path.join(extra, 'p'));

  it.each([
    ['Read', { file_path: 'src/a.ts' }],
    ['Read', { file_path: path.join(root, 'src', 'a.ts') }],
    ['Grep', { pattern: 'x' }],
    ['Grep', { pattern: 'x', path: 'src' }],
    ['Glob', { pattern: '**/*.ts' }],
    ['Read', { file_path: path.join(extra, 'p') }],
    ['Bash', { command: 'cat /etc/passwd' }], // commands are approval-gated, not path-checked
  ])('allows %s %j', (tool, input) => {
    expect(pathGuard([root, extra], tool, input)).toBeNull();
  });

  it.each([
    ['Read', { file_path: path.join(outside, 'hosts.yml') }],
    ['Read', { file_path: '../x' }],
    ['Read', { file_path: 'link-out/hosts.yml' }],
    ['Grep', { pattern: 'token', path: outside }],
    ['LS', { path: '/' }],
    ['Glob', { pattern: `${outside}/**` }],
    ['Write', { file_path: 'link-out/new.txt' }],
  ])('refuses %s %j', (tool, input) => {
    expect(pathGuard([root, extra], tool, input)).toMatch(/inside the project folder/);
  });

  it('runs the secret check before the request guard', () => {
    expect(preToolGuard({ cwd: root }, 'Read', { file_path: '.env' })).toMatch(/secret/);
    expect(
      preToolGuard({ cwd: root, guard: () => 'custom' }, 'Read', { file_path: 'src/a.ts' }),
    ).toBe('custom');
  });
});

describe('secret files', () => {
  it.each([['.git-credentials'], ['credentials'], ['cert.p12'], ['id_ecdsa'], ['.pypirc']])(
    'treats %s as secret',
    (f) => {
      expect(isSecretFile(f)).toBe(true);
    },
  );
});

// Demo run (ADR-0061): a background specialist was cut off when the turn ended.
describe('foregroundSubagent', () => {
  it('runs a background subagent in the foreground, and leaves the rest alone', () => {
    expect(
      foregroundSubagent('Agent', { subagent_type: 'a11y-architect', run_in_background: true }),
    ).toEqual({ subagent_type: 'a11y-architect', run_in_background: false });
    expect(foregroundSubagent('Agent', { subagent_type: 'planner' })).toBeNull();
    expect(foregroundSubagent('Bash', { command: 'pnpm dev', run_in_background: true })).toBeNull();
  });

  it("tells a background task's notice from the user's prompt", () => {
    expect(isTaskNotification('<task-notification>\n<task-id>a1</task-id>')).toBe(true);
    expect(isTaskNotification([{ type: 'text', text: '<task-notification>…' }])).toBe(true);
    expect(isTaskNotification('Run the check again')).toBe(false);
    expect(isTaskNotification([{ type: 'tool_result', content: 'x' }])).toBe(false);
  });
});
