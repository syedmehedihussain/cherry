import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { MagnetFileNameSchema, MagnetFileSaveSchema, MagnetSendSchema } from '@cherry/shared';
import { HOME_SCOPE, projectScope, type MagnetService } from '../magnet/service.ts';

const ActionParams = z.object({ actionId: z.string().min(1).max(60) });
/** `?project=<id>`: that project's side chat (ADR-0039); none: Home's conversation. */
const scopeOf = (query: unknown) => {
  const { project } = z
    .object({ project: z.string().min(1).max(200).optional() })
    .parse(query ?? {});
  return project ? projectScope(project) : HOME_SCOPE;
};

export function magnetRoutes(magnet: MagnetService) {
  return (app: FastifyInstance) => {
    app.get('/api/magnet', async () => magnet.info());
    app.put('/api/magnet/files/:name', async (req) => {
      const { name } = z.object({ name: MagnetFileNameSchema }).parse(req.params);
      magnet.saveFile(name, MagnetFileSaveSchema.parse(req.body).content);
      return magnet.info();
    });
    app.get('/api/magnet/chat', async (req) => magnet.state(scopeOf(req.query)));
    app.post('/api/magnet/chat', async (req) => magnet.send(MagnetSendSchema.parse(req.body)));
    app.post('/api/magnet/chat/stop', async (req) => {
      await magnet.stop(scopeOf(req.query));
      return { ok: true };
    });
    app.post('/api/magnet/chat/new', async (req) => {
      await magnet.newConversation(scopeOf(req.query));
      return { ok: true };
    });
    app.post('/api/magnet/actions/:actionId/approve', async (req) =>
      magnet.approve(ActionParams.parse(req.params).actionId),
    );
    app.post('/api/magnet/actions/:actionId/cancel', async (req) =>
      magnet.cancel(ActionParams.parse(req.params).actionId),
    );
  };
}
