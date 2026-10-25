import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Brief, DesignScreen } from '@cherry/shared';
import { badRequest } from '../http.ts';
import { isSecretFile } from '../paths.ts';
import { readBrief } from './brief.ts';
import { listScreens } from './screens.ts';
import { zip, type ZipEntry } from './zip.ts';

export const HANDOFF_DIR = 'design/handoff';

/** The classes a screen uses, most used first: a first list of components. */
function classesOf(html: string): Map<string, number> {
  const counts = new Map<string, number>();
  const body = html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '');
  for (const m of body.matchAll(/class=["']([^"']+)["']/g))
    for (const c of m[1]!.split(/\s+/).filter(Boolean)) counts.set(c, (counts.get(c) ?? 0) + 1);
  return counts;
}

export function componentList(
  screens: DesignScreen[],
): { name: string; screens: string[]; uses: number }[] {
  const all = new Map<string, { screens: Set<string>; uses: number }>();
  for (const s of screens)
    for (const [c, n] of classesOf(s.html)) {
      const e = all.get(c) ?? { screens: new Set<string>(), uses: 0 };
      e.screens.add(s.name);
      e.uses += n;
      all.set(c, e);
    }
  return [...all.entries()]
    .map(([name, e]) => ({ name, screens: [...e.screens], uses: e.uses }))
    .sort(
      (a, b) =>
        b.screens.length - a.screens.length || b.uses - a.uses || a.name.localeCompare(b.name),
    );
}

function notesFor(screens: DesignScreen[], brief: Brief, hasTokens: boolean, at: Date): string {
  const c = brief.colours;
  const colours = (Object.entries(c) as [string, string | null][]).filter(([, v]) => v);
  const fonts = (
    Object.entries(brief.fonts) as [string, { family: string; weight: number } | null][]
  ).filter(([, v]) => v);
  return [
    '# Design handoff',
    '',
    `Approved ${at.toISOString().slice(0, 10)} in Cherry. Written by Approve design; do not edit by hand.`,
    "The Designer's own notes, if any, are in `design/handoff/notes.md`.",
    '',
    '## Screens',
    '',
    ...screens.map((s) => `- **${s.title}**: \`screens/${s.name}.html\` (from \`${s.path}\`).`),
    '',
    'Each screen file is standalone: its CSS and images are inside it. Open it in a browser.',
    '',
    '## Design system',
    '',
    hasTokens
      ? '- `tokens.css`: the colours, type and spacing as CSS variables. Use these names in the app.'
      : '- No `design/tokens.css` yet. Ask the Designer for one before you build.',
    ...(colours.length
      ? [
          '',
          '| Colour | Value |',
          '| --- | --- |',
          ...colours.map(([k, v]) => `| ${k} | \`${v}\` |`),
        ]
      : []),
    ...(fonts.length
      ? [
          '',
          '| Font | Family | Weight |',
          '| --- | --- | --- |',
          ...fonts.map(([k, v]) => `| ${k} | ${v!.family} | ${v!.weight} |`),
        ]
      : []),
    '',
    '## Components',
    '',
    'See `components.md`: the classes the screens share, a first list of components to build.',
    '',
    '## For the Builder',
    '',
    '1. Read the plan first: `docs/prd.md`, `docs/roadmap.md`, `docs/test-plan.md`.',
    '2. Build each screen to match its file here. Use `tokens.css`; do not copy colours by hand.',
    '3. Build the shared components first, then the screens.',
    '4. When a screen and the plan do not agree, the plan wins. Ask in the chat.',
    '',
  ].join('\n');
}

/**
 * Approve design (r9): writes design/handoff/ with standalone screens, tokens.css, a component
 * list and notes for the Builder. The Designer's own notes.md is never replaced.
 */
export function writeHandoff(dir: string, at = new Date()): { files: string[] } {
  const screens = listScreens(dir);
  if (!screens.length) throw badRequest('There are no screens in design/screens/ to hand over.');
  const brief = readBrief(dir);
  const out = path.join(dir, HANDOFF_DIR);
  mkdirSync(path.join(out, 'screens'), { recursive: true });
  const files: string[] = [];
  const put = (rel: string, text: string) => {
    writeFileSync(path.join(out, rel), text);
    files.push(`${HANDOFF_DIR}/${rel}`);
  };
  for (const s of screens) put(`screens/${s.name}.html`, s.html);
  const tokens = path.join(dir, 'design', 'tokens.css');
  const hasTokens = existsSync(tokens);
  if (hasTokens) put('tokens.css', readFileSync(tokens, 'utf8'));
  const comps = componentList(screens);
  put(
    'components.md',
    [
      '# Components',
      '',
      'Classes the screens use, shared ones first. Build these as components.',
      '',
      '| Class | Screens | Uses |',
      '| --- | --- | --- |',
      ...comps.map((c) => `| \`.${c.name}\` | ${c.screens.join(', ')} | ${c.uses} |`),
      '',
    ].join('\n'),
  );
  put('README.md', notesFor(screens, brief, hasTokens, at));
  return { files };
}

/** Files under a folder, project-relative, skipping secrets and big files. */
function walk(dir: string, rel: string, out: string[]): void {
  const abs = path.join(dir, rel);
  if (!existsSync(abs)) return;
  const st = statSync(abs);
  if (st.isFile()) {
    if (!isSecretFile(rel) && st.size < 20_000_000) out.push(rel);
    return;
  }
  for (const e of readdirSync(abs, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'issues') continue;
    walk(dir, `${rel}/${e.name}`, out);
  }
}

/** Export (r9): the plan and the handoff in one zip, to use outside Cherry. */
export function exportZip(dir: string, projectId: string): Buffer {
  const files: string[] = [];
  for (const rel of ['CLAUDE.md', 'README.md', 'docs', 'design']) walk(dir, rel, files);
  const entries: ZipEntry[] = files.map((rel) => ({
    name: `${projectId}/${rel}`,
    data: readFileSync(path.join(dir, rel)),
    mtime: statSync(path.join(dir, rel)).mtime,
  }));
  return zip(entries);
}
