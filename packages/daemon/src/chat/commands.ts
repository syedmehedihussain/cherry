import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { ProjectCommand } from '@cherry/shared';
import { isSecretFile, resolveInside } from '../paths.ts';
import { frontMatter } from '../projects/status.ts';

const NAME = /^[a-z0-9][a-z0-9_-]{0,40}$/i;
const MAX_BYTES = 64 * 1024;

/**
 * The project's own slash commands (V2.1 w7.1): `.claude/commands/*.md`, like the CLI. Cherry
 * runs Claude without settings files (ADR-0004), so it reads and expands them itself.
 */
export function projectCommands(dir: string): (ProjectCommand & { body: string })[] {
  const folder = path.join(dir, '.claude', 'commands');
  if (!existsSync(folder)) return [];
  const out: (ProjectCommand & { body: string })[] = [];
  for (const file of readdirSync(folder).sort()) {
    if (!file.endsWith('.md')) continue;
    const name = file.slice(0, -3);
    const abs = path.join(folder, file);
    if (!NAME.test(name) || !statSync(abs).isFile() || statSync(abs).size > MAX_BYTES) continue;
    const { fields, body } = frontMatter(readFileSync(abs, 'utf8'));
    const firstLine =
      body
        .split('\n')
        .find((l) => l.trim())
        ?.replace(/^#+\s*/, '') ?? '';
    out.push({
      name,
      description: (fields.description || firstLine).slice(0, 160),
      body: body.trim(),
    });
  }
  return out;
}

/** `/name args` → the command's text with $ARGUMENTS filled in; anything else unchanged. */
export function expandCommand(dir: string, text: string): string {
  const m = /^\/([a-z0-9][a-z0-9_-]*)(?:\s+([\s\S]*))?$/i.exec(text.trim());
  if (!m) return text;
  const cmd = projectCommands(dir).find((c) => c.name === m[1]);
  if (!cmd) return text;
  const args = (m[2] ?? '').trim();
  return cmd.body.includes('$ARGUMENTS')
    ? cmd.body.replaceAll('$ARGUMENTS', args)
    : args
      ? `${cmd.body}\n\n${args}`
      : cmd.body;
}

/**
 * @ mentions (V2.1 w7.2): `@docs/prd.md` names a file. Claude gets a line listing the mentioned
 * files that exist (not secret ones) so it reads them; the chat keeps the text as typed.
 */
export function withMentions(dir: string, text: string): string {
  const files = new Set<string>();
  for (const m of text.matchAll(/(?:^|\s)@([\w./-]+[\w-])/g)) {
    const rel = m[1]!;
    try {
      const abs = resolveInside(dir, rel);
      if (!isSecretFile(rel) && existsSync(abs) && statSync(abs).isFile()) files.add(rel);
    } catch {
      // Outside the project: not a mention.
    }
  }
  return files.size
    ? `${text}\n\n(Files I mentioned: ${[...files].join(', ')}. Read them first.)`
    : text;
}
