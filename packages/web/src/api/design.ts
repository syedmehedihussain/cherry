import { useQuery } from '@tanstack/react-query';
import { DesignScreensSchema } from '@cherry/shared';
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
