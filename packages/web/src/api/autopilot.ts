import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AutopilotStateSchema, type AutopilotStage, type AutopilotState } from '@cherry/shared';
import { api } from './client.ts';
import { queryClient } from './queries.ts';
import { socket } from './socket.ts';

const base = (id: string) => `/api/projects/${encodeURIComponent(id)}/autopilot`;
export const autopilotKey = (id: string, stage: AutopilotStage) =>
  ['autopilot', id, stage] as const;

/** Autopilot for one stage (ADR-0046), kept live from `autopilot.updated`. */
export const useAutopilot = (projectId: string, stage: AutopilotStage | null) =>
  useQuery({
    queryKey: autopilotKey(projectId, stage ?? 'plan'),
    queryFn: () => api('GET', `${base(projectId)}?stage=${stage}`, undefined, AutopilotStateSchema),
    enabled: !!stage,
  });

export function useLiveAutopilot(projectId: string): void {
  useEffect(() => {
    const unsub = socket.subscribe(`project:${projectId}`);
    const off = socket.on((event) => {
      if (event.type === 'autopilot.updated' && event.projectId === projectId)
        queryClient.setQueryData(autopilotKey(projectId, event.state.stage), event.state);
    });
    return () => {
      unsub();
      off();
    };
  }, [projectId]);
}

/**
 * The answer can be older than the events already here (a fast flight ends before the reply is
 * written), so the state is fetched again rather than taken from the answer.
 */
const post = (projectId: string, path: string, body: object) =>
  api('POST', `${base(projectId)}/${path}`, body, AutopilotStateSchema).then(
    (s: AutopilotState) => {
      void queryClient.invalidateQueries({ queryKey: autopilotKey(projectId, s.stage) });
      return s;
    },
  );

export const askAutopilot = (projectId: string, stage: AutopilotStage) =>
  post(projectId, 'ask', { stage });
export const startAutopilot = (projectId: string, stage: AutopilotStage, goal: string) =>
  post(projectId, 'start', { stage, goal });
export const stopAutopilot = (projectId: string, stage: AutopilotStage) =>
  post(projectId, 'stop', { stage });
export const dismissAutopilot = (projectId: string, stage: AutopilotStage) =>
  post(projectId, 'dismiss', { stage });
export const reviewDecision = (
  projectId: string,
  stage: AutopilotStage,
  adr: number,
  review: 'kept' | 'changed',
) => post(projectId, 'review', { stage, adr, review });
