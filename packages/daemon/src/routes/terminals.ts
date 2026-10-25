import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { NewTerminalSchema, TerminalClientMessageSchema } from '@cherry/shared';
import type { TerminalService } from '../terminal/service.ts';

const IdParams = z.object({ id: z.string().min(1).max(200) });
const TermParams = z.object({ id: z.string().min(1).max(200), tid: z.string().min(1).max(40) });

/**
 * Terminal tabs (V3 r6, ADR-0049). The socket is under /ws/, so it gets the same session
 * cookie, Host and Origin checks as the event socket.
 */
export function terminalRoutes(terms: TerminalService) {
  return (app: FastifyInstance) => {
    app.get('/api/projects/:id/terminals', async (req) => ({
      terminals: terms.list(IdParams.parse(req.params).id),
    }));
    app.post('/api/projects/:id/terminals', async (req) => {
      const { cols, rows } = NewTerminalSchema.parse(req.body ?? {});
      return terms.create(IdParams.parse(req.params).id, cols, rows);
    });
    app.delete('/api/projects/:id/terminals/:tid', async (req) => {
      const { id, tid } = TermParams.parse(req.params);
      terms.close(id, tid);
      return { ok: true };
    });
    app.register(async (scope) => {
      scope.get('/ws/term/:id/:tid', { websocket: true }, (socket, req) => {
        const { id, tid } = TermParams.parse(req.params);
        let detach: () => void;
        try {
          detach = terms.attach(id, tid, (m) => {
            if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(m));
          });
        } catch {
          socket.close(4404, 'no such terminal');
          return;
        }
        socket.on('message', (raw: Buffer) => {
          const parsed = TerminalClientMessageSchema.safeParse(
            (() => {
              try {
                return JSON.parse(raw.toString());
              } catch {
                return null;
              }
            })(),
          );
          if (!parsed.success) return;
          const m = parsed.data;
          try {
            if (m.t === 'in') terms.write(id, tid, m.d);
            else terms.resize(id, tid, m.cols, m.rows);
          } catch {
            socket.close(4404, 'no such terminal');
          }
        });
        socket.on('close', () => detach());
      });
    });
  };
}
