import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CommitBodySchema } from '@cherry/shared';
import type { CommitService } from '../projects/commits.ts';

const IdParams = z.object({ id: z.string().min(1).max(200) });

export function commitRoutes(commits: CommitService) {
  return (app: FastifyInstance) => {
    app.get('/api/projects/:id/commits/plan', async (req) => {
      const { id } = IdParams.parse(req.params);
      const { refresh } = z.object({ refresh: z.string().optional() }).parse(req.query);
      return commits.plan(id, refresh === '1');
    });
    app.post('/api/projects/:id/commits', async (req) => {
      const { id } = IdParams.parse(req.params);
      return commits.commit(id, CommitBodySchema.parse(req.body));
    });
  };
}
