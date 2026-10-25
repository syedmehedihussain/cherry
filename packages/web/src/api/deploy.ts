import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import {
  BrowserTestSchema,
  ChecksSchema,
  DeployInfoSchema,
  type CheckId,
  type Checks,
} from '@cherry/shared';
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

export const testKey = (id: string) => ['browser-test', id] as const;

/** The browser test (V3 r11), kept live from `browsertest.updated`. */
export const useBrowserTest = (projectId: string) =>
  useQuery({
    queryKey: testKey(projectId),
    queryFn: () => api('GET', `${base(projectId)}/browser-test`, undefined, BrowserTestSchema),
  });

export function useLiveBrowserTest(projectId: string): void {
  useEffect(() => {
    const unsub = socket.subscribe(`project:${projectId}`);
    const off = socket.on((event) => {
      if (event.type === 'browsertest.updated' && event.projectId === projectId)
        queryClient.setQueryData(testKey(projectId), event.test);
    });
    return () => {
      unsub();
      off();
    };
  }, [projectId]);
}

export const startBrowserTest = (projectId: string, url: string) =>
  api('POST', `${base(projectId)}/browser-test`, { url }, BrowserTestSchema).then((t) =>
    queryClient.setQueryData(testKey(projectId), t),
  );

export const stopBrowserTest = (projectId: string) =>
  api('DELETE', `${base(projectId)}/browser-test`);

export const shotUrl = (projectId: string, run: string, file: string) =>
  `${base(projectId)}/browser-test/shot/${encodeURIComponent(run)}/${encodeURIComponent(file)}`;
