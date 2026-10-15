import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { IdeaListSchema, IdeaSchema, type IdeaInput } from '@cherry/shared';
import { api } from './client.ts';
import { queryClient } from './queries.ts';

export const ideasKey = ['ideas'] as const;

export const useIdeas = () =>
  useQuery({
    queryKey: ideasKey,
    queryFn: () => api('GET', '/api/ideas', undefined, IdeaListSchema).then((r) => r.ideas),
  });

const refresh = () => queryClient.invalidateQueries({ queryKey: ideasKey });
const One = z.object({ idea: IdeaSchema });

export const addIdea = (input: IdeaInput) =>
  api('POST', '/api/ideas', input, One).finally(() => void refresh());
export const updateIdea = (id: string, input: IdeaInput) =>
  api('PATCH', `/api/ideas/${encodeURIComponent(id)}`, input, One).finally(() => void refresh());
export const removeIdea = (id: string) =>
  api('DELETE', `/api/ideas/${encodeURIComponent(id)}`).finally(() => void refresh());
