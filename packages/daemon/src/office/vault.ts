import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { localDay, type VaultDoc } from '@cherry/shared';
import { writeFileAtomic } from '../fsutil.ts';
import { badRequest, conflict } from '../http.ts';

/** Folders that hold code, builds or personal state: never in the vault. */
const SKIP = new Set([
  'node_modules',
  '.git',
  '_project',
  'cherry',
  'dist',
  'build',
  'out',
  '.next',
  '.turbo',
  'coverage',
  'vendor',
  '.venv',
  'target',
]);
const DOC = /\.(md|mdx)$/i;
const MAX_DOCS = 500;
const MAX_TEXT = 20_000;

/**
 * The project's documents for the Docs tab (V4 o14): every Markdown file outside code and build
 * folders, with its title, headings, links to other documents, and its text for search.
 */
export function readVault(dir: string): { docs: VaultDoc[]; truncated: boolean } {
  const files: string[] = [];
  let truncated = false;
  const walk = (rel: string, depth: number) => {
    if (depth > 6 || truncated) return;
    let names: string[];
    try {
      names = readdirSync(path.join(dir, rel)).sort();
    } catch {
      return;
    }
    for (const name of names) {
      if (name.startsWith('.') && name !== '.github') continue;
      const r = rel ? `${rel}/${name}` : name;
      let st;
      try {
        st = statSync(path.join(dir, r));
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (!SKIP.has(name)) walk(r, depth + 1);
      } else if (DOC.test(name) && st.size < 1024 * 1024) {
        if (files.length >= MAX_DOCS) {
          truncated = true;
          return;
        }
        files.push(r);
      }
    }
  };
  walk('', 0);
  const known = new Set(files);
  const byTitle = new Map<string, string>();
  const docs = files.map((rel) => {
    const raw = readFileSync(path.join(dir, rel), 'utf8').replace(
      /^---\r?\n[\s\S]*?\r?\n---\r?\n?/,
      '',
    );
    const headings = [...raw.matchAll(/^(#{1,3})\s+(.+?)\s*#*\s*$/gm)].map((m) => ({
      level: m[1]!.length,
      text: m[2]!,
    }));
    const title = headings.find((h) => h.level === 1)?.text ?? path.basename(rel).replace(DOC, '');
    byTitle.set(title.toLowerCase(), rel);
    byTitle.set(path.basename(rel).replace(DOC, '').toLowerCase(), rel);
    const text = raw.replace(/```[\s\S]*?```/g, ' ').replace(/[#*_`>|[\]()-]/g, ' ');
    return {
      rel,
      raw,
      doc: {
        path: rel,
        title,
        headings,
        links: [] as string[],
        words: text.split(/\s+/).filter(Boolean).length,
        mtime: statSync(path.join(dir, rel)).mtimeMs,
        text: text.replace(/\s+/g, ' ').slice(0, MAX_TEXT),
      },
    };
  });
  for (const { rel, raw, doc } of docs) {
    const out = new Set<string>();
    for (const m of raw.matchAll(/\]\(([^)\s#]+\.mdx?)(?:#[^)]*)?\)/gi)) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1]!));
      if (known.has(target) && target !== rel) out.add(target);
    }
    for (const m of raw.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)) {
      const target = byTitle.get(m[1]!.trim().toLowerCase());
      if (target && target !== rel) out.add(target);
    }
    doc.links = [...out];
  }
  return { docs: docs.map((d) => d.doc), truncated };
}

/** A new note, `docs/notes/<name>.md`; never overwrites a file (rule 3). */
export function newNote(dir: string, name: string): { path: string } {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  if (!slug) throw badRequest('Give the note a name.');
  const rel = `docs/notes/${slug}.md`;
  const file = path.join(dir, rel);
  if (existsSync(file)) throw conflict(`${rel} exists. Open it from the tree.`);
  writeFileAtomic(file, `# ${name.trim()}\n\n`);
  return { path: rel };
}

/** The Meeting tab's notes, `docs/meetings/<date>.md`; a second meeting that day gets -2. */
export function meetingNotes(dir: string, text: string): { path: string } {
  const day = localDay();
  for (let n = 1; n < 100; n++) {
    const rel = `docs/meetings/${day}${n === 1 ? '' : `-${n}`}.md`;
    if (existsSync(path.join(dir, rel))) continue;
    writeFileAtomic(path.join(dir, rel), text.endsWith('\n') ? text : `${text}\n`);
    return { path: rel };
  }
  throw conflict('Too many meeting notes today.');
}
