import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import {
  ChangesSchema,
  DocsListSchema,
  FileDiffSchema,
  FileViewSchema,
  GitInfoSchema,
  GitResultSchema,
  NotesSchema,
  CommitMessageSchema,
  CommitResultSchema,
  SourceControlSchema,
  type SourceControl,
  OrganisedNoteSchema,
  ProjectDetailSchema,
  PullRequestListSchema,
  TasksFileSchema,
  TreeSchema,
} from '@cherry/shared';
import { z } from 'zod';
import { api } from './client.ts';
import { queryClient } from './queries.ts';
import { socket } from './socket.ts';

const base = (id: string) => `/api/projects/${encodeURIComponent(id)}`;
const q = (path: string) => `?path=${encodeURIComponent(path)}`;

export const wk = {
  all: (id: string) => ['project', id] as const,
  detail: (id: string) => ['project', id, 'detail'] as const,
  tree: (id: string, path: string) => ['project', id, 'tree', path] as const,
  file: (id: string, path: string) => ['project', id, 'file', path] as const,
  diff: (id: string, path: string) => ['project', id, 'diff', path] as const,
  docs: (id: string) => ['project', id, 'docs'] as const,
  git: (id: string) => ['project', id, 'git'] as const,
  changes: (id: string) => ['project', id, 'changes'] as const,
  notes: (id: string) => ['project', id, 'notes'] as const,
  tasks: (id: string) => ['project', id, 'tasks'] as const,
  sourceControl: (id: string) => ['project', id, 'source-control'] as const,
};

export const useProjectDetail = (id: string) =>
  useQuery({
    queryKey: wk.detail(id),
    queryFn: () => api('GET', base(id), undefined, ProjectDetailSchema),
  });

export const useTree = (id: string, path: string, enabled = true) =>
  useQuery({
    queryKey: wk.tree(id, path),
    queryFn: () => api('GET', `${base(id)}/tree${q(path)}`, undefined, TreeSchema),
    enabled,
  });

export const useFile = (id: string, path: string) =>
  useQuery({
    queryKey: wk.file(id, path),
    queryFn: () => api('GET', `${base(id)}/file${q(path)}`, undefined, FileViewSchema),
  });

export const useDiff = (id: string, path: string, enabled: boolean) =>
  useQuery({
    queryKey: wk.diff(id, path),
    queryFn: () => api('GET', `${base(id)}/diff${q(path)}`, undefined, FileDiffSchema),
    enabled,
  });

export const useDocs = (id: string) =>
  useQuery({
    queryKey: wk.docs(id),
    queryFn: () => api('GET', `${base(id)}/docs`, undefined, DocsListSchema),
  });

export const useGitInfo = (id: string) =>
  useQuery({
    queryKey: wk.git(id),
    queryFn: () => api('GET', `${base(id)}/git`, undefined, GitInfoSchema),
  });

export const useChanges = (id: string) =>
  useQuery({
    queryKey: wk.changes(id),
    queryFn: () => api('GET', `${base(id)}/changes`, undefined, ChangesSchema),
  });

export const useNotes = (id: string) =>
  useQuery({
    queryKey: wk.notes(id),
    queryFn: () => api('GET', `${base(id)}/notes`, undefined, NotesSchema),
  });

export const saveNotes = (id: string, content: string, baseMtime: number | null) =>
  api('PUT', `${base(id)}/notes`, { content, baseMtime }, NotesSchema);

export const useTasks = (id: string) =>
  useQuery({
    queryKey: wk.tasks(id),
    queryFn: () => api('GET', `${base(id)}/tasks`, undefined, TasksFileSchema),
  });

export const useSourceControl = (id: string) =>
  useQuery({
    queryKey: wk.sourceControl(id),
    queryFn: () => api('GET', `${base(id)}/source-control`, undefined, SourceControlSchema),
  });

const setSourceControl = (id: string) => (sc: SourceControl) => {
  queryClient.setQueryData(wk.sourceControl(id), sc);
  return sc;
};

export const stageFiles = (id: string, body: { files?: string[]; all?: boolean }) =>
  api('POST', `${base(id)}/source-control/stage`, body, SourceControlSchema).then(
    setSourceControl(id),
  );

export const unstageFiles = (id: string, body: { files?: string[]; all?: boolean }) =>
  api('POST', `${base(id)}/source-control/unstage`, body, SourceControlSchema).then(
    setSourceControl(id),
  );

export const writeCommitMessage = (id: string) =>
  api('POST', `${base(id)}/source-control/message`, undefined, CommitMessageSchema);

export const setAutoCommit = (id: string, on: boolean) =>
  api(
    'PUT',
    `${base(id)}/source-control/auto-commit`,
    { on },
    z.object({ autoCommit: z.boolean() }),
  );

export const commitStaged = (id: string, message: string) =>
  api('POST', `${base(id)}/commits`, { message }, CommitResultSchema);

export const addTask = (id: string, title: string) =>
  api('POST', `${base(id)}/tasks`, { title }, TasksFileSchema);

export const organiseNote = (id: string, text: string) =>
  api('POST', `${base(id)}/notes/organise`, { text }, OrganisedNoteSchema);

export const setTaskStatus = (id: string, taskId: string, status: string) =>
  api('PATCH', `${base(id)}/tasks/${encodeURIComponent(taskId)}`, { status }, TasksFileSchema);

/** Saves the built-in editor's text; refused (409) if the file changed since it was opened. */
export const saveFile = (id: string, path: string, content: string, baseMtime: number) =>
  api('PUT', `${base(id)}/file`, { path, content, baseMtime }, FileViewSchema).then((view) => {
    queryClient.setQueryData(wk.file(id, path), view);
    void queryClient.invalidateQueries({ queryKey: wk.diff(id, path) });
    void queryClient.invalidateQueries({ queryKey: wk.changes(id) });
    return view;
  });

export const openInEditor = (id: string, path: string) =>
  api('POST', `${base(id)}/open-in-editor`, { path });

/** Re-fetches this project's data when its files change on disk. */
export function useLiveProject(id: string): void {
  useEffect(() => {
    const unsub = socket.subscribe(`project:${id}`);
    let timer: number | null = null;
    const off = socket.on((event) => {
      if (event.type !== 'project.changed' || event.projectId !== id) return;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        // Notes are edited in place; never clobber the editor from a disk event.
        void queryClient.invalidateQueries({
          queryKey: wk.all(id),
          predicate: (query) => query.queryKey[2] !== 'notes',
        });
        void queryClient.invalidateQueries({ queryKey: ['stage-focus', id] });
        void queryClient.invalidateQueries({ queryKey: ['issues', id] });
      }, 150);
    });
    return () => {
      unsub();
      off();
      if (timer) window.clearTimeout(timer);
    };
  }, [id]);
}

export const pullProject = (id: string) =>
  api('POST', `${base(id)}/git/pull`, undefined, GitResultSchema);
export const pushProject = (id: string) =>
  api('POST', `${base(id)}/git/push`, undefined, z.object({ approvalId: z.string() }));
export const usePullRequests = (id: string, enabled: boolean) =>
  useQuery({
    queryKey: [...wk.git(id), 'prs'],
    queryFn: () => api('GET', `${base(id)}/git/prs`, undefined, PullRequestListSchema),
    enabled,
    staleTime: 60_000,
  });
