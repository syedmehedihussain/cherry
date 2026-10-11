import type { Runner } from '../claude/runner.ts';

/** Always in, whatever Haiku says: secrets and editor noise. */
const BASE = ['.env', '.env.*', '!.env.example', '.DS_Store', '*.log'];
const MAX = 4000;

/** Turns Haiku's answer into a clean .gitignore: no fences, the base lines first, no duplicates. */
export function tidyGitignore(answer: string): string {
  const body = answer
    .replace(/```[a-z]*\n?/gi, '')
    .slice(0, MAX)
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => !/^_project\/?$/.test(l.trim())); // _project/ is excluded per clone, not here
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of ['# Secrets and system files', ...BASE, '', ...body]) {
    const key = l.trim();
    if (key && !key.startsWith('#') && seen.has(key)) continue;
    if (key) seen.add(key);
    out.push(l);
  }
  return (
    out
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim() + '\n'
  );
}

/**
 * One small Haiku call: a .gitignore for the chosen stack (ADR-0023). Automatic but tiny, as the
 * token rule allows. Falls back to the base lines if Claude does not answer.
 */
export async function draftGitignore(
  runner: Runner,
  cwd: string,
  stack: string[],
): Promise<string> {
  let text = '';
  const handle = runner({
    cwd,
    prompt: [
      `Write a .gitignore for a new project with this stack: ${stack.join(', ') || 'unknown'}.`,
      'Only the file content: short # section comments and patterns. Cover build output, caches, dependencies, virtual environments, local env files and editor folders for this stack. No prose, no code fences.',
    ].join('\n'),
    resume: null,
    model: 'haiku',
    planMode: false,
    appendSystemPrompt:
      'You write one .gitignore file for Cherry. Answer with the file content only.',
    allowedTools: [],
    disallowedTools: [
      'Read',
      'Glob',
      'Grep',
      'Edit',
      'Write',
      'MultiEdit',
      'NotebookEdit',
      'Bash',
      'WebFetch',
      'WebSearch',
    ],
    decisions: false,
    onPermission: async () => ({ allow: false, message: 'No tools here.' }),
    onDecision: async () => ({ ok: false, error: 'No questions here.' }),
    onEvent: (ev) => {
      if (ev.t === 'text') text += ev.delta;
    },
  });
  await handle.done.catch(() => undefined);
  return tidyGitignore(text);
}
