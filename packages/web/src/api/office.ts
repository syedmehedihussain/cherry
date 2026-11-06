import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { z } from 'zod';
import {
  OfficeFileSchema,
  OfficeResponseSchema,
  StageDocsSchema,
  type ChangeInput,
  type CostInput,
  type DevGate,
  type OfficeCreate,
  type OfficeFile,
  type OfficeStage,
  type SignOffInput,
  type TimeInput,
} from '@cherry/shared';
import { api } from './client.ts';
import { queryClient } from './queries.ts';
import { socket } from './socket.ts';

/** The office of a project (V4, ADR-0052, ADR-0054). docs/api.md, Office. */
const base = (id: string) => `/api/projects/${encodeURIComponent(id)}/office`;
export const officeKey = (id: string) => ['office', id] as const;

const One = z.object({ office: OfficeFileSchema });

export const useOffice = (projectId: string) =>
  useQuery({
    queryKey: officeKey(projectId),
    queryFn: () =>
      api('GET', base(projectId), undefined, OfficeResponseSchema).then((r) => r.office),
  });

export const useStageDocs = (projectId: string, stage: OfficeStage) =>
  useQuery({
    queryKey: ['office-docs', projectId, stage],
    queryFn: () => api('GET', `${base(projectId)}/docs?stage=${stage}`, undefined, StageDocsSchema),
  });

/** Keeps the office current: `office.updated` carries the whole file. */
export function useLiveOffice(projectId: string): void {
  useEffect(() => {
    const unsub = socket.subscribe(`project:${projectId}`);
    const off = socket.on((event) => {
      if (event.type === 'office.updated' && event.projectId === projectId)
        queryClient.setQueryData(officeKey(projectId), event.office);
      if (event.type === 'project.changed' && event.projectId === projectId)
        void queryClient.invalidateQueries({ queryKey: ['office-docs', projectId] });
      if (event.type === 'project.changed' && event.projectId === projectId)
        void queryClient.invalidateQueries({ queryKey: ['vault', projectId] });
    });
    return () => {
      unsub();
      off();
    };
  }, [projectId]);
}

/** Every change returns the whole office; it replaces the cache at once. */
async function change(
  projectId: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<OfficeFile> {
  const { office } = await api(method, `${base(projectId)}${path}`, body, One);
  queryClient.setQueryData(officeKey(projectId), office);
  void queryClient.invalidateQueries({ queryKey: ['projects'] });
  return office;
}

export const createOffice = (id: string, input: OfficeCreate) => change(id, 'POST', '', input);
export const officeSettings = (
  id: string,
  patch: Partial<{
    client: { name: string; contact: string };
    rate: number;
    currency: string;
    budgetTokens: number;
  }>,
) => change(id, 'PATCH', '', patch);
export const setStageReady = (id: string, stage: OfficeStage, ready: boolean) =>
  change(id, 'POST', `/stages/${stage}/ready`, { ready });
export const sendStage = (id: string, stage: OfficeStage) =>
  change(id, 'POST', `/stages/${stage}/send`);
export const signOffStage = (id: string, stage: OfficeStage, input: SignOffInput) =>
  change(id, 'POST', `/stages/${stage}/sign-off`, input);
export const setDevGate = (id: string, gate: DevGate) => change(id, 'POST', '/dev-gate', { gate });
export const addChange = (id: string, input: ChangeInput) => change(id, 'POST', '/changes', input);
export const decideChange = (id: string, cr: string, approve: boolean) =>
  change(id, 'POST', `/changes/${encodeURIComponent(cr)}/${approve ? 'approve' : 'reject'}`);
export const addCost = (id: string, input: CostInput) => change(id, 'POST', '/costs', input);
export const billCost = (id: string, costId: string, bill: boolean) =>
  change(id, 'PATCH', `/costs/${encodeURIComponent(costId)}`, { bill });
export const removeCost = (id: string, costId: string) =>
  change(id, 'DELETE', `/costs/${encodeURIComponent(costId)}`);
export const addTime = (id: string, input: TimeInput) => change(id, 'POST', '/time', input);
export const removeTime = (id: string, timeId: string) =>
  change(id, 'DELETE', `/time/${encodeURIComponent(timeId)}`);
export const startVersion = (id: string, version: string, title: string) =>
  change(id, 'POST', '/versions', { version, title });
