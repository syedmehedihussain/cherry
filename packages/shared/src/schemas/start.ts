import { z } from 'zod';

/** A folder name for a new project: lower case, digits, dot, dash, underscore. */
export const ProjectNameSchema = z
  .string()
  .trim()
  .min(1, 'Give the project a name.')
  .max(64, 'Keep the name under 64 characters.')
  .regex(
    /^[a-z0-9][a-z0-9._-]*$/,
    'Use lower-case letters, digits, dots, dashes or underscores, starting with a letter or digit.',
  );

/** Start project (ADR-0036): the idea, the folder name, and where to create it (default: the new projects folder). */
export const StartProjectSchema = z.object({
  name: ProjectNameSchema,
  idea: z.string().trim().min(1, 'Describe the idea in a sentence or two.').max(2000),
  parentDir: z.string().trim().min(1).max(4096).optional(),
});
export type StartProject = z.infer<typeof StartProjectSchema>;

export const StartProjectResultSchema = z.object({ id: z.string(), path: z.string() });
export type StartProjectResult = z.infer<typeof StartProjectResultSchema>;
