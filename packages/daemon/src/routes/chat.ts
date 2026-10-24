import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createReadStream } from 'node:fs';
import {
  ApprovalAnswerSchema,
  ChatSendSchema,
  DecisionAnswerSchema,
  MAX_UPLOAD_BYTES,
  RewindRequestSchema,
  StageSchema,
} from '@cherry/shared';
import { projectCommands } from '../chat/commands.ts';
import { contentTypeFor } from '../chat/uploads.ts';
import type { ChatService } from '../chat/service.ts';
import type { ApprovalBroker } from '../claude/approvals.ts';
import type { DecisionBroker } from '../claude/decisions.ts';

const IdParams = z.object({ id: z.string().min(1).max(200) });
/** `?stage=plan`: which stage's chat (ADR-0034); left out, Development. */
const StageQuery = z.object({ stage: StageSchema.default('development') });
const stageOf = (query: unknown) => StageQuery.parse(query ?? {}).stage;

export function chatRoutes(
  chat: ChatService,
  approvals: ApprovalBroker,
  decisions: DecisionBroker,
) {
  return (app: FastifyInstance) => {
    app.get('/api/projects/:id/chat', async (req) =>
      chat.state(IdParams.parse(req.params).id, stageOf(req.query)),
    );

    // The project's own slash commands for the composer menu (V2.1 w7.1).
    app.get('/api/projects/:id/commands', async (req) => ({
      commands: projectCommands(chat.dirOf(IdParams.parse(req.params).id)).map(
        ({ name, description }) => ({ name, description }),
      ),
    }));

    app.post('/api/projects/:id/chat', async (req) =>
      chat.send(IdParams.parse(req.params).id, ChatSendSchema.parse(req.body)),
    );

    // Attachments: the raw file is the body, the name is in the query (no multipart dependency).
    void app.register(async (scope) => {
      scope.addContentTypeParser(
        '*',
        { parseAs: 'buffer', bodyLimit: MAX_UPLOAD_BYTES + 1024 },
        (_req, body, done) => done(null, body),
      );
      scope.post('/api/projects/:id/uploads', async (req) => {
        const { name } = z.object({ name: z.string().min(1).max(300) }).parse(req.query);
        if (!Buffer.isBuffer(req.body)) throw new Error('Send the file as the request body.');
        return chat.upload(IdParams.parse(req.params).id, name, req.body);
      });
    });

    app.get('/api/projects/:id/uploads/:file', async (req, reply) => {
      const { id, file } = z
        .object({ id: z.string().min(1).max(200), file: z.string().min(1).max(300) })
        .parse(req.params);
      const abs = chat.uploadFile(id, file);
      const { type, inline } = contentTypeFor(file);
      return reply
        .header('content-type', type)
        .header('x-content-type-options', 'nosniff')
        .header('content-security-policy', "default-src 'none'; sandbox")
        .header('content-disposition', `${inline ? 'inline' : 'attachment'}; filename="${file}"`)
        .send(createReadStream(abs));
    });

    app.delete('/api/projects/:id/uploads/:file', async (req) => {
      const { id, file } = z
        .object({ id: z.string().min(1).max(200), file: z.string().min(1).max(300) })
        .parse(req.params);
      chat.discardUpload(id, file);
      return { ok: true };
    });

    app.post('/api/projects/:id/chat/explain', async (req) => {
      const { turnId } = z.object({ turnId: z.string().min(1).max(100) }).parse(req.body);
      return chat.explain(IdParams.parse(req.params).id, turnId, stageOf(req.query));
    });

    // Approve plan / Keep planning on the Planner's card (ADR-0041).
    app.post('/api/projects/:id/chat/plans/:itemId/approve', async (req) => {
      const { id, itemId } = z
        .object({ id: z.string().min(1), itemId: z.string().min(1).max(80) })
        .parse(req.params);
      return chat.approvePlan(id, itemId);
    });
    app.post('/api/projects/:id/chat/plans/:itemId/dismiss', async (req) => {
      const { id, itemId } = z
        .object({ id: z.string().min(1), itemId: z.string().min(1).max(80) })
        .parse(req.params);
      chat.dismissPlan(id, itemId);
      return { ok: true };
    });
    app.post('/api/projects/:id/chat/stop', async (req) => {
      await chat.stop(IdParams.parse(req.params).id, stageOf(req.query));
      return { ok: true };
    });

    app.get('/api/projects/:id/chat/history', async (req) => ({
      sessions: chat.history(IdParams.parse(req.params).id, stageOf(req.query)),
    }));

    app.post('/api/projects/:id/chat/resume', async (req) => {
      const { conversationId } = z
        .object({ conversationId: z.string().min(1).max(100) })
        .parse(req.body);
      await chat.resume(IdParams.parse(req.params).id, stageOf(req.query), conversationId);
      return { ok: true };
    });

    app.post('/api/projects/:id/chat/rewind', async (req) =>
      chat.rewind(
        IdParams.parse(req.params).id,
        stageOf(req.query),
        RewindRequestSchema.parse(req.body),
      ),
    );

    app.post('/api/projects/:id/chat/new', async (req) => {
      await chat.newConversation(IdParams.parse(req.params).id, stageOf(req.query));
      return { ok: true };
    });

    app.post('/api/decisions/:cardId', async (req) => {
      const { cardId } = z.object({ cardId: z.string().max(40) }).parse(req.params);
      return decisions.answer(cardId, DecisionAnswerSchema.parse(req.body));
    });

    app.get('/api/allow-rules', async () => ({ rules: approvals.allowRules() }));
    app.delete('/api/allow-rules', async (req) => {
      const { projectId, rule } = z
        .object({ projectId: z.string().min(1).max(200), rule: z.string().min(1).max(10_000) })
        .parse(req.body);
      approvals.removeAllowRule(projectId, rule);
      return { ok: true };
    });

    app.get('/api/approvals', async (req) => {
      const { status } = z
        .object({
          status: z
            .enum([
              'pending',
              'allowed',
              'allowed_session',
              'allowed_always',
              'denied',
              'cancelled',
            ])
            .optional(),
        })
        .parse(req.query);
      return { approvals: approvals.list(status) };
    });

    app.post('/api/approvals/:id', async (req) => {
      const { id } = z.object({ id: z.string().max(40) }).parse(req.params);
      return approvals.answer(id, ApprovalAnswerSchema.parse(req.body));
    });
  };
}
