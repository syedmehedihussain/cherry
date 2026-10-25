import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import {
  BriefSchema,
  DesignScreensSchema,
  FontListSchema,
  type Brief,
  type BriefList,
} from '@cherry/shared';
import { queryClient } from './queries.ts';
import { api } from './client.ts';
import { wk } from './workspace.ts';

/** The screens on the Design canvas (V3 r7); refreshed when files change (under wk.all). */
export const useDesignScreens = (projectId: string) =>
  useQuery({
    queryKey: [...wk.all(projectId), 'design-screens'],
    queryFn: () =>
      api(
        'GET',
        `/api/projects/${encodeURIComponent(projectId)}/design/screens`,
        undefined,
        DesignScreensSchema,
      ).then((r) => r.screens),
  });

const briefBase = (id: string) => `/api/projects/${encodeURIComponent(id)}/design/brief`;
export const briefKey = (id: string) => [...wk.all(id), 'design-brief'] as const;

/** design/brief.json (V3 r8). */
export const useBrief = (projectId: string) =>
  useQuery({
    queryKey: briefKey(projectId),
    queryFn: () => api('GET', briefBase(projectId), undefined, BriefSchema),
  });

const setBrief = (projectId: string) => (b: Brief) => {
  queryClient.setQueryData(briefKey(projectId), b);
  return b;
};

export const saveBrief = (projectId: string, brief: Brief) =>
  api('PUT', briefBase(projectId), brief, BriefSchema).then(setBrief(projectId));

export const removeBriefItem = (projectId: string, list: BriefList, value: string) =>
  api(
    'DELETE',
    `${briefBase(projectId)}/item?list=${list}&value=${encodeURIComponent(value)}`,
    undefined,
    BriefSchema,
  ).then(setBrief(projectId));

export const tokensFrom = (projectId: string, from: string) =>
  api('POST', `${briefBase(projectId)}/tokens-from`, { from }, BriefSchema).then(
    setBrief(projectId),
  );

export async function uploadBriefFile(
  projectId: string,
  list: BriefList,
  file: File,
): Promise<Brief> {
  const res = await fetch(
    `${briefBase(projectId)}/files?list=${list}&name=${encodeURIComponent(file.name)}`,
    {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/octet-stream' },
      body: file,
    },
  );
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok)
    throw new Error(
      res.status === 413
        ? 'The file is larger than 20 MB.'
        : ((body as { error?: { message?: string } } | null)?.error?.message ?? 'Upload failed.'),
    );
  return setBrief(projectId)(BriefSchema.parse(body));
}

export const designFileUrl = (projectId: string, path: string) =>
  `/api/projects/${encodeURIComponent(projectId)}/design/file?path=${encodeURIComponent(path)}`;

/** Fonts on this computer and Cherry's own (r8: no Google Fonts, ADR-0050). */
export const useFonts = () =>
  useQuery({
    queryKey: ['fonts'],
    queryFn: () => api('GET', '/api/fonts', undefined, FontListSchema),
    staleTime: 10 * 60_000,
  });

/** Approve design (r9): writes design/handoff/ and moves the phase to Development. */
export const approveDesign = (projectId: string) =>
  api(
    'POST',
    `/api/projects/${encodeURIComponent(projectId)}/design/handoff`,
    undefined,
    z.object({ files: z.array(z.string()) }),
  );

export const exportUrl = (projectId: string) =>
  `/api/projects/${encodeURIComponent(projectId)}/design/export`;
