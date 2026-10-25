import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { DesignScreen } from '@cherry/shared';
import { isSecretFile, resolveInside } from '../paths.ts';

export const SCREENS_DIR = path.join('design', 'screens');
const MAX_SCREEN = 2_000_000;
const MAX_ASSET = 3_000_000;
const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
};

const isRemote = (ref: string) => /^(?:[a-z]+:|\/\/|#)/i.test(ref);

/**
 * A file the screen links, as text or a data URI. Only files inside the project, never a
 * secret one, never a remote address (the canvas frame cannot fetch anything).
 */
function readAsset(root: string, fromDir: string, ref: string, as: 'text' | 'data'): string | null {
  if (!ref || isRemote(ref)) return null;
  try {
    const clean = decodeURIComponent(ref.split(/[?#]/)[0]!);
    const abs = resolveInside(root, path.relative(root, path.resolve(fromDir, clean)));
    const rel = path.relative(root, abs);
    if (isSecretFile(rel) || !existsSync(abs)) return null;
    const st = statSync(abs);
    if (!st.isFile() || st.size > MAX_ASSET) return null;
    if (as === 'text') return readFileSync(abs, 'utf8');
    const mime = MIME[path.extname(abs).toLowerCase()];
    if (!mime) return null;
    return `data:${mime};base64,${readFileSync(abs).toString('base64')}`;
  } catch {
    return null;
  }
}

/** CSS with its url(...) references inlined. */
function inlineCss(root: string, dir: string, css: string): string {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (whole, _q, ref: string) => {
    const data = readAsset(root, dir, ref.trim(), 'data');
    return data ? `url("${data}")` : whole;
  });
}

/** The screen's HTML with linked stylesheets, images and CSS urls inlined. */
export function inlineScreen(root: string, file: string, html: string): string {
  const dir = path.dirname(file);
  let out = html.replace(/<link\b[^>]*?rel=["']?stylesheet["']?[^>]*>/gi, (tag) => {
    const href = /href=["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href) return tag;
    const css = readAsset(root, dir, href, 'text');
    if (css === null) return tag;
    const cssDir = path.dirname(path.resolve(dir, href));
    return `<style data-from="${href.replace(/"/g, '')}">${inlineCss(root, cssDir, css)}</style>`;
  });
  out = out.replace(
    /(<(?:img|source|image)\b[^>]*?\s(?:src|href)=)(["'])([^"']+)\2/gi,
    (whole, pre: string, q: string, ref: string) => {
      const data = readAsset(root, dir, ref, 'data');
      return data ? `${pre}${q}${data}${q}` : whole;
    },
  );
  out = out.replace(
    /<style\b([^>]*)>([\s\S]*?)<\/style>/gi,
    (_w, attrs: string, css: string) => `<style${attrs}>${inlineCss(root, dir, css)}</style>`,
  );
  return out;
}

/** Every screen in design/screens/, in name order. */
export function listScreens(root: string): DesignScreen[] {
  const dir = path.join(root, SCREENS_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && /\.html?$/i.test(e.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((e) => {
      const abs = path.join(dir, e.name);
      const st = statSync(abs);
      if (st.size > MAX_SCREEN) return [];
      const html = readFileSync(abs, 'utf8');
      const name = e.name.replace(/\.html?$/i, '');
      const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() || name;
      return [
        {
          path: `${SCREENS_DIR.split(path.sep).join('/')}/${e.name}`,
          name,
          title,
          html: inlineScreen(root, abs, html),
          mtime: st.mtimeMs,
        },
      ];
    });
}
