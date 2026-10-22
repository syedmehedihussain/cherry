import type { FastifyInstance } from 'fastify';
import { STAGES, STAGE_LABEL, type StageInfo } from '@cherry/shared';
import { stageProfile } from '../stages/profiles.ts';
import { stageSkills } from '../stages/skills.ts';

/** The stage agents and their skills (ADR-0034). */
export function stageRoutes(home: string) {
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
  };
}
