import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { BriefSchema, type Brief, type BriefList } from '@cherry/shared';
import { safeName } from '../chat/uploads.ts';
import { badRequest, notFound } from '../http.ts';
import { isSecretFile, resolveInside } from '../paths.ts';

export const BRIEF_FILE = path.join('design', 'brief.json');
/** Where each list's files go: design/references/, design/system/ … */
export const BRIEF_DIRS: Record<BriefList, string> = {
  references: 'design/references',
  system: 'design/system',
  components: 'design/components',
  images: 'design/assets',
};
const MAX_FILE = 20 * 1024 * 1024;
const IMAGE = /\.(png|jpe?g|gif|webp|svg|avif)$/i;
const ALLOWED: Record<BriefList, RegExp> = {
  references: IMAGE,
  images: IMAGE,
  system: /\.(css|scss|json|md|txt|zip|pdf|tokens|ya?ml|png|jpe?g|svg|webp)$/i,
  components: /\.(css|scss|json|md|txt|zip|pdf|png|jpe?g|svg|webp|gif|html?)$/i,
};

export function readBrief(dir: string): Brief {
  const file = path.join(dir, BRIEF_FILE);
  if (!existsSync(file)) return BriefSchema.parse({});
  try {
    return BriefSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  } catch {
    // A hand-broken file: start from empty rather than fail the screen. It is kept as .bak.
    renameSync(file, `${file}.bak`);
    return BriefSchema.parse({});
  }
}

export function writeBrief(dir: string, brief: Brief): Brief {
  const clean = BriefSchema.parse(brief);
  const file = path.join(dir, BRIEF_FILE);
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(clean, null, 2)}\n`);
  renameSync(tmp, file);
  return clean;
}

/** Saves a dropped or picked file into the list's folder and adds it to the brief. */
export function addBriefFile(dir: string, list: BriefList, name: string, data: Buffer): Brief {
  if (!data.length) throw badRequest('The file is empty.');
  if (data.length > MAX_FILE) throw badRequest('The file is larger than 20 MB.');
  const safe = safeName(name);
  if (!ALLOWED[list].test(safe))
    throw badRequest(`Cherry does not keep ${path.extname(safe) || 'this kind of'} files here.`);
  const folder = path.join(dir, BRIEF_DIRS[list]);
  mkdirSync(folder, { recursive: true });
  const ext = path.extname(safe);
  const stem = safe.slice(0, safe.length - ext.length);
  let file = safe;
  for (let n = 2; existsSync(path.join(folder, file)); n++) file = `${stem}-${n}${ext}`;
  writeFileSync(path.join(folder, file), data);
  const brief = readBrief(dir);
  brief[list].push({ kind: 'file', value: `${BRIEF_DIRS[list]}/${file}`, note: '' });
  return writeBrief(dir, brief);
}

/** Removes an item; a file of the brief's own folders is deleted too. */
export function removeBriefItem(dir: string, list: BriefList, value: string): Brief {
  const brief = readBrief(dir);
  const item = brief[list].find((i) => i.value === value);
  if (!item) throw notFound('Not in the brief');
  brief[list] = brief[list].filter((i) => i !== item);
  if (item.kind === 'file' && item.value.startsWith(`${BRIEF_DIRS[list]}/`)) {
    rmSync(resolveInside(dir, item.value), { force: true });
  }
  return writeBrief(dir, brief);
}

/** A file under design/ for a thumbnail; never a secret one, never outside design/. */
export function designFile(dir: string, rel: string): string {
  if (!rel.startsWith('design/') || isSecretFile(rel)) throw notFound('No such file');
  const abs = resolveInside(dir, rel);
  if (!existsSync(abs)) throw notFound('No such file');
  return abs;
}

/** Copies another project's design tokens into design/system/ (Attach a design system). */
export function copyTokensFrom(dir: string, otherDir: string, otherId: string): Brief {
  const from = ['design/tokens.css', 'docs/design/tokens.css']
    .map((p) => path.join(otherDir, p))
    .find((p) => existsSync(p));
  if (!from) throw notFound(`${otherId} has no design/tokens.css or docs/design/tokens.css.`);
  return addBriefFile(dir, 'system', `${otherId}-tokens.css`, readFileSync(from));
}

const run = promisify(execFile);
let fontCache: { at: number; families: string[] } | null = null;

/** Font families installed on this computer (fc-list); empty when it is not there. */
export async function installedFonts(): Promise<string[]> {
  if (fontCache && Date.now() - fontCache.at < 10 * 60_000) return fontCache.families;
  let families: string[];
  try {
    const { stdout } = await run('fc-list', [':', 'family'], { timeout: 5000, maxBuffer: 8 << 20 });
    families = [
      ...new Set(
        stdout
          .split('\n')
          .map((l) => l.split(',')[0]!.trim())
          .filter((f) => f && !f.startsWith('.')),
      ),
    ].sort((a, b) => a.localeCompare(b));
  } catch {
    families = [];
  }
  fontCache = { at: Date.now(), families };
  return families;
}
