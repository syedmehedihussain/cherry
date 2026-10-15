import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { z } from 'zod';
import { AdrListSchema, AdrSchema, type AdrApplyMode } from '@cherry/shared';
import { api } from './client.ts';
import { queryClient } from './queries.ts';
import { socket } from './socket.ts';

export const decisionsKey = (projectId: string) => ['project', projectId, 'decisions'] as const;
const base = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/decisions`;

export const useDecisions = (projectId: string) =>
  useQuery({
    queryKey: decisionsKey(projectId),
    queryFn: () => api('GET', base(projectId), undefined, AdrListSchema),
  });

const refresh = (projectId: string) =>
  queryClient.invalidateQueries({ queryKey: decisionsKey(projectId) });

const Result = z.object({ decision: AdrSchema, warning: z.string().nullable().default(null) });

const post =
  <B>(verb: 'approve' | 'apply' | 'reject' | 'done') =>
  (projectId: string, n: number, body?: B) =>
    api('POST', `${base(projectId)}/${n}/${verb}`, body ?? {}, Result).then((r) => {
      void refresh(projectId);
      return r;
    });

export const approveDecision = post<{ apply: AdrApplyMode }>('approve');
export const applyDecision = post<{ apply: 'chat' | 'agent' }>('apply');
export const rejectDecision = post<{ reason: string }>('reject');
export const markDecisionDone = post<never>('done');

/** Re-fetches on `decisions.updated`, and when files change (someone edited an ADR by hand). */
export function useLiveDecisions(projectId: string): void {
  useEffect(() => {
    const unsub = socket.subscribe(`project:${projectId}`);
    const off = socket.on((event) => {
      if (
        (event.type === 'decisions.updated' || event.type === 'project.changed') &&
        event.projectId === projectId
      )
        void refresh(projectId);
    });
    return () => {
      unsub();
      off();
    };
  }, [projectId]);
}
