import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ConfigStore } from '../config.ts';
import { listScreens } from '../design/screens.ts';
import { projectDir } from '../projects/workspace.ts';

const IdParams = z.object({ id: z.string().min(1).max(200) });

/** The Design stage (V3 r7-r9): the screens on the canvas. */
export function designRoutes(config: ConfigStore) {
  return (app: FastifyInstance) => {
    const dirOf = (params: unknown) => projectDir(config.projectsDir(), IdParams.parse(params).id);
    app.get('/api/projects/:id/design/screens', async (req) => ({
      screens: listScreens(dirOf(req.params)),
    }));
  };
}
