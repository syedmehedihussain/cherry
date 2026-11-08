import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import {
  localDay,
  type ActionItem,
  OFFICE_STAGES,
  OFFICE_STAGE_LABEL,
  OfficeFileSchema,
  type ChangeInput,
  type CostInput,
  type Cycle,
  type DevGate,
  type DevGateApproval,
  type OfficeCreate,
  type OfficeFile,
  type OfficeStage,
  type SignOffInput,
  type StageModel,
  type StageRecord,
  type TimeInput,
} from '@cherry/shared';
import type { ConfigStore } from '../config.ts';
import type { EventHub } from '../events.ts';
import { readJsonFile, writeFileAtomic } from '../fsutil.ts';
import { badRequest, conflict, HttpError, notFound } from '../http.ts';
import { needsGitExclude } from '../projects/standard.ts';
import { projectDir } from '../projects/workspace.ts';

const DEFAULT_RATE = 25;
const DEFAULT_BUDGET = 6_000_000;

const today = () => localDay();
const label = (s: OfficeStage) => OFFICE_STAGE_LABEL[s];
const newId = (prefix: string) => `${prefix}_${randomBytes(4).toString('hex')}`;

function record(state: StageRecord['state']): StageRecord {
  return { state, ready: false, sentAt: null, signOffs: [] };
}

function newCycle(version: string, title: string, first: OfficeStage): Cycle {
  const at = OFFICE_STAGES.indexOf(first);
  const stages = Object.fromEntries(
    OFFICE_STAGES.map((s, i) => [s, record(i < at ? 'carried' : i === at ? 'active' : 'locked')]),
  ) as Cycle['stages'];
  return {
    version,
    title,
    stages,
    devGate: 'build',
    prototypeReady: false,
    startedAt: new Date().toISOString(),
    liveAt: null,
  };
}

/**
 * The office of each project (ADR-0052, ADR-0054): stage states, sign-offs, change requests,
 * versions, costs and time, in `_project/office.json`. Every change here comes from a user action
 * through the API; nothing calls a model (ADR-0055).
 */
export class OfficeService {
  constructor(
    private readonly config: ConfigStore,
    private readonly hub: EventHub,
    /** Refreshes the project cards (the Projects page shows each office). */
    private readonly onChange: () => void = () => undefined,
  ) {}

  private file(id: string): string {
    return path.join(projectDir(this.config.projectsDir(), id), '_project', 'office.json');
  }

  /** The office, or null when it has not been started for this project. */
  get(id: string): OfficeFile | null {
    const file = this.file(id);
    if (!existsSync(file)) return null;
    let raw: unknown;
    try {
      raw = readJsonFile(file);
    } catch {
      raw = null;
    }
    const parsed = OfficeFileSchema.safeParse(raw);
    // Keep a broken file instead of overwriting it.
    if (!parsed.success)
      throw new HttpError(
        500,
        'office_invalid',
        `_project/office.json is not valid. Fix or remove it.`,
      );
    return parsed.data;
  }

  private save(id: string, office: OfficeFile): OfficeFile {
    const file = this.file(id);
    mkdirSync(path.dirname(file), { recursive: true });
    const dir = path.dirname(path.dirname(file));
    // _project/ is personal state and stays out of git (cctop standard, ADR-0054).
    if (needsGitExclude(dir)) {
      const exclude = path.join(dir, '.git', 'info', 'exclude');
      mkdirSync(path.dirname(exclude), { recursive: true });
      appendFileSync(exclude, '\n_project/\n');
    }
    office.updatedAt = new Date().toISOString();
    writeFileAtomic(file, `${JSON.stringify(office, null, 2)}\n`, 0o600);
    this.hub.publish(`project:${id}`, 'office.updated', { projectId: id, office });
    this.onChange();
    return office;
  }

  private change(id: string, fn: (office: OfficeFile, cycle: Cycle) => void): OfficeFile {
    const office = this.get(id);
    if (!office) throw notFound('Start the office for this project first.');
    fn(office, office.cycles[office.cycles.length - 1]!);
    return this.save(id, office);
  }

  create(id: string, input: OfficeCreate & { kind: 'client' | 'personal' }): OfficeFile {
    if (this.get(id)) throw conflict('This project already has an office.');
    const now = new Date().toISOString();
    const office: OfficeFile = {
      schema: 1,
      kind: input.kind,
      client:
        input.kind === 'client'
          ? { name: input.client.name, contact: input.client.contact ?? '' }
          : null,
      rate: DEFAULT_RATE,
      currency: 'USD',
      budgetTokens: DEFAULT_BUDGET,
      cycles: [newCycle('1.0', '', 'idea')],
      changes: [],
      changelog: [],
      costs: [],
      time: [],
      actions: [],
      models: {},
      createdAt: now,
      updatedAt: now,
    };
    return this.save(id, office);
  }

