import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { OfficeStage, StageDoc, StageDocs } from '@cherry/shared';

/**
 * V3 projects keep the plan documents flat in `docs/` (docs/v3-redesign.md). ADR-0053 reads them
 * where they are, as technical documents of the stage they belong to; Cherry never moves them.
 */
const LEGACY: Partial<Record<OfficeStage, string[]>> = {
  plan: [
    'docs/prd.md',
    'docs/trd.md',
    'docs/architecture.md',
    'docs/data-model.md',
    'docs/api.md',
    'docs/roadmap.md',
    'docs/adr/',
  ],
  design: ['docs/design-system.md', 'docs/screens.md', 'design/handoff/'],
  testing: ['docs/test-plan.md'],
  deployment: ['docs/runbook.md', 'CHANGELOG.md'],
};

const DOC = /\.(md|mdx|txt)$/i;
const MAX = 60;

/** The documents of one stage: `docs/<stage>/client|technical/` (ADR-0053), then legacy files. */
export function stageDocs(dir: string, stage: OfficeStage): StageDocs {
  const client = listDocs(dir, `docs/${stage}/client/`);
  const technical = listDocs(dir, `docs/${stage}/technical/`);
  const seen = new Set(technical.map((d) => d.path));
  for (const entry of LEGACY[stage] ?? []) {
    const found = entry.endsWith('/')
      ? listDocs(dir, entry)
      : isFile(path.join(dir, entry))
        ? [doc(dir, entry)]
        : [];
    for (const d of found) {
      if (seen.has(d.path) || technical.length >= MAX) continue;
      seen.add(d.path);
      technical.push({ ...d, legacy: true });
    }
  }
  return { client: client.slice(0, MAX), technical };
}

/** Markdown files in a folder and one level of sub-folders, sorted by path. */
function listDocs(dir: string, rel: string): StageDoc[] {
  const out: StageDoc[] = [];
  const walk = (sub: string, depth: number) => {
    let names: string[];
    try {
      names = readdirSync(path.join(dir, sub)).sort();
    } catch {
      return;
    }
    for (const name of names) {
      if (name.startsWith('.')) continue;
      const r = sub + name;
      const abs = path.join(dir, r);
      if (isFile(abs) && DOC.test(name)) out.push(doc(dir, r));
      else if (depth < 1 && isDir(abs)) walk(`${r}/`, depth + 1);
      if (out.length >= MAX) return;
    }
  };
  walk(rel, 0);
  return out;
}

/** The first `# ` heading in the first 4 KB, or the file name. */
function doc(dir: string, rel: string): StageDoc {
  let title = path.basename(rel).replace(/\.[^.]+$/, '');
  try {
    const head = readFileSync(path.join(dir, rel), 'utf8').slice(0, 4096);
    const m = /^#\s+(.+?)\s*$/m.exec(head);
    if (m) title = m[1]!;
  } catch {
    // Keep the file name.
  }
  return { path: rel, title, legacy: false };
}

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}
