import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { TerminalInfoSchema } from '@cherry/shared';
import { api } from './client.ts';
import { queryClient } from './queries.ts';

const base = (id: string) => `/api/projects/${encodeURIComponent(id)}/terminals`;
export const terminalsKey = (id: string) => ['terminals', id] as const;

/** The project's shells (V3 r6); they live in the daemon, so they outlast a reload. */
export const useTerminals = (projectId: string) =>
  useQuery({
    queryKey: terminalsKey(projectId),
    queryFn: () =>
      api(
        'GET',
        base(projectId),
        undefined,
        z.object({ terminals: z.array(TerminalInfoSchema) }),
      ).then((r) => r.terminals),
  });

export const createTerminal = (projectId: string, cols = 100, rows = 30) =>
  api('POST', base(projectId), { cols, rows }, TerminalInfoSchema).then((t) => {
    void queryClient.invalidateQueries({ queryKey: terminalsKey(projectId) });
    return t;
  });

export const closeTerminal = (projectId: string, id: string) =>
  api('DELETE', `${base(projectId)}/${encodeURIComponent(id)}`).then(() =>
    queryClient.invalidateQueries({ queryKey: terminalsKey(projectId) }),
  );

export const terminalSocketUrl = (projectId: string, id: string) =>
  `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/term/${encodeURIComponent(projectId)}/${encodeURIComponent(id)}`;
