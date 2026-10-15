import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Adr, AdrProposal, AdrState } from '@cherry/shared';
import { readTextOrNull, writeFileAtomic } from '../fsutil.ts';

/** ADR files are `NNNN-kebab-title.md` (project-standard.md → ADR format). */
const ADR_FILE = /^(\d{4})-[a-z0-9-]+\.md$/;
/** The header list under the title: `- **Status:** Accepted`. */
const FIELD = /^- \*\*([^*:]+):\*\*\s*(.*)$/;

export type ParsedAdr = Omit<Adr, 'file' | 'applying'>;

function fields(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of text.split('\n')) {
    if (line.startsWith('## ')) break;
    const m = FIELD.exec(line.trim());
    if (m) out.set(m[1]!.trim().toLowerCase(), m[2]!.trim());
  }
  return out;
}

function section(text: string, name: string): string {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.trim().toLowerCase() === `## ${name}`);
  if (start < 0) return '';
  const end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  return lines
    .slice(start + 1, end < 0 ? undefined : end)
    .join('\n')
    .trim();
}

/** Proposed, Accepted (with or without "Done: not yet"), Rejected, Superseded … */
export function stateOf(status: string, done: string | undefined): AdrState {
  const s = status.toLowerCase();
  if (s.startsWith('proposed')) return 'pending';
  if (s.startsWith('rejected')) return 'rejected';
  if (s.startsWith('accepted') && done?.toLowerCase() === 'not yet') return 'approved';
  return 'done';
}

export function parseAdr(fileName: string, text: string): ParsedAdr {
  const heading = /^#\s+(.+)$/m.exec(text)?.[1]?.trim() ?? fileName;
  const m = /^(?:ADR[- ]?)?(\d+)\s*[—–:-]\s*(.+)$/i.exec(heading);
  const number = Number(m?.[1] ?? fileName.slice(0, 4));
  const f = fields(text);
  const status = f.get('status') ?? 'Accepted';
  const done = f.get('done');
  return {
    number,
    title: m?.[2]?.trim() ?? heading,
    status,
    state: stateOf(status, done),
    date: f.get('date') ?? null,
    doneAt: done && done.toLowerCase() !== 'not yet' ? done : null,
    rejectedBecause: f.get('rejected because') || null,
    proposedBy: f.get('proposed by') ?? null,
    context:
      section(text, 'context')
        .split(/\n\s*\n/)[0]
        ?.trim() ?? '',
    decision: section(text, 'decision'),
    options: section(text, 'options')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^(\d+\.|-)\s/.test(l))
      .map((l) => l.replace(/^(\d+\.|-)\s+/, '')),
  };
}

/** Every ADR in the folder, newest number first. template.md and other files are skipped. */
export function listAdrs(dir: string): { file: string; adr: ParsedAdr }[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => ADR_FILE.test(f))
    .map((f) => ({ file: f, adr: parseAdr(f, readTextOrNull(path.join(dir, f)) ?? '') }))
    .sort((a, b) => b.adr.number - a.adr.number || b.file.localeCompare(a.file));
}

export function findAdr(dir: string, number: number): { file: string; adr: ParsedAdr } | null {
  return listAdrs(dir).find((a) => a.adr.number === number) ?? null;
}

export function slugOf(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
      .replace(/-+$/, '') || 'decision'
  );
}

const today = () => new Date().toISOString().slice(0, 10);

export function proposalText(number: number, p: AdrProposal, proposedBy: string): string {
  const nnnn = String(number).padStart(4, '0');
  return [
    `# ${nnnn} — ${p.title}`,
    '',
    '- **Status:** Proposed',
    `- **Date:** ${today()}`,
    `- **Proposed by:** ${proposedBy}`,
    '',
    '## Context',
    '',
    p.context,
    '',
    ...(p.options.length
      ? [
          '## Options',
          '',
          ...p.options.map(
            (o, i) => `${i + 1}. **${o.title}**${o.tradeoff ? ` — Trade-off: ${o.tradeoff}` : ''}`,
          ),
          '',
        ]
      : []),
    '## Decision',
    '',
    p.proposal,
    '',
    ...(p.consequences.length
      ? ['## Consequences', '', ...p.consequences.map((c) => `- ${c}`), '']
      : []),
  ].join('\n');
}

/**
 * Writes a new Proposed ADR with the next free number. Never replaces a file: the write fails if
 * the name exists, and the next number is tried (CLAUDE.md rule 3).
 */
export function writeProposal(
  dir: string,
  p: AdrProposal,
  proposedBy: string,
): { file: string; number: number } {
  mkdirSync(dir, { recursive: true });
  let number = Math.max(0, ...listAdrs(dir).map((a) => a.adr.number)) + 1;
  for (let tries = 0; tries < 20; tries++, number++) {
    const file = `${String(number).padStart(4, '0')}-${slugOf(p.title)}.md`;
    if (readdirSync(dir).some((f) => f.startsWith(`${String(number).padStart(4, '0')}-`))) continue;
    try {
      writeFileSync(path.join(dir, file), proposalText(number, p, proposedBy), { flag: 'wx' });
      return { file, number };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
  }
  throw new Error('Could not find a free ADR number.');
}

/**
 * Sets (or with null, removes) header fields like Status and Done. Only those lines change; a new
 * field goes after the last header line. The rest of the file stays byte for byte.
 */
export function setFields(text: string, set: Record<string, string | null>): string {
  const lines = text.split('\n');
  for (const [key, value] of Object.entries(set)) {
    const firstSection = lines.findIndex((l) => l.startsWith('## '));
    const headEnd = firstSection < 0 ? lines.length : firstSection;
    let at = -1;
    let last = -1;
    for (let i = 0; i < headEnd; i++) {
      const m = FIELD.exec(lines[i]!.trim());
      if (!m) continue;
      last = i;
      if (m[1]!.trim().toLowerCase() === key.toLowerCase()) at = i;
    }
    const line = `- **${key}:** ${value}`;
    if (at >= 0) {
      if (value === null) lines.splice(at, 1);
      else lines[at] = line;
    } else if (value !== null) {
      const title = lines.findIndex((l) => l.startsWith('# '));
      lines.splice(last >= 0 ? last + 1 : title + 1, 0, line);
    }
  }
  return lines.join('\n');
}

export function updateAdr(dir: string, file: string, set: Record<string, string | null>): void {
  const abs = path.join(dir, file);
  const text = readTextOrNull(abs);
  if (text === null) throw new Error(`${file} is missing.`);
  writeFileAtomic(abs, setFields(text, set));
}

export const adrDate = today;
