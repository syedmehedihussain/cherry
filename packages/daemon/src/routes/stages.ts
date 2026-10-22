import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { STAGES, STAGE_LABEL, StageSchema, type StageFocus, type StageInfo } from '@cherry/shared';
import type { ConfigStore } from '../config.ts';
import { projectDir } from '../projects/workspace.ts';
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
