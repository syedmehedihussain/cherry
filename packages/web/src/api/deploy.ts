import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { ChecksSchema, DeployInfoSchema, type CheckId, type Checks } from '@cherry/shared';
import { api } from './client.ts';
import { queryClient } from './queries.ts';
import { socket } from './socket.ts';

const base = (id: string) => `/api/projects/${encodeURIComponent(id)}`;
export const checksKey = (id: string) => ['checks', id] as const;

/** The cockpit's checks (V3 r10), kept live from `checks.updated`. */
export const useChecks = (projectId: string) =>
  useQuery({
    queryKey: checksKey(projectId),
    queryFn: () => api('GET', `${base(projectId)}/checks`, undefined, ChecksSchema),
  });

export function useLiveChecks(projectId: string): void {
  useEffect(() => {
    const unsub = socket.subscribe(`project:${projectId}`);
    const off = socket.on((event) => {
      if (event.type !== 'checks.updated' || event.projectId !== projectId) return;
      queryClient.setQueryData<Checks>(checksKey(projectId), (old) => ({
        checks: event.checks.checks,
        none: old?.none ?? null,
      }));
    });
    return () => {
      unsub();
      off();
    };
  }, [projectId]);
}

export const runChecks = (projectId: string, ids?: CheckId[]) =>
  api('POST', `${base(projectId)}/checks/run`, ids ? { ids } : {}, ChecksSchema).then((c) =>
    queryClient.setQueryData(checksKey(projectId), c),
  );

export const useDeployInfo = (projectId: string) =>
  useQuery({
    queryKey: ['deploy', projectId],
    queryFn: () => api('GET', `${base(projectId)}/deploy`, undefined, DeployInfoSchema),
  });
