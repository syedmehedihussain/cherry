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
