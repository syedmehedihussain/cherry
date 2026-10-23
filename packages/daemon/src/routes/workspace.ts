import { statSync } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  NewTaskSchema,
  PhaseSchema,
  TaskStatusSchema,
  TasksFileSchema,
  type ProjectDetail,
  type TasksFile,
} from '@cherry/shared';
import { existsSync, readFileSync } from 'node:fs';
import { writeFileAtomic } from '../fsutil.ts';
import { gitStatus } from '../git.ts';
import { conflict, notFound } from '../http.ts';
import type { ConfigStore } from '../config.ts';
import { resolveInside } from '../paths.ts';
import { openInEditor } from '../projects/editor.ts';
import type { GitInfoService } from '../projects/github.ts';
import { buildCard, readProjectFiles } from '../projects/scanner.ts';
import { addTask, readTasks, writeTasks } from '../projects/tasks.ts';
import { setPhase } from '../stages/checklist.ts';
import type { AdrService } from '../adr/service.ts';
import {
  fileDiff,
  listDocs,
  listTree,
  projectDir,
  readFileView,
  searchFiles,
  writeFileView,
} from '../projects/workspace.ts';

const IdParams = z.object({ id: z.string().min(1).max(200) });
const PathQuery = z.object({ path: z.string().max(4096).default('') });

export function workspaceRoutes(config: ConfigStore, gitInfo: GitInfoService, adrs?: AdrService) {
  return (app: FastifyInstance) => {
    const dirOf = (params: unknown) => projectDir(config.projectsDir(), IdParams.parse(params).id);

    app.get('/api/projects/:id', async (req): Promise<ProjectDetail> => {
      const dir = dirOf(req.params);
      const files = readProjectFiles(dir);
      const statusFile = path.join(dir, '_project', 'STATUS.md');
      const statusMtime = existsSync(statusFile) ? statSync(statusFile).mtimeMs : null;
      return {
        card: await buildCard(dir),
        projectJson: files.projectJson,
        status: files.status,
        statusMtime,
      };
    });

    app.get('/api/projects/:id/tree', async (req) =>
      listTree(dirOf(req.params), PathQuery.parse(req.query).path),
    );

    // @ mentions in the composer (V2.1 w7.2).
    app.get('/api/projects/:id/files/search', async (req) => {
      const { q } = z.object({ q: z.string().max(200).default('') }).parse(req.query ?? {});
      return { files: searchFiles(dirOf(req.params), q) };
    });

    app.get('/api/projects/:id/file', async (req) =>
      readFileView(dirOf(req.params), PathQuery.parse(req.query).path),
    );

    app.put('/api/projects/:id/file', async (req) => {
      const body = z
        .object({
          path: z.string().min(1).max(4096),
          content: z.string().max(1024 * 1024),
          baseMtime: z.number(),
        })
        .parse(req.body);
      return writeFileView(dirOf(req.params), body.path, body.content, body.baseMtime);
    });

    app.get('/api/projects/:id/diff', async (req) =>
      fileDiff(dirOf(req.params), PathQuery.parse(req.query).path),
    );

    app.get('/api/projects/:id/docs', async (req) => listDocs(dirOf(req.params)));

    app.get('/api/projects/:id/git', async (req) => gitInfo.get(dirOf(req.params)));

    app.get('/api/projects/:id/changes', async (req) => {
      const status = await gitStatus(dirOf(req.params));
      return {
        entries: (status?.entries ?? []).map((e) => ({
          path: e.path.replace(/\/$/, ''),
          letter: e.letter,
        })),
      };
    });

    // Notes: the only file the UI writes directly (the user's own notes, docs/api.md).
    app.get('/api/projects/:id/notes', async (req) => {
      const file = path.join(dirOf(req.params), '_project', 'notes.md');
      if (!existsSync(file)) return { content: '', mtime: null };
      return { content: readFileSync(file, 'utf8'), mtime: statSync(file).mtimeMs };
    });

    app.put('/api/projects/:id/notes', async (req) => {
      const body = z
        .object({ content: z.string().max(1_000_000), baseMtime: z.number().nullable() })
        .parse(req.body);
      const file = path.join(dirOf(req.params), '_project', 'notes.md');
      const current = existsSync(file) ? statSync(file).mtimeMs : null;
      if (current !== null && body.baseMtime !== null && Math.abs(current - body.baseMtime) > 1) {
        throw conflict(
          'notes.md changed on disk since you opened it. Reload to see the new version.',
        );
      }
      writeFileAtomic(file, body.content);
      return { content: body.content, mtime: statSync(file).mtimeMs };
    });

    app.get('/api/projects/:id/tasks', async (req): Promise<TasksFile> =>
      readTasks(dirOf(req.params)),
    );

    app.patch('/api/projects/:id/tasks/:taskId', async (req) => {
      const { taskId } = z.object({ taskId: z.string() }).parse(req.params);
      const { status } = z.object({ status: TaskStatusSchema }).parse(req.body);
      const file = path.join(dirOf(req.params), '_project', 'tasks.json');
      if (!existsSync(file)) throw notFound('This project has no tasks.json');
      const tasks = TasksFileSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
      const task = tasks.tasks.find((t) => t.id === taskId);
      if (!task) throw notFound(`No task ${taskId}`);
      task.status = status;
      writeTasks(dirOf(req.params), tasks);
      // "Apply ADR-0012: …" done by hand: the decision is done too (ADR-0029).
      if (status === 'done') adrs?.taskDone(IdParams.parse(req.params).id, task.title);
      return readTasks(dirOf(req.params));
    });

    // Move to the next stage (V2.1 w5).
    app.patch('/api/projects/:id/phase', async (req) => {
      const { phase } = z.object({ phase: PhaseSchema }).parse(req.body);
      setPhase(dirOf(req.params), phase);
      return { ok: true, phase };
    });

    app.post('/api/projects/:id/tasks', async (req) =>
      addTask(dirOf(req.params), NewTaskSchema.parse(req.body).title),
    );

    app.post('/api/projects/:id/open-in-editor', async (req) => {
      const dir = dirOf(req.params);
      const { path: rel } = z
        .object({ path: z.string().max(4096).default('') })
        .parse(req.body ?? {});
      const target = resolveInside(dir, rel);
      return { ok: true, via: await openInEditor(target) };
    });
  };
}
