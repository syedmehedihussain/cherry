import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CommitBodySchema, StageBodySchema } from '@cherry/shared';
import type { CommitService } from '../projects/commits.ts';

const IdParams = z.object({ id: z.string().min(1).max(200) });

/** Source Control in the GitHub view and the Auto commit switch (ADR-0030). */
export function commitRoutes(commits: CommitService) {
  return (app: FastifyInstance) => {
    const id = (req: { params: unknown }) => IdParams.parse(req.params).id;
    app.get('/api/projects/:id/source-control', async (req) => commits.list(id(req)));
    app.post('/api/projects/:id/source-control/stage', async (req) =>
      commits.stage(id(req), StageBodySchema.parse(req.body ?? {})),
    );
    app.post('/api/projects/:id/source-control/unstage', async (req) =>
      commits.unstage(id(req), StageBodySchema.parse(req.body ?? {})),
    );
    app.post('/api/projects/:id/source-control/message', async (req) =>
      commits.writeMessage(id(req)),
    );
    app.put('/api/projects/:id/source-control/auto-commit', async (req) => ({
      autoCommit: commits.setAutoCommit(id(req), z.object({ on: z.boolean() }).parse(req.body).on),
    }));
    app.post('/api/projects/:id/commits', async (req) =>
      commits.commit(id(req), CommitBodySchema.parse(req.body).message),
    );
  };
}
