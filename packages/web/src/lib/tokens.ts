import type { BriefColour } from '@cherry/shared';

/** Common names for each Brief colour in a project's tokens.css, most likely first. */
const NAMES: Record<BriefColour, string[]> = {
  primary: ['primary', 'color-primary', 'brand', 'brand-primary'],
  accent: ['accent', 'color-accent', 'secondary', 'highlight', 'marker'],
  surface: ['surface', 'bg', 'background', 'color-bg', 'paper', 'page'],
  text: ['text', 'fg', 'foreground', 'ink', 'color-text', 'text-primary'],
  muted: ['muted', 'text-muted', 'fg-muted', 'muted-foreground', 'ink-2', 'text-secondary'],
};

/**
 * The Brief colours a project's design/tokens.css already has (finding #29), from its first
 * :root block (the light theme). Only plain hex values; a colour it does not name is left out.
 */
export function tokenColours(css: string): Partial<Record<BriefColour, string>> {
  const root = /:root\s*\{([^}]*)\}/.exec(css.replace(/\/\*[\s\S]*?\*\//g, ''))?.[1] ?? '';
  const vars = new Map<string, string>();
  for (const m of root.matchAll(/--([\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\b/g))
    if (!vars.has(m[1]!.toLowerCase())) vars.set(m[1]!.toLowerCase(), m[2]!);
  const out: Partial<Record<BriefColour, string>> = {};
  for (const [k, names] of Object.entries(NAMES) as [BriefColour, string[]][]) {
    const hit = names.find((n) => vars.has(n));
    if (hit) out[k] = expand(vars.get(hit)!);
  }
  return out;
}

/** #abc → #AABBCC, as the Brief stores colours. */
const expand = (hex: string) =>
  (hex.length === 4
    ? `#${[...hex.slice(1)].map((c) => c + c).join('')}`
    : hex.slice(0, 7)
  ).toUpperCase();
