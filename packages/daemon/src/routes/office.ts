import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  ChangeInputSchema,
  CostInputSchema,
  DevGateInputSchema,
  NewVersionSchema,
  OfficeCreateSchema,
  OfficeSettingsSchema,
  OFFICE_STAGES,
  OFFICE_STAGE_LABEL,
  OfficeStageSchema,
  SignOffInputSchema,
  TimeInputSchema,
} from '@cherry/shared';
import type { ConfigStore } from '../config.ts';
import type { Db } from '../db.ts';
import { projectUsage } from '../usage.ts';
import { stageDocs } from '../office/docs.ts';
import { history } from '../office/history.ts';
import { meetingNotes, newNote, readVault } from '../office/vault.ts';
import type { OfficeService } from '../office/service.ts';
import { listScreens } from '../design/screens.ts';
import { writeHandoff } from '../design/handoff.ts';
import type { CommitService } from '../projects/commits.ts';
import { projectDir } from '../projects/workspace.ts';
import { noteInStatus } from '../office/status-note.ts';
import { notify, projectLink, type EventHub } from '../events.ts';

const Id = z.object({ id: z.string().min(1).max(200) });
const StageParams = Id.extend({ stage: OfficeStageSchema });
const ItemParams = Id.extend({ item: z.string().min(1).max(40) });

/** The office of a project (V4, ADR-0052, ADR-0054). See docs/api.md, Office. */
export function officeRoutes(
  office: OfficeService,
  config: ConfigStore,
  db: Db,
  commits: CommitService,
  hub: EventHub,
) {
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

    // The Docs tab (o14): the project's documents, never code.
    app.get(`${base}/vault`, async (req) =>
      readVault(projectDir(config.projectsDir(), Id.parse(req.params).id)),
    );
    app.post(`${base}/notes`, async (req) => {
      const { name } = z.object({ name: z.string().trim().min(1).max(80) }).parse(req.body);
      return newNote(projectDir(config.projectsDir(), Id.parse(req.params).id), name);
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
      const input = SignOffInputSchema.parse(req.body ?? {});
      const signed = office.signOff(id, stage, input);
      // One gate in Design (finding #35): its sign-off writes the handoff for the Development
      // Team, as Approve design did in V3. A design with no screens hands over its docs only.
      const dir = projectDir(config.projectsDir(), id);
      const handoff = stage === 'design' && listScreens(dir).length ? writeHandoff(dir).files : [];
      // Cherry, not a model, notes it in STATUS.md and commits the documents (#36, #37).
      const cycle = signed.cycles[signed.cycles.length - 1]!;
      const rec = cycle.stages[stage];
      const by = rec.signOffs[rec.signOffs.length - 1]!;
      const next = OFFICE_STAGES[OFFICE_STAGES.indexOf(stage) + 1];
      const who = by.internal ? 'internal' : `approved by ${by.by}`;
      noteInStatus(
        dir,
        `${OFFICE_STAGE_LABEL[stage]} signed off (${who}).${
          stage === 'deployment'
            ? ' The project is live.'
            : next
              ? ` ${OFFICE_STAGE_LABEL[next]} is open.`
              : ''
        }`,
      );
      let commit: { hash: string; message: string } | null = null;
      let warning: string | null = null;
      if (input.commit) {
        try {
          const files = await commits.changedDocs(id);
          if (files.length)
            commit = await commits.commitFiles(
              id,
              `docs: sign off ${OFFICE_STAGE_LABEL[stage]} (v${cycle.version})\n\n${by.internal ? 'Signed off internally' : `Approved by ${by.by}`} on ${by.date}.${by.notes ? `\n\n${by.notes}` : ''}`,
              files,
            );
        } catch (e) {
          warning = `Signed off, but not committed: ${e instanceof Error ? e.message : String(e)}`;
        }
        if (commit || warning)
          notify(hub, {
            projectId: id,
            kind: commit ? 'commit.done' : 'commit.failed',
            title: commit
              ? `${OFFICE_STAGE_LABEL[stage]} signed off and committed (${commit.hash})`
              : `${OFFICE_STAGE_LABEL[stage]} signed off, not committed`,
            body: commit ? commit.message : warning!,
            link: projectLink(id, '/vc'),
          });
      }
      return { office: signed, handoff, commit, warning };
    });
    app.post(`${base}/dev-gate`, async (req) => {
      const { gate, ...approval } = DevGateInputSchema.parse(req.body);
      return { office: office.devGate(Id.parse(req.params).id, gate, approval) };
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
    app.patch(`${base}/costs/:item`, async (req) => {
      const { id, item } = ItemParams.parse(req.params);
      const { bill } = z.object({ bill: z.boolean() }).parse(req.body);
      return { office: office.billCost(id, item, bill) };
    });
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

    // The Meeting tab (o16): action items, and the notes saved as a document.
    const Owner = z.union([z.literal('you'), OfficeStageSchema]);
    app.post(`${base}/actions`, async (req) => {
      const { text, owner } = z
        .object({ text: z.string().trim().min(1).max(300), owner: Owner.default('you') })
        .parse(req.body);
      return { office: office.addAction(Id.parse(req.params).id, text, owner) };
    });
    app.patch(`${base}/actions/:item`, async (req) => {
      const { id, item } = ItemParams.parse(req.params);
      const { done } = z.object({ done: z.boolean() }).parse(req.body);
      return { office: office.setAction(id, item, done) };
    });
    app.delete(`${base}/actions/:item`, async (req) => {
      const { id, item } = ItemParams.parse(req.params);
      return { office: office.removeAction(id, item) };
    });
    app.post(`${base}/meeting-notes`, async (req) => {
      const { text } = z.object({ text: z.string().min(1).max(100_000) }).parse(req.body);
      return meetingNotes(projectDir(config.projectsDir(), Id.parse(req.params).id), text);
    });

    app.post(`${base}/versions`, async (req) => {
      const { version, title } = NewVersionSchema.parse(req.body);
      return { office: office.startVersion(Id.parse(req.params).id, version, title) };
    });
  };
}
