import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  ChangeInputSchema,
  CostInputSchema,
  DevGateSchema,
  NewVersionSchema,
  OfficeCreateSchema,
  OfficeSettingsSchema,
  OfficeStageSchema,
  SignOffInputSchema,
  TimeInputSchema,
} from '@cherry/shared';
import type { ConfigStore } from '../config.ts';
import type { Db } from '../db.ts';
import { projectUsage } from '../usage.ts';
import { stageDocs } from '../office/docs.ts';
import { history } from '../office/history.ts';
import type { OfficeService } from '../office/service.ts';
import { projectDir } from '../projects/workspace.ts';

const Id = z.object({ id: z.string().min(1).max(200) });
const StageParams = Id.extend({ stage: OfficeStageSchema });
const ItemParams = Id.extend({ item: z.string().min(1).max(40) });

/** The office of a project (V4, ADR-0052, ADR-0054). See docs/api.md, Office. */
export function officeRoutes(office: OfficeService, config: ConfigStore, db: Db) {
  return (app: FastifyInstance) => {
    const base = '/api/projects/:id/office';
    app.get(base, async (req) => ({ office: office.get(Id.parse(req.params).id) }));
    app.post(base, async (req) => ({
      office: office.create(Id.parse(req.params).id, OfficeCreateSchema.parse(req.body)),
    }));
    app.patch(base, async (req) => ({
      office: office.settings(Id.parse(req.params).id, OfficeSettingsSchema.parse(req.body)),
    }));

    app.get(`${base}/docs`, async (req) => {
      const { id } = Id.parse(req.params);
      const { stage } = z.object({ stage: OfficeStageSchema }).parse(req.query);
      return stageDocs(projectDir(config.projectsDir(), id), stage);
    });

    // The Claude usage tab (o12): the project's chat turns, by stage and by model.
    app.get('/api/projects/:id/usage', async (req) => {
      const { id } = Id.parse(req.params);
      projectDir(config.projectsDir(), id);
      return projectUsage(db, id);
    });

    // The Version control tab (o11): the project's commits, or one stage's.
    app.get('/api/projects/:id/git/history', async (req) => {
      const { id } = Id.parse(req.params);
      const { stage } = z.object({ stage: OfficeStageSchema.optional() }).parse(req.query);
      return { commits: await history(projectDir(config.projectsDir(), id), stage ?? null) };
    });

    app.post(`${base}/stages/:stage/ready`, async (req) => {
      const { id, stage } = StageParams.parse(req.params);
      const { ready } = z.object({ ready: z.boolean() }).parse(req.body);
      return { office: office.setReady(id, stage, ready) };
    });
    app.post(`${base}/stages/:stage/send`, async (req) => {
      const { id, stage } = StageParams.parse(req.params);
      return { office: office.send(id, stage) };
    });
    app.post(`${base}/stages/:stage/sign-off`, async (req) => {
      const { id, stage } = StageParams.parse(req.params);
      return { office: office.signOff(id, stage, SignOffInputSchema.parse(req.body ?? {})) };
    });
    app.post(`${base}/dev-gate`, async (req) => {
      const { gate } = z.object({ gate: DevGateSchema }).parse(req.body);
      return { office: office.devGate(Id.parse(req.params).id, gate) };
    });

    app.post(`${base}/changes`, async (req) => ({
      office: office.addChange(Id.parse(req.params).id, ChangeInputSchema.parse(req.body)),
    }));
    app.post(`${base}/changes/:item/:decision`, async (req) => {
      const { id, item } = ItemParams.parse(req.params);
      const { decision } = z.object({ decision: z.enum(['approve', 'reject']) }).parse(req.params);
      return { office: office.decideChange(id, item, decision === 'approve') };
    });

    app.post(`${base}/costs`, async (req) => ({
      office: office.addCost(Id.parse(req.params).id, CostInputSchema.parse(req.body)),
    }));
    app.delete(`${base}/costs/:item`, async (req) => {
      const { id, item } = ItemParams.parse(req.params);
      return { office: office.removeCost(id, item) };
    });
    app.post(`${base}/time`, async (req) => ({
      office: office.addTime(Id.parse(req.params).id, TimeInputSchema.parse(req.body)),
    }));
    app.delete(`${base}/time/:item`, async (req) => {
      const { id, item } = ItemParams.parse(req.params);
      return { office: office.removeTime(id, item) };
    });

    app.post(`${base}/versions`, async (req) => {
      const { version, title } = NewVersionSchema.parse(req.body);
      return { office: office.startVersion(Id.parse(req.params).id, version, title) };
    });
  };
}