  settings(
    id: string,
    patch: Partial<Pick<OfficeFile, 'rate' | 'currency' | 'budgetTokens'>> & {
      client?: { name: string; contact: string };
      models?: Partial<Record<OfficeStage, StageModel | null>>;
    },
  ): OfficeFile {
    return this.change(id, (o) => {
      if (patch.client) {
        if (o.kind === 'personal') throw badRequest('A personal project has no client.');
        o.client = patch.client;
      }
      if (patch.rate !== undefined) o.rate = patch.rate;
      if (patch.currency !== undefined) o.currency = patch.currency;
      if (patch.budgetTokens !== undefined) o.budgetTokens = patch.budgetTokens;
      for (const [stage, model] of Object.entries(patch.models ?? {}) as [
        OfficeStage,
        StageModel | null,
      ][]) {
        if (model) o.models[stage] = model;
        else delete o.models[stage];
      }
    });
  }

  /** The agent says the stage is ready, or the user takes that back. */
  setReady(id: string, stage: OfficeStage, ready: boolean): OfficeFile {
    return this.change(id, (_, c) => {
      const r = c.stages[stage];
      if (!['active', 'waiting', 'update'].includes(r.state))
        throw conflict(`${label(stage)} is not open.`);
      // Before the prototype is approved, Development's "ready" is the prototype (#41); the
      // stage itself is ready only after the full build.
      if (stage === 'development' && c.devGate !== 'approved') c.prototypeReady = ready;
      else r.ready = ready;
    });
  }

  /** Sent to the client: the stage waits for the approval. */
  send(id: string, stage: OfficeStage): OfficeFile {
    return this.change(id, (o, c) => {
      if (o.kind === 'personal') throw badRequest('A personal project has no client to wait for.');
      const r = c.stages[stage];
      if (r.state !== 'active') throw conflict(`${label(stage)} is not open.`);
      if (!r.ready) throw conflict(`The agent has not said ${label(stage)} is ready yet.`);
      r.state = 'waiting';
      r.sentAt = new Date().toISOString();
    });
  }

  signOff(
    id: string,
    stage: OfficeStage,
    input: Required<Omit<SignOffInput, 'date'>> & { date?: string },
  ): OfficeFile {
    return this.change(id, (o, c) => {
      const r = c.stages[stage];
      if (r.state === 'locked') throw conflict(`${label(stage)} is not open yet.`);
      if (r.state === 'signed' || r.state === 'carried')
        throw conflict(`${label(stage)} is already signed off.`);
      if (!r.ready) throw conflict(`The agent has not said ${label(stage)} is ready yet.`);
      if (stage === 'development' && c.devGate !== 'approved')
        throw conflict('The prototype must be approved before Development is signed off.');
      const personal = o.kind === 'personal';
      const internal = personal || input.internal;
      if (!internal && !input.by) throw badRequest('Who approved it?');
      const wasUpdate = r.state === 'update';
      r.signOffs.push({
        by: personal ? 'you' : internal ? input.by || 'you' : input.by,
        date: input.date ?? today(),
        notes: input.notes,
        internal,
        at: new Date().toISOString(),
      });
      r.state = 'signed';
      r.sentAt = null;
      if (wasUpdate) return;
      const next = OFFICE_STAGES[OFFICE_STAGES.indexOf(stage) + 1];
      if (next && c.stages[next].state === 'locked') c.stages[next] = record('active');
      if (stage === 'deployment') c.liveAt = new Date().toISOString();
    });
  }

  /** Development's inside gate: build, sent to the client, approved. */
  devGate(id: string, gate: DevGate, approval?: DevGateApproval): OfficeFile {
    return this.change(id, (o, c) => {
      const r = c.stages.development;
      if (!['active', 'waiting'].includes(r.state)) throw conflict('Development is not open.');
      const allowed: Record<DevGate, DevGate[]> = {
        build: ['sent', ...(o.kind === 'personal' ? (['approved'] as const) : [])],
        sent: ['approved', 'build'],
        approved: [],
      };
      if (!allowed[c.devGate].includes(gate))
        throw conflict(`The prototype cannot go from ${c.devGate} to ${gate}.`);
      if (gate === 'sent' && o.kind === 'personal')
        throw badRequest('A personal project has no client.');
      c.devGate = gate;
      // Client wants changes: the next prototype has to be made ready again.
      if (gate === 'build') c.prototypeReady = false;
      // The client's approval, as for a stage sign-off (#42): who, when, notes, in the log.
      if (gate === 'approved' && o.kind === 'client') {
        if (!approval?.by) throw badRequest('Who approved it?');
        const notes = approval.notes.trim();
        o.changelog.unshift({
          at: new Date().toISOString(),
          stage: 'development',
          text: `Prototype approved by ${approval.by} on ${approval.date ?? today()}${notes ? `: ${notes}` : '.'}`,
        });
      }
    });
  }

