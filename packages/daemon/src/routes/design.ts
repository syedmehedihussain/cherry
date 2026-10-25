import { createReadStream } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { BRIEF_LISTS, BriefSchema } from '@cherry/shared';
import { contentTypeFor } from '../chat/uploads.ts';
import type { ConfigStore } from '../config.ts';
import {
  addBriefFile,
  copyTokensFrom,
  designFile,
  installedFonts,
  readBrief,
  removeBriefItem,
  writeBrief,
} from '../design/brief.ts';
import { listScreens } from '../design/screens.ts';
import { exportZip, writeHandoff } from '../design/handoff.ts';
import { setPhase } from '../stages/checklist.ts';
import { projectDir } from '../projects/workspace.ts';

const IdParams = z.object({ id: z.string().min(1).max(200) });
const ListQuery = z.object({ list: z.enum(BRIEF_LISTS), name: z.string().min(1).max(300) });

/** The Design stage (V3 r7-r9): screens on the canvas and the brief. */
export function designRoutes(config: ConfigStore) {
  return (app: FastifyInstance) => {
    const dirOf = (params: unknown) => projectDir(config.projectsDir(), IdParams.parse(params).id);
    app.get('/api/projects/:id/design/screens', async (req) => ({
      screens: listScreens(dirOf(req.params)),
    }));
    // Approve design (r9): writes the handoff and moves the project on to Development.
    app.post('/api/projects/:id/design/handoff', async (req) => {
      const dir = dirOf(req.params);
      const result = writeHandoff(dir);
      try {
        setPhase(dir, 'development');
      } catch {
        // A project without project.json keeps no phase; the handoff still stands.
      }
      return result;
    });
    app.get('/api/projects/:id/design/export', async (req, reply) => {
      const { id } = IdParams.parse(req.params);
      const body = exportZip(dirOf(req.params), id);
      return reply
        .header('content-type', 'application/zip')
        .header('content-disposition', `attachment; filename="${id}-plan-and-design.zip"`)
        .send(body);
    });
    app.get('/api/projects/:id/design/brief', async (req) => readBrief(dirOf(req.params)));
    app.put('/api/projects/:id/design/brief', async (req) =>
      writeBrief(dirOf(req.params), BriefSchema.parse(req.body)),
    );
    app.delete('/api/projects/:id/design/brief/item', async (req) => {
      const { list, value } = z
        .object({ list: z.enum(BRIEF_LISTS), value: z.string().min(1).max(2000) })
        .parse(req.query);
      return removeBriefItem(dirOf(req.params), list, value);
    });
    app.post('/api/projects/:id/design/brief/tokens-from', async (req) => {
      const { from } = z.object({ from: z.string().min(1).max(200) }).parse(req.body);
      return copyTokensFrom(dirOf(req.params), projectDir(config.projectsDir(), from), from);
    });
    // A file under design/, for thumbnails; sandboxed like chat attachments.
    app.get('/api/projects/:id/design/file', async (req, reply) => {
      const { path: rel } = z.object({ path: z.string().min(1).max(1000) }).parse(req.query);
      const abs = designFile(dirOf(req.params), rel);
      const { type, inline } = contentTypeFor(rel);
      return reply
        .header('content-type', rel.endsWith('.svg') ? 'image/svg+xml' : type)
        .header('x-content-type-options', 'nosniff')
        .header('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
        .header('content-disposition', inline || rel.endsWith('.svg') ? 'inline' : 'attachment')
        .send(createReadStream(abs));
    });
    void app.register(async (scope) => {
      scope.addContentTypeParser(
        '*',
        { parseAs: 'buffer', bodyLimit: 20 * 1024 * 1024 + 1024 },
        (_req, body, done) => done(null, body),
      );
      scope.post('/api/projects/:id/design/brief/files', async (req) => {
        const { list, name } = ListQuery.parse(req.query);
        if (!Buffer.isBuffer(req.body)) throw new Error('Send the file as the request body.');
        return addBriefFile(dirOf(req.params), list, name, req.body);
      });
    });
  };
}

/** Fonts for the Design brief: the computer's, and Cherry's self-hosted Geist (r8 ADR). */
export function fontRoutes() {
  return (app: FastifyInstance) => {
    app.get('/api/fonts', async () => ({
      families: await installedFonts(),
      bundled: ['Geist', 'Geist Mono'],
    }));
  };
}
