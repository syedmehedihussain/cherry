import { z } from 'zod';

/** A project idea saved on Home for later (ADR-0027). Starting it opens the new project survey. */
export const IdeaSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Idea = z.infer<typeof IdeaSchema>;

/** `~/.cherry/ideas.json`, newest first. */
export const IdeasFileSchema = z.object({
  schema: z.literal(1),
  ideas: z.array(IdeaSchema),
});
export type IdeasFile = z.infer<typeof IdeasFileSchema>;

export const IdeaListSchema = z.object({ ideas: z.array(IdeaSchema) });

/** POST /api/ideas and PATCH /api/ideas/:id. */
export const IdeaInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Give the idea a name.')
    .max(80, 'Keep the name under 80 characters.'),
  description: z
    .string()
    .trim()
    .max(4000, 'Keep the description under 4000 characters.')
    .default(''),
});
export type IdeaInput = z.input<typeof IdeaInputSchema>;