  addChange(id: string, input: ChangeInput): OfficeFile {
    return this.change(id, (o, c) => {
      const at = new Date().toISOString();
      if (input.kind === 'small') {
        if (c.stages[input.stage].state === 'locked')
          throw conflict(`${label(input.stage)} is not open yet.`);
        o.changelog.unshift({ at, stage: input.stage, text: input.text });
        return;
      }
      const n = o.changes.length + 1;
      o.changes.unshift({
        id: `CR-${String(n).padStart(3, '0')}`,
        title: input.title,
        text: input.text,
        status: 'proposed',
        stages: [...new Set(input.stages)],
        createdAt: at,
        decidedAt: null,
      });
    });
  }

  /** Approving a change request flags its signed-off stages as needing an update. */
  decideChange(id: string, crId: string, approve: boolean): OfficeFile {
    return this.change(id, (o, c) => {
      const cr = o.changes.find((x) => x.id === crId);
      if (!cr) throw notFound(`No change request ${crId}.`);
      if (cr.status !== 'proposed') throw conflict(`${crId} is already ${cr.status}.`);
      cr.status = approve ? 'approved' : 'rejected';
      cr.decidedAt = new Date().toISOString();
      if (!approve) return;
      for (const s of cr.stages) {
        const r = c.stages[s];
        if (r.state === 'signed') {
          r.state = 'update';
          r.ready = false;
        }
      }
    });
  }

  addCost(id: string, input: Required<CostInput>): OfficeFile {
    return this.change(id, (o) => {
      o.costs.push({
        id: newId('cost'),
        ...input,
        bill: o.kind === 'personal' ? false : input.bill,
        addedAt: new Date().toISOString(),
      });
    });
  }

  /** Bill a cost to the client, or not (a personal project never bills). */
  billCost(id: string, costId: string, bill: boolean): OfficeFile {
    return this.change(id, (o) => {
      const c = o.costs.find((x) => x.id === costId);
      if (!c) throw notFound('That cost is gone.');
      if (o.kind === 'personal' && bill) throw badRequest('A personal project has no client.');
      c.bill = bill;
    });
  }

  removeCost(id: string, costId: string): OfficeFile {
    return this.change(id, (o) => {
      const next = o.costs.filter((x) => x.id !== costId);
      if (next.length === o.costs.length) throw notFound('That cost is gone.');
      o.costs = next;
    });
  }

  addTime(id: string, input: TimeInput & { hours: number }): OfficeFile {
    return this.change(id, (o) => {
      o.time.push({
        id: newId('time'),
        stage: input.stage ?? null,
        hours: input.hours,
        note: input.note ?? '',
        date: input.date ?? today(),
      });
    });
  }

  removeTime(id: string, timeId: string): OfficeFile {
    return this.change(id, (o) => {
      const next = o.time.filter((x) => x.id !== timeId);
      if (next.length === o.time.length) throw notFound('That time entry is gone.');
      o.time = next;
    });
  }

  addAction(id: string, text: string, owner: ActionItem['owner']): OfficeFile {
    return this.change(id, (o) => {
      o.actions.push({ id: newId('act'), text, owner, done: false, at: new Date().toISOString() });
    });
  }

  setAction(id: string, actionId: string, done: boolean): OfficeFile {
    return this.change(id, (o) => {
      const a = o.actions.find((x) => x.id === actionId);
      if (!a) throw notFound('That action item is gone.');
      a.done = done;
    });
  }

  removeAction(id: string, actionId: string): OfficeFile {
    return this.change(id, (o) => {
      const next = o.actions.filter((x) => x.id !== actionId);
      if (next.length === o.actions.length) throw notFound('That action item is gone.');
      o.actions = next;
    });
  }

  /** Start v2.0 next to the live version: Idea carries over, Requirements opens. */
  startVersion(id: string, version: string, title: string): OfficeFile {
    return this.change(id, (o, c) => {
      if (!c.liveAt) throw conflict(`Version ${c.version} is not live yet.`);
      if (o.cycles.some((x) => x.version === version)) throw conflict(`Version ${version} exists.`);
      o.cycles.push(newCycle(version, title, 'requirements'));
    });
  }
}
