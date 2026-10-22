import type { FastifyInstance } from 'fastify';
import { StartProjectSchema } from '@cherry/shared';
import type { ConfigStore } from '../config.ts';
import type { ProjectService } from '../projects/service.ts';
import { startProject } from '../start/service.ts';

/** Start project (ADR-0036): idea, name and folder; the Plan stage takes it from there. */
export function startRoutes(config: ConfigStore, projects: ProjectService) {
  return (app: FastifyInstance) => {
    app.post('/api/projects/start', async (req) =>
      startProject(config, projects, StartProjectSchema.parse(req.body)),
    );
  };
}
