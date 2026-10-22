import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { IssueListSchema, IssueSchema, type Issue, type IssueInput } from '@cherry/shared';
import { api } from './client.ts';
import { queryClient } from './queries.ts';

const base = (id: string) => `/api/projects/${encodeURIComponent(id)}/issues`;
export const issuesKey = (id: string) => ['issues', id] as const;

/** The project's issue files and, with a GitHub remote, its open GitHub issues (ADR-0035). */
export const useIssues = (id: string) =>
  useQuery({
    queryKey: issuesKey(id),
    queryFn: () => api('GET', base(id), undefined, IssueListSchema),
  });

const refresh = (id: string) => queryClient.invalidateQueries({ queryKey: issuesKey(id) });
const One = z.object({ issue: IssueSchema });

export const createIssue = (id: string, input: IssueInput) =>
  api('POST', base(id), input, One).then(async (r) => {
    await refresh(id);
    return r.issue;
  });

export const setIssueStatus = (id: string, n: number, status: Issue['status']) =>
  api('PATCH', `${base(id)}/${n}`, { status }, One).then(() => refresh(id));

export const importGithubIssue = (id: string, number: number) =>
  api('POST', `${base(id)}/import`, { number }, One).then(() => refresh(id));

/** Asks for approval first; the link is written to the file once GitHub has it. */
export const sendIssueToGithub = (id: string, n: number) =>
  api('POST', `${base(id)}/${n}/github`, undefined, z.object({ approvalId: z.string() }));
