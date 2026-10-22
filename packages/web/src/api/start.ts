import { StartProjectResultSchema, type StartProject } from '@cherry/shared';
import { api } from './client.ts';

/** Start project (ADR-0036): makes the folder and adds it to Cherry's list. */
export const startProject = (body: StartProject) =>
  api('POST', '/api/projects/start', body, StartProjectResultSchema);
