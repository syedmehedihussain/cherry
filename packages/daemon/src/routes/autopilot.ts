import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AutopilotStageSchema } from '@cherry/shared';
import type { AutopilotService } from '../autopilot/service.ts';

const IdParams = z.object({ id: z.string().min(1).max(200) });
const StageBody = z.object({ stage: AutopilotStageSchema });

/** Autopilot (ADR-0046): ask, start with the user's one answer, stop, review decisions. */
export function autopilotRoutes(autopilot: AutopilotService) {
  return (app: FastifyInstance) => {
    const id = (p: unknown) => IdParams.parse(p).id;
    app.get('/api/projects/:id/autopilot', async (req) =>
      autopilot.get(id(req.params), StageBody.parse(req.query).stage),
    );
    app.post('/api/projects/:id/autopilot/ask', async (req) =>
      autopilot.ask(id(req.params), StageBody.parse(req.body).stage),
    );
    app.post('/api/projects/:id/autopilot/start', async (req) => {
      const { stage, goal } = StageBody.extend({ goal: z.string().trim().min(1).max(2000) }).parse(
        req.body,
      );
      return autopilot.start(id(req.params), stage, goal);
    });
    app.post('/api/projects/:id/autopilot/stop', async (req) =>
      autopilot.stop(id(req.params), StageBody.parse(req.body).stage),
    );
    app.post('/api/projects/:id/autopilot/dismiss', async (req) =>
      autopilot.dismiss(id(req.params), StageBody.parse(req.body).stage),
    );
    app.post('/api/projects/:id/autopilot/review', async (req) => {
      const { stage, adr, review } = StageBody.extend({
        adr: z.number().int().min(1),
        review: z.enum(['kept', 'changed']),
      }).parse(req.body);
      return autopilot.review(id(req.params), stage, adr, review);
    });
  };
}
