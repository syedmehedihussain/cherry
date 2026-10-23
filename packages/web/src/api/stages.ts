import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import {
  PHASES,
  StageFocusSchema,
  StageInfoSchema,
  stageProgress,
  type Phase,
  type Stage,
  type StageInfo,
} from '@cherry/shared';
import { api } from './client.ts';
import { useTasks } from './workspace.ts';

/** The stage agents and their skills (ADR-0034); they only change when Cherry updates. */
export const useStageInfo = () =>
  useQuery({
    queryKey: ['stages'],
    queryFn: () =>
      api('GET', '/api/stages', undefined, z.object({ stages: z.array(StageInfoSchema) })).then(
        (r) => r.stages,
      ),
    staleTime: Infinity,
  });

export const stageInfo = (list: StageInfo[] | undefined, stage: Stage) =>
  list?.find((s) => s.stage === stage);

/** The open stage's files, and the readiness check for Preparation (ADR-0034). */
export const useStageFocus = (projectId: string, stage: Stage) =>
  useQuery({
    queryKey: ['stage-focus', projectId, stage],
    queryFn: () =>
      api(
        'GET',
        `/api/projects/${encodeURIComponent(projectId)}/stage?stage=${stage}`,
        undefined,
        StageFocusSchema,
      ),
  });

/** The stage after this one in the loop; Deployment hands over to Issues. */
export function nextStage(stage: Stage): Stage | null {
  if (stage === 'deployment') return 'issues';
  const i = PHASES.indexOf(stage as Phase);
  return i >= 0 && i < PHASES.length - 1 ? PHASES[i + 1]! : null;
}

/** A stage's progress, for the Overview card and the stage tabs. */
export function useStageProgress(projectId: string, stage: Stage) {
  const tasks = useTasks(projectId).data;
  const readiness = useStageFocus(projectId, 'preparation').data?.readiness ?? [];
  if (stage === 'issues') return null;
  return stageProgress(tasks, stage, stage === 'preparation' ? readiness : []);
}
