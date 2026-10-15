import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AdrApplySchema, AdrApproveSchema, AdrRejectSchema } from '@cherry/shared';
import type { AdrService } from '../adr/service.ts';

const IdParams = z.object({ id: z.string().min(1).max(200) });
/** Decisions are addressed by ADR number, never by a path. */
const AdrParams = IdParams.extend({ n: z.coerce.number().int().min(1).max(9999) });

/** Project decisions (ADR-0026). */
export function adrRoutes(adrs: AdrService) {
  return (app: FastifyInstance) => {
    app.get('/api/projects/:id/decisions', async (req) => {
      const { id } = IdParams.parse(req.params);
      return adrs.list(id);
    });
    app.post('/api/projects/:id/decisions/:n/approve', async (req) => {
      const { id, n } = AdrParams.parse(req.params);
      const { apply } = AdrApproveSchema.parse(req.body ?? {});
      return adrs.approve(id, n, apply);
    });
    app.post('/api/projects/:id/decisions/:n/apply', async (req) => {
      const { id, n } = AdrParams.parse(req.params);
      const { apply } = AdrApplySchema.parse(req.body);
      return adrs.apply(id, n, apply);
    });
    app.post('/api/projects/:id/decisions/:n/reject', async (req) => {
      const { id, n } = AdrParams.parse(req.params);
      const { reason } = AdrRejectSchema.parse(req.body ?? {});
      return { decision: adrs.reject(id, n, reason) };
    });
    app.post('/api/projects/:id/decisions/:n/done', async (req) => {
      const { id, n } = AdrParams.parse(req.params);
      return { decision: adrs.markDone(id, n) };
    });
  };
}
