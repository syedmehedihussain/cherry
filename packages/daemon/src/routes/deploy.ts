import { createReadStream } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ConfigStore } from '../config.ts';
import type { BrowserTestService } from '../deploy/browser-test.ts';
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

/** The browser test (V3 r11). */
export function browserTestRoutes(tests: BrowserTestService) {
  return (app: FastifyInstance) => {
    app.get('/api/projects/:id/browser-test', async (req) =>
      tests.get(IdParams.parse(req.params).id),
    );
    app.post('/api/projects/:id/browser-test', async (req) => {
      const { url } = z.object({ url: z.string().min(1).max(500) }).parse(req.body);
      return tests.start(IdParams.parse(req.params).id, url);
    });
    app.delete('/api/projects/:id/browser-test', async (req) => {
      await tests.stop(IdParams.parse(req.params).id);
      return { ok: true };
    });
    app.get('/api/projects/:id/browser-test/shot/:run/:file', async (req, reply) => {
      const { id, run, file } = z
        .object({
          id: z.string().min(1).max(200),
          run: z.string().max(40),
          file: z.string().max(20),
        })
        .parse(req.params);
      const abs = tests.shot(id, run, file);
      return reply
        .header(
          'content-type',
          file.endsWith('.png')
            ? 'image/png'
            : file.endsWith('.webp')
              ? 'image/webp'
              : 'image/jpeg',
        )
        .header('x-content-type-options', 'nosniff')
        .header('content-security-policy', "default-src 'none'; sandbox")
        .send(createReadStream(abs));
    });
  };
}
