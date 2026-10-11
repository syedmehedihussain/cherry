import { mkdirSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { pathGuard, preToolGuard } from '../src/claude/runner.ts';
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
