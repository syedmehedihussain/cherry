import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  STAGES,
  OfficeStageSchema,
  STAGE_LABEL,
  type OfficeStage,
  StageSchema,
  WORKSPACE_STAGES,
  type StageFocus,
  type StageInfo,
} from '@cherry/shared';
import type { ChatService } from '../chat/service.ts';
import { badRequest } from '../http.ts';
import { writeHandoffNote } from '../stages/handoff.ts';
import type { ConfigStore } from '../config.ts';
import { writeFileAtomic } from '../fsutil.ts';
import { staffSlug } from '../office/staff.ts';
import { projectDir } from '../projects/workspace.ts';
import { STAGES_DIR } from '../stages/profiles.ts';
import { readiness, stageFiles } from '../stages/focus.ts';
import { stageProfile } from '../stages/profiles.ts';
import { stageSkills } from '../stages/skills.ts';

/** The stage agents and their skills (ADR-0034). */
export function stageRoutes(home: string, config: ConfigStore) {
  return (app: FastifyInstance) => {
    app.get('/api/stages', async (): Promise<{ stages: StageInfo[] }> => ({
      stages: STAGES.map((stage) => {
        const p = stageProfile(stage);
        return {
          stage,
          label: STAGE_LABEL[stage],
          name: p.name,
          summary: p.summary,
          docsOnly: p.docsOnly,
          skills: stageSkills(home, stage),
        };
      }),
    }));

    // Settings, Agents (V4 o17): a staff agent's persona, bundled or the user's own file.
    app.get('/api/staff/:stage', async (req) => {
      const { stage } = z.object({ stage: OfficeStageSchema }).parse(req.params);
      return staffFile(home, stage);
    });
    app.put('/api/staff/:stage', async (req) => {
      const { stage } = z.object({ stage: OfficeStageSchema }).parse(req.params);
      const { content } = z.object({ content: z.string().min(1).max(100_000) }).parse(req.body);
      writeFileAtomic(path.join(home, 'staff', `${staffSlug(stage)}.md`), content);
      return staffFile(home, stage);
    });
    app.delete('/api/staff/:stage', async (req) => {
      const { stage } = z.object({ stage: OfficeStageSchema }).parse(req.params);
      rmSync(path.join(home, 'staff', `${staffSlug(stage)}.md`), { force: true });
      return staffFile(home, stage);
    });

    app.get('/api/projects/:id/stage', async (req): Promise<StageFocus> => {
      const { id } = z.object({ id: z.string().min(1).max(200) }).parse(req.params);
      const { stage } = z.object({ stage: StageSchema }).parse(req.query);
      const dir = projectDir(config.projectsDir(), id);
      return {
        files: stageFiles(dir, stage),
        readiness: stage === 'preparation' ? readiness(dir) : null,
      };
    });
  };
}

/** The handoff note between stages (V3 r12), written by Cherry with no model call (ADR-0055). */
export function handoffRoutes(config: ConfigStore, chat: ChatService) {
  return (app: FastifyInstance) => {
    app.post('/api/projects/:id/stages/handoff', async (req) => {
      const { id } = z.object({ id: z.string().min(1).max(200) }).parse(req.params);
      const { from, to } = z
        .object({ from: z.enum(WORKSPACE_STAGES), to: z.enum(WORKSPACE_STAGES) })
        .parse(req.body);
      const dir = projectDir(config.projectsDir(), id);
      let state: ReturnType<ChatService['state']> | null;
      try {
        state = chat.state(id, from);
      } catch {
        state = null;
      }
      if (from === to) throw badRequest('Move to another stage.');
      return writeHandoffNote(dir, from, state);
    });
  };
}

/** A staff agent's persona: the user's `~/.cherry/staff/<slug>.md`, or the bundled AGENT.md. */
function staffFile(home: string, stage: OfficeStage) {
  const own = path.join(home, 'staff', `${staffSlug(stage)}.md`);
  const custom = existsSync(own);
  return {
    stage,
    path: `~/.cherry/staff/${staffSlug(stage)}.md`,
    custom,
    content: readFileSync(custom ? own : path.join(STAGES_DIR, stage, 'AGENT.md'), 'utf8'),
  };
}
