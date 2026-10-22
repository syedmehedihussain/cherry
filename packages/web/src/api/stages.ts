import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { StageFocusSchema, StageInfoSchema, type Stage, type StageInfo } from '@cherry/shared';
import { api } from './client.ts';

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
