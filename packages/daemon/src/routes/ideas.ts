import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { IdeaInputSchema } from '@cherry/shared';
import type { IdeaStore } from '../ideas/store.ts';

const IdParams = z.object({ id: z.string().regex(/^idea_[0-9a-f]{10}$/) });

/** Project ideas on Home (ADR-0027). */
export function ideaRoutes(ideas: IdeaStore) {
  return (app: FastifyInstance) => {
    app.get('/api/ideas', async () => ({ ideas: ideas.list() }));
    app.post('/api/ideas', async (req) => ({ idea: ideas.add(IdeaInputSchema.parse(req.body)) }));
    app.patch('/api/ideas/:id', async (req) => {
      const { id } = IdParams.parse(req.params);
      return { idea: ideas.update(id, IdeaInputSchema.parse(req.body)) };
    });
    app.delete('/api/ideas/:id', async (req) => {
      const { id } = IdParams.parse(req.params);
      ideas.remove(id);
      return { ok: true };
    });
  };
}
