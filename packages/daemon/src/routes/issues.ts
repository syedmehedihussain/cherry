import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { IssueInputSchema, IssuePatchSchema } from '@cherry/shared';
import type { IssueService } from '../issues/service.ts';

const Params = z.object({ id: z.string().min(1).max(200) });
const NumParams = Params.extend({ n: z.coerce.number().int().min(1).max(9999) });

/** Issues stage (ADR-0035). */
export function issueRoutes(issues: IssueService) {
  return (app: FastifyInstance) => {
    app.get('/api/projects/:id/issues', async (req) => issues.list(Params.parse(req.params).id));
    app.post('/api/projects/:id/issues', async (req) => ({
      issue: issues.create(Params.parse(req.params).id, IssueInputSchema.parse(req.body)),
    }));
    app.patch('/api/projects/:id/issues/:n', async (req) => {
      const { id, n } = NumParams.parse(req.params);
      return { issue: issues.setStatus(id, n, IssuePatchSchema.parse(req.body).status) };
    });
    app.post('/api/projects/:id/issues/:n/github', async (req) => {
      const { id, n } = NumParams.parse(req.params);
      return issues.sendToGithub(id, n);
    });
    app.post('/api/projects/:id/issues/import', async (req) => {
      const { id } = Params.parse(req.params);
      const { number } = z.object({ number: z.number().int().min(1) }).parse(req.body);
      return { issue: await issues.importGithub(id, number) };
    });
  };
}
