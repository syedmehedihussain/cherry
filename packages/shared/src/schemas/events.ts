import { z } from 'zod';
import { ProjectCardSchema } from './project.ts';
import { HealthSchema } from './system.ts';
import type { Approval, ChatItem, PlanItem } from './chat.ts';
import type { CalibrationState } from './calibration.ts';
import type { GitResult } from './workspace.ts';
import type { Agent } from './agent.ts';
import type { RunState } from './run.ts';
import type { BrowserTest, Checks } from './deploy.ts';
import type { AutopilotState } from './autopilot.ts';
import type { Stage } from './common.ts';

export type NoticeKind =
  | 'agent.done'
  | 'agent.failed'
  | 'agent.needs'
  | 'scan.done'
  | 'scan.failed'
  | 'decision.proposed'
  | 'chat.done'
  | 'chat.failed'
  | 'issue.sent'
  | 'issue.failed'
  | 'test.done'
  | 'test.failed'
  | 'autopilot.done'
  | 'autopilot.failed';

/** A short message about work that ended; `link` is the web route that shows it. */
export interface Notice {
  projectId: string;
  kind: NoticeKind;
  title: string;
  body: string;
  link: string;
}

/** Client → server over /ws. */
export const ClientMessageSchema = z.object({
  type: z.literal('subscribe'),
  topics: z.array(z.string().max(200)).max(50),
});
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

/**
 * Server → client events. Each has a topic (who receives it) and a payload. Later milestones add
 * more event types here.
 */
export interface EventMap {
  'projects.updated': { cards: z.infer<typeof ProjectCardSchema>[] };
  'health.updated': z.infer<typeof HealthSchema>;
  /** Files changed on disk in a project (tree, git, open file may be stale). */
  'project.changed': { projectId: string; paths: string[] };
  /** A transcript item was added or changed (upsert by id). */
  'chat.item': { projectId: string; stage: Stage; conversationId: string; item: ChatItem };
  /** Streaming text appended to a text item. */
  'chat.delta': {
    projectId: string;
    stage: Stage;
    conversationId: string;
    itemId: string;
    turnId: string;
    text: string;
  };
  /** A turn started or stopped; also sent when the conversation is replaced. */
  'chat.state': {
    projectId: string;
    stage: Stage;
    conversationId: string | null;
    running: boolean;
    turnId: string | null;
    touched: string[];
  };
  /** Claude's plan changed (a task was added, started or finished). */
  'chat.plan': { projectId: string; stage: Stage; conversationId: string; plan: PlanItem[] };
  /** A rewind cut the chat (V2.1 w7.9): reload it. */
  'chat.rewound': { projectId: string; stage: Stage; conversationId: string };
  'calibrate.updated': { projectId: string; state: CalibrationState };
  /** Pull or Push finished (Push runs after its approval). */
  'git.result': { projectId: string } & GitResult;
  /** An agent was added or changed (upsert by id). */
  'agent.updated': { projectId: string; agent: Agent };
  /** A project decision was proposed, approved, rejected or done (ADR-0026). */
  'decisions.updated': { projectId: string };
  /** A scan agent started, made progress, or saved a report. */
  'scan.updated': { projectId: string; agentId: string };
  /** Magnet's conversation (topic "magnet"). */
  /** scope: `home`, or `project:<id>` for a project's side Chat tab (ADR-0039). */
  'magnet.item': { scope: string; conversationId: string; item: ChatItem };
  'magnet.delta': { scope: string; conversationId: string; itemId: string; text: string };
  'magnet.state': { scope: string; conversationId: string | null; running: boolean };
  /** The project's app started, stopped or printed its address (no output, no other servers). */
  'run.state': { projectId: string; state: Omit<RunState, 'output' | 'servers'> };
  /** New output from the project's app. */
  'run.output': { projectId: string; text: string };
  /** A check in the Deployment cockpit started or finished (V3 r10). */
  'checks.updated': { projectId: string; checks: Checks };
  /** Autopilot asked, flew a step, or landed (ADR-0046). */
  'autopilot.updated': { projectId: string; state: AutopilotState };
  /** The browser test moved on (V3 r11). */
  'browsertest.updated': { projectId: string; test: BrowserTest };
  /** Something finished or needs you, for desktop notifications (topic "notices"). */
  notice: Notice;
  'approval.requested': { approval: Approval };
  'approval.resolved': { approval: Approval };
}
export type EventType = keyof EventMap;
export type ServerEvent = {
  [K in EventType]: { type: K; at: number } & EventMap[K];
}[EventType];
