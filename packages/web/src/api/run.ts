import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { RunStateSchema, type RunState } from '@cherry/shared';
import { api } from './client.ts';
import { queryClient } from './queries.ts';
import { socket } from './socket.ts';

const MAX_OUTPUT = 64_000;

/** Not under wk.all: a disk event must not refetch over the streamed output. */
export const runKey = (projectId: string) => ['run', projectId] as const;
const url = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/run`;

export const useRun = (projectId: string) =>
  useQuery({
    queryKey: runKey(projectId),
    queryFn: () => api('GET', url(projectId), undefined, RunStateSchema),
  });

const put = (projectId: string) => (s: RunState) => {
  queryClient.setQueryData(runKey(projectId), s);
  return s;
};
export const startRun = (projectId: string) =>
  api('POST', url(projectId), undefined, RunStateSchema).then(put(projectId));
export const stopRun = (projectId: string) =>
  api('DELETE', url(projectId), undefined, RunStateSchema).then(put(projectId));

/** Keeps the Run state and its output current from `run.state` and `run.output` events. */
export function useLiveRun(projectId: string): void {
  useEffect(() => {
    const unsub = socket.subscribe(`project:${projectId}`);
    const off = socket.on((event) => {
      if (event.type === 'run.state' && event.projectId === projectId) {
        queryClient.setQueryData<RunState>(runKey(projectId), (old) => ({
          ...event.state,
          output: old?.output ?? '',
        }));
      } else if (event.type === 'run.output' && event.projectId === projectId) {
        queryClient.setQueryData<RunState>(runKey(projectId), (old) =>
          old ? { ...old, output: (old.output + event.text).slice(-MAX_OUTPUT) } : old,
        );
      } else if (event.type === 'project.changed' && event.projectId === projectId) {
        // A new package.json or index.html can make a project runnable.
        const now = queryClient.getQueryData<RunState>(runKey(projectId));
        if (!now?.running) void queryClient.invalidateQueries({ queryKey: runKey(projectId) });
      }
    });
    return () => {
      unsub();
      off();
    };
  }, [projectId]);
}
