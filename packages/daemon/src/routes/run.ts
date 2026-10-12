import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { RunService } from '../run/service.ts';

const IdParams = z.object({ id: z.string().min(1).max(200) });

export function runRoutes(runs: RunService) {
  return (app: FastifyInstance) => {
    app.get('/api/projects/:id/run', async (req) => runs.get(IdParams.parse(req.params).id));
    app.post('/api/projects/:id/run', async (req) => runs.start(IdParams.parse(req.params).id));
    app.delete('/api/projects/:id/run', async (req) => runs.stop(IdParams.parse(req.params).id));
  };
}
