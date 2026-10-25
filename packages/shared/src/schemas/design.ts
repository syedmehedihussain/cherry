import { z } from 'zod';

/** One screen on the Design canvas (V3 r7): an HTML file in design/screens/. */
export const DesignScreenSchema = z.object({
  /** Project-relative, e.g. design/screens/today.html. */
  path: z.string(),
  /** The file name without .html. */
  name: z.string(),
  /** The page's <title>, or the name. */
  title: z.string(),
  /** The page with its local CSS and images inlined, for a sandboxed frame. */
  html: z.string(),
  mtime: z.number(),
});
export type DesignScreen = z.infer<typeof DesignScreenSchema>;

export const DesignScreensSchema = z.object({ screens: z.array(DesignScreenSchema) });

/** A thing in the brief: a file in design/ or a link the user pasted (never fetched). */
export const BriefItemSchema = z.object({
  kind: z.enum(['file', 'link']),
  /** Project-relative path for a file, the URL for a link. */
  value: z.string().min(1).max(2000),
  note: z.string().max(300).default(''),
});
export type BriefItem = z.infer<typeof BriefItemSchema>;

const Hex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .nullable()
  .default(null);
export const FontPickSchema = z.object({
  family: z.string().min(1).max(120),
  weight: z.number().int().min(100).max(900).default(400),
});
export type FontPick = z.infer<typeof FontPickSchema>;

export const BRIEF_COLOURS = ['primary', 'accent', 'surface', 'text', 'muted'] as const;
export type BriefColour = (typeof BRIEF_COLOURS)[number];
export const BRIEF_FONTS = ['heading', 'body', 'numbers'] as const;

/** design/brief.json (V3 r8): what the Designer works from. */
export const BriefSchema = z.object({
  schema: z.literal(1).default(1),
  references: z.array(BriefItemSchema).max(200).default([]),
  system: z.array(BriefItemSchema).max(50).default([]),
  components: z.array(BriefItemSchema).max(50).default([]),
  images: z.array(BriefItemSchema).max(200).default([]),
  colours: z
    .object({ primary: Hex, accent: Hex, surface: Hex, text: Hex, muted: Hex })
    .default({ primary: null, accent: null, surface: null, text: null, muted: null }),
  fonts: z
    .object({
      heading: FontPickSchema.nullable().default(null),
      body: FontPickSchema.nullable().default(null),
      numbers: FontPickSchema.nullable().default(null),
    })
    .default({ heading: null, body: null, numbers: null }),
});
export type Brief = z.infer<typeof BriefSchema>;
export type BriefList = 'references' | 'system' | 'components' | 'images';
export const BRIEF_LISTS = ['references', 'system', 'components', 'images'] as const;

/** GET /api/fonts: families installed on this computer, and Cherry's own. */
export const FontListSchema = z.object({
  families: z.array(z.string()),
  bundled: z.array(z.string()),
});
