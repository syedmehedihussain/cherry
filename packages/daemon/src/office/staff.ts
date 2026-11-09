import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import {
  OFFICE_AGENT,
  OFFICE_STAGES,
  OFFICE_STAGE_LABEL,
  type OfficeFile,
  type OfficeStage,
  type Stage,
} from '@cherry/shared';
import type { CustomTool } from '../claude/runner.ts';
import { frontMatter } from '../projects/status.ts';
import type { OfficeService } from './service.ts';

export const STAGE_READY_TOOL = 'stage_ready';

export const isOfficeStage = (s: Stage): s is OfficeStage =>
  (OFFICE_STAGES as readonly string[]).includes(s);

/** `business-analyst` for the Business Analyst: the staff file name. */
export const staffSlug = (stage: OfficeStage) =>
  OFFICE_AGENT[stage].toLowerCase().replace(/[^a-z]+/g, '-');

/**
 * The user's own version of a staff agent, `~/.cherry/staff/<slug>.md` (o17 edits it in
 * Settings, Agents). Its body replaces the bundled persona. Null when there is none.
 */
export function staffOverride(home: string, stage: OfficeStage): string | null {
  const file = path.join(home, 'staff', `${staffSlug(stage)}.md`);
  if (!existsSync(file)) return null;
  try {
    const body = frontMatter(readFileSync(file, 'utf8')).body.trim();
    return body || null;
  } catch {
    return null;
  }
}

/** Added to a stage chat when the project has an office (V4, ADR-0052). */
export function officeBrief(stage: OfficeStage, office: OfficeFile): string {
  const cycle = office.cycles[office.cycles.length - 1]!;
  const state = cycle.stages[stage].state;
  const earlier = OFFICE_STAGES.slice(0, OFFICE_STAGES.indexOf(stage))
    .filter((s) => ['signed', 'carried', 'update'].includes(cycle.stages[s].state))
    .map((s) => `docs/${s}/`);
  const personal = office.kind === 'personal';
  return [
    '',
    `## The office (V4)`,
    `This project runs as a software company${personal ? ' (a personal project: the user is the client)' : `, for the client ${office.client?.name ?? ''}`}. You are the **${OFFICE_AGENT[stage]}**, the staff member for the ${OFFICE_STAGE_LABEL[stage]} stage of version ${cycle.version}. The stage is ${state}.`,
    '- Work only on the job the user gives you. Do not start other work, and do not hand work to another stage.',
    '- Finish the job you were given in this turn: write every document it needs, one after the other. Stop early only when you need an answer from the user or the client; then say which documents are left and what they wait for.',
    '- Start every job with TaskCreate, one task per step, and tick them off as you go. Ask the user only through ask_decision cards, one per question. Change files with Edit or Write, not sed or here-docs.',
    `- Write ${personal ? 'a plain summary' : 'client documents'} in docs/${stage}/client/ (plain language, no code${personal ? '' : ', for the client to read and approve'}) and technical documents in docs/${stage}/technical/ (for the next agents). ADRs stay in docs/adr/.`,
    earlier.length
      ? `- The signed-off stages before you are in ${earlier.join(', ')}. Read what you need; do not change them. If they must change, tell the user: that is a change request.`
      : '- You are the first stage.',
    `- When the stage's work is complete and the user agrees, say it in one line (for example "${OFFICE_STAGE_LABEL[stage]} is ready. We can start the next stage.") and call ${STAGE_READY_TOOL}. The user signs the stage off${personal ? '' : ' after the client approves it'}.`,
    ...(stage === 'development' && cycle.devGate !== 'approved'
      ? [
          office.cycles.length > 1
            ? `- The app exists from version ${office.cycles[office.cycles.length - 2]!.version}. The first working build of this version's change is the prototype: when it is ready to try, say so and call ${STAGE_READY_TOOL}; that marks the prototype ready, not the stage. After the ${personal ? 'user' : 'client'} approves it, finish the version, run the stage's required checks, and call ${STAGE_READY_TOOL} again.`
            : `- First build the prototype (project setup and a clickable prototype with sample data). When it is ready to try, say so and call ${STAGE_READY_TOOL}: before the ${personal ? 'user' : 'client'} approves the prototype, that marks the prototype ready, not the stage. After the approval, build the rest and call ${STAGE_READY_TOOL} again when the app is complete.`,
        ]
      : []),
    ...(state === 'update'
      ? [
          '- This stage needs an update for an approved change request. Read it in _project/office.json (changes), update your documents, then call stage_ready.',
        ]
      : []),
  ].join('\n');
}

/** The agent says the stage is ready; the user still signs it off. */
export function stageReadyTool(
  office: OfficeService,
  projectId: string,
  stage: OfficeStage,
  /** The stage's required specialist checks still missing, or null (ADR-0062). */
  missing?: () => string | null,
): CustomTool {
  return {
    name: STAGE_READY_TOOL,
    description: `Tell Cherry that the ${OFFICE_STAGE_LABEL[stage]} stage is complete. The user then reviews it and signs it off. Call it only when the stage's documents are written and the user agrees.`,
    shape: { ready: z.boolean().optional().describe('false takes it back') },
    handler: async (args) => {
      const ready = (args as { ready?: boolean }).ready !== false;
      try {
        // The prototype is shown before the full build; the checks come before the stage is done.
        const early =
          stage === 'development' && office.get(projectId)?.cycles.at(-1)?.devGate !== 'approved';
        const gap = ready && !early ? (missing?.() ?? null) : null;
        if (gap) return { ok: false, text: gap };
        const o = office.setReady(projectId, stage, ready);
        const prototype =
          stage === 'development' && o.cycles[o.cycles.length - 1]!.devGate !== 'approved';
        return {
          ok: true,
          text: !ready
            ? 'Taken back.'
            : prototype
              ? `Marked the prototype ready, not the stage. ${o.kind === 'personal' ? 'The user approves it' : 'The user shows it to the client'} in the Development room; after the approval, finish the work and call stage_ready again.`
              : 'Marked ready. The user can sign it off now.',
        };
      } catch (e) {
        return { ok: false, text: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}
