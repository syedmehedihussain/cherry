import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AgentStartSchema } from '@cherry/shared';
import type { AgentManager } from '../agents/manager.ts';
import type { ChatService } from '../chat/service.ts';

const IdParams = z.object({ id: z.string().min(1).max(200) });
const AgentParams = z.object({ agentId: z.string().min(1).max(60) });

export function agentRoutes(agents: AgentManager, chat: ChatService) {
  return (app: FastifyInstance) => {
    app.get('/api/projects/:id/agents', async (req) => agents.list(IdParams.parse(req.params).id));
    app.post('/api/projects/:id/agents', async (req) =>
      agents.start(IdParams.parse(req.params).id, AgentStartSchema.parse(req.body)),
    );
    const id = (req: { params: unknown }) => AgentParams.parse(req.params).agentId;
    app.get('/api/agents/:agentId/diff', async (req) => agents.diff(id(req)));
    app.post('/api/agents/:agentId/accept', async (req) => agents.accept(id(req)));
    app.post('/api/agents/:agentId/discard', async (req) => agents.discard(id(req)));
    // Merge with agent: fixes conflicts with the project's branch, then merges (ADR-0029).
    app.post('/api/agents/:agentId/resolve', async (req) => agents.resolve(id(req)));
    app.post('/api/agents/:agentId/retry', async (req) => agents.retry(id(req)));
    app.post('/api/agents/:agentId/stop', async (req) => agents.stop(id(req)));
    // Hands the steps the agent skipped to the project chat (a click, so a chat turn is fine).
    app.post('/api/agents/:agentId/continue', async (req) => {
      const { projectId, text } = agents.continuePrompt(id(req));
      return chat.sendAs(projectId, text);
    });
  };
}
