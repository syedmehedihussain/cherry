import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ConfigStore } from '../config.ts';
import type { ChecksService } from '../deploy/checks.ts';
import { deployInfo } from '../deploy/info.ts';
import { projectDir } from '../projects/workspace.ts';

const IdParams = z.object({ id: z.string().min(1).max(200) });
const RunBody = z.object({
  ids: z.array(z.enum(['typecheck', 'lint', 'test', 'build', 'audit'])).optional(),
});

/** The Deployment cockpit (V3 r10): checks and where the project deploys. */
export function deployRoutes(config: ConfigStore, checks: ChecksService) {
  return (app: FastifyInstance) => {
    app.get('/api/projects/:id/checks', async (req) => checks.get(IdParams.parse(req.params).id));
    app.post('/api/projects/:id/checks/run', async (req) =>
      checks.run(IdParams.parse(req.params).id, RunBody.parse(req.body ?? {}).ids),
    );
    app.get('/api/projects/:id/deploy', async (req) =>
      deployInfo(projectDir(config.projectsDir(), IdParams.parse(req.params).id)),
    );
  };
}
