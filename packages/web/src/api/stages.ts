import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import {
  StageFocusSchema,
  WORKSPACE_STAGES,
  StageInfoSchema,
  stageProgress,
  type Stage,
  type StageInfo,
  type WorkspaceStage,
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

/** The stage after this one (ADR-0045); Deployment is the last. */
export function nextStage(stage: Stage): WorkspaceStage | null {
  const i = WORKSPACE_STAGES.indexOf(stage as WorkspaceStage);
  return i >= 0 && i < WORKSPACE_STAGES.length - 1 ? WORKSPACE_STAGES[i + 1]! : null;
}

/** A stage's progress, for the Overview card and the stage tabs. */
export function useStageProgress(projectId: string, stage: Stage) {
  const tasks = useTasks(projectId).data;
  const readiness = useStageFocus(projectId, 'preparation').data?.readiness ?? [];
  if (stage === 'issues') return null;
  return stageProgress(tasks, stage, stage === 'preparation' ? readiness : []);
}

/** The handoff note to the next stage (V3 r12), written by Haiku or, failing that, by Cherry. */
export const handoffNote = (projectId: string, from: WorkspaceStage, to: WorkspaceStage) =>
  api(
    'POST',
    `/api/projects/${encodeURIComponent(projectId)}/stages/handoff`,
    { from, to },
    z.object({ note: z.string(), by: z.enum(['haiku', 'cherry']) }),
  );
