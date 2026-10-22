import { homedir } from 'node:os';
import path from 'node:path';

export type CommandVerdict = { serious: true; reason: string } | { serious: false };

/** Splits a shell line into simple commands on ; && || | and newlines (quotes kept as-is). */
function segments(cmd: string): string[] {
  return cmd
    .split(/\|\||&&|;|\n|\|/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function tokens(segment: string): string[] {
  return (segment.match(/'[^']*'|"[^"]*"|\S+/g) ?? []).map((t) => t.replace(/^['"]|['"]$/g, ''));
}

function insideProject(target: string, cwd: string): boolean {
  if (target.startsWith('~') || target.includes('$') || target.includes('`')) return false;
  const abs = path.resolve(cwd, target);
  const root = path.resolve(cwd);
  return abs !== root && abs.startsWith(root + path.sep) && abs !== homedir();
}

/**
 * Serious commands (docs/security.md → Command rules, ADR-0033). They always ask, also in Auto
 * mode, with the reason shown on the card, and "Allow for this session" never covers them.
 * Background agents skip them and list them under Needs you.
 */
export function classifyCommand(command: string, cwd: string): CommandVerdict {
  if (/(curl|wget)\b[^|]*\|\s*(sudo\s+)?(ba|z|da|k)?sh\b/.test(command)) {
    return { serious: true, reason: 'Pipes a download straight into a shell.' };
  }
  for (const seg of segments(command)) {
    const t = tokens(seg);
    const prog = t[0] ?? '';
    if (prog === 'sudo' || prog === 'doas')
      return { serious: true, reason: 'Runs as root (sudo).' };
    if (prog === 'rm') {
      const flags = t.filter((x) => x.startsWith('-')).join(' ');
      const recursive = /(^|\s)-[a-zA-Z]*[rR]|--recursive/.test(flags);
      if (recursive) {
        const targets = t.slice(1).filter((x) => !x.startsWith('-'));
        const outside = targets.find((x) => !insideProject(x, cwd));
        if (targets.length === 0 || outside !== undefined) {
          return {
            serious: true,
            reason: `Deletes a folder outside the project (${outside ?? 'no target'}).`,
          };
        }
      }
    }
    if (prog === 'git' && t[1] === 'push') {
      const force = t.some(
        (x) => x === '-f' || x === '--force' || x.startsWith('--force-with-lease') || /^\+/.test(x),
      );
      const protectedRef = t.some(
        (x) =>
          /^\+?(refs\/heads\/)?(main|master)$/.test(x) || /:(refs\/heads\/)?(main|master)$/.test(x),
      );
      const refspecs = t.slice(2).filter((x) => !x.startsWith('-'));
      if (force && (protectedRef || refspecs.length <= 1)) {
        return { serious: true, reason: 'Force-pushes to main or master.' };
      }
    }
  }
  return { serious: false };
}

const GH_WRITES: Record<string, string[]> = {
  pr: ['create', 'merge', 'close'],
  repo: ['create', 'delete', 'edit'],
  release: ['create'],
};

/**
 * In auto mode most commands run without asking (ADR-0025). These still ask: pushing, GitHub
 * writes, publishing and deploying, and deleting folders inside the project. Serious commands
 * (classifyCommand) always ask as well.
 */
export function autoNeedsApproval(command: string): boolean {
  for (const seg of segments(command)) {
    const t = tokens(seg);
    // `npx vercel`, `pnpm dlx netlify deploy`: look at the tool that is launched.
    while (['npx', 'pnpx', 'bunx'].includes(t[0] ?? '')) t.shift();
    if (['pnpm', 'yarn', 'npm'].includes(t[0] ?? '') && ['dlx', 'exec'].includes(t[1] ?? ''))
      t.splice(0, 2);
    const prog = path.basename(t[0] ?? '');
    const args = t.slice(1).filter((x) => !x.startsWith('-'));
    if (prog === 'git' && args[0] === 'push') return true;
    if (prog === 'gh' && GH_WRITES[args[0] ?? '']?.includes(args[1] ?? '')) return true;
    if (['npm', 'pnpm', 'yarn', 'bun'].includes(prog) && args.includes('publish')) return true;
    if (['vercel', 'gh-pages', 'wrangler'].includes(prog)) return true;
    if (['netlify', 'fly', 'flyctl', 'firebase'].includes(prog) && args[0] === 'deploy')
      return true;
    if (prog === 'rm' && /(^|\s)-[a-zA-Z]*[rR]|--recursive/.test(t.slice(1).join(' '))) return true;
  }
  return false;
}
