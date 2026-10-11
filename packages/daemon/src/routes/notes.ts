import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { NoteBodySchema } from '@cherry/shared';
import { HttpError } from '../http.ts';
import type { NoteService } from '../notes/service.ts';

const IdParams = z.object({ id: z.string().min(1).max(200) });

export function noteRoutes(notes: NoteService) {
  return (app: FastifyInstance) => {
    app.post('/api/projects/:id/notes/organise', async (req) => {
      const { id } = IdParams.parse(req.params);
      const { text } = NoteBodySchema.parse(req.body);
      try {
        return await notes.organise(id, text);
      } catch (e) {
        if (e instanceof HttpError) throw e;
        throw new HttpError(
          502,
          'note_failed',
          `The note was not saved: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    });
  };
}
